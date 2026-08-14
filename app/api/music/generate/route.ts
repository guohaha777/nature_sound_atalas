import { buildFunMusicPromptV2, FUN_MUSIC_PROMPT_VERSION, musicPolishBriefSchema } from "@/src/features/music-polish";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export async function POST(request: Request) {
  const parsed = musicPolishBriefSchema.safeParse((await request.json().catch(() => null) as { brief?: unknown } | null)?.brief);
  if (!parsed.success) return Response.json({ message: "作品编排摘要无效，无法生成背景层。" }, { status: 400 });

  const apiKey = process.env.FUN_MUSIC_API_KEY?.trim();
  const endpoint = process.env.FUN_MUSIC_API_ENDPOINT?.trim();
  const allowedUserId = process.env.FUN_MUSIC_ALLOWED_USER_ID?.trim();
  if (!apiKey || !endpoint) return Response.json({ message: "Fun-Music API 尚未配置，请联系演示管理员。" }, { status: 503 });
  if (allowedUserId) {
    const user = await getChatGPTUser();
    if (!user || user.userId !== allowedUserId) return Response.json({ message: "当前访客没有使用 AI 音乐额度的权限。" }, { status: 403 });
  }
  if (!isAllowedEndpoint(endpoint)) return Response.json({ message: "Fun-Music 服务地址配置无效。" }, { status: 500 });

  const admission = admitMusicGeneration(request);
  if (!admission.ok) {
    return Response.json(
      { message: admission.message },
      { status: 429, headers: { "Retry-After": String(admission.retryAfterSeconds) } },
    );
  }

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.FUN_MUSIC_MODEL?.trim() || "fun-music-preview",
        input: { prompt: buildFunMusicPromptV2(parsed.data), is_instrumental: true, format: "mp3", enable_aigc_watermark: false },
      }),
      signal: AbortSignal.timeout(180_000),
    });
    const result = await upstream.json().catch(() => null) as FunMusicUpstreamResponse | null;
    if (!upstream.ok || !result?.output?.audio?.url || !result.output.audio.id || !result.output.audio.expires_at) {
      return Response.json({ message: upstream.status === 401 || upstream.status === 403 ? "Fun-Music API 鉴权失败，请检查 Key 和邀测权限。" : "Fun-Music 没有返回可播放音频，请稍后重试。" }, { status: 502 });
    }
    const durationSeconds = result.usage?.duration;
    const channels = result.output.extra_info?.channels;
    const sampleRate = Number(result.output.extra_info?.sample_rate);
    if (result.output.finish_reason !== "stop" || !durationSeconds || !channels || !Number.isFinite(sampleRate) || sampleRate <= 0) {
      return Response.json({ message: "Fun-Music 返回的音频信息不完整，已停止使用这层背景。" }, { status: 502 });
    }
    const audioUrl = normalizeAudioUrl(result.output.audio.url);
    if (!audioUrl) return Response.json({ message: "Fun-Music 返回了不受信任的音频地址。" }, { status: 502 });
    return Response.json({
      audioUrl,
      audioId: result.output.audio.id,
      expiresAt: result.output.audio.expires_at,
      requestId: result.request_id ?? crypto.randomUUID(),
      provider: "aliyun-bailian",
      model: "fun-music-preview",
      promptVersion: FUN_MUSIC_PROMPT_VERSION,
      generatedDurationSeconds: durationSeconds,
      channels,
      sampleRate,
      instrumentalModeRequested: true,
    });
  } catch (error) {
    return Response.json({ message: error instanceof DOMException && error.name === "TimeoutError" ? "Fun-Music 生成超时，请稍后重试。" : "暂时无法连接 Fun-Music 服务。" }, { status: 502 });
  } finally {
    admission.release();
  }
}

type MusicRateState = {
  day: string;
  dailyCount: number;
  attempts: Map<string, number[]>;
  activeClients: Set<string>;
  activeTotal: number;
};

const RATE_WINDOW_MS = 60 * 60 * 1000;
const PER_CLIENT_LIMIT = 3;
const DAILY_INSTANCE_LIMIT = 30;
const MAX_INSTANCE_CONCURRENCY = 3;

function musicRateState(): MusicRateState {
  const scope = globalThis as typeof globalThis & { __wanwuMusicRateState?: MusicRateState };
  const today = new Date().toISOString().slice(0, 10);
  if (!scope.__wanwuMusicRateState || scope.__wanwuMusicRateState.day !== today) {
    scope.__wanwuMusicRateState = { day: today, dailyCount: 0, attempts: new Map(), activeClients: new Set(), activeTotal: 0 };
  }
  return scope.__wanwuMusicRateState;
}

function admitMusicGeneration(request: Request):
  | { ok: true; release: () => void }
  | { ok: false; message: string; retryAfterSeconds: number } {
  const state = musicRateState();
  const client = clientIdentifier(request);
  const now = Date.now();
  const recent = (state.attempts.get(client) ?? []).filter((time) => now - time < RATE_WINDOW_MS);
  state.attempts.set(client, recent);

  if (state.activeClients.has(client)) return { ok: false, message: "已有一首 AI 背景正在生成，请完成后再试。", retryAfterSeconds: 15 };
  if (state.activeTotal >= MAX_INSTANCE_CONCURRENCY) return { ok: false, message: "当前生成任务较多，请稍后再试。", retryAfterSeconds: 30 };
  if (recent.length >= PER_CLIENT_LIMIT) {
    const retryAfterSeconds = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - recent[0])) / 1000));
    return { ok: false, message: "生成次数较多，请稍后再试。", retryAfterSeconds };
  }
  if (state.dailyCount >= DAILY_INSTANCE_LIMIT) return { ok: false, message: "今日 Fun-Music 体验额度已用完，将尝试智能音符背景。", retryAfterSeconds: 3600 };

  recent.push(now);
  state.dailyCount += 1;
  state.activeClients.add(client);
  state.activeTotal += 1;
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      state.activeClients.delete(client);
      state.activeTotal = Math.max(0, state.activeTotal - 1);
    },
  };
}

function clientIdentifier(request: Request) {
  return request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown-client";
}

function normalizeAudioUrl(value: string) {
  try {
    const url = new URL(value);
    if (!url.hostname.endsWith(".oss-cn-beijing.aliyuncs.com")) return null;
    url.protocol = "https:";
    return url.toString();
  } catch {
    return null;
  }
}

function isAllowedEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".maas.aliyuncs.com") && url.pathname === "/api/v1/services/audio/music/generation";
  } catch {
    return false;
  }
}

interface FunMusicUpstreamResponse {
  request_id?: string;
  output?: {
    audio?: { url?: string; id?: string; expires_at?: number };
    extra_info?: { channels?: number; sample_rate?: number | string; lyrics?: string };
    finish_reason?: string | null;
  };
  usage?: { duration?: number };
}
