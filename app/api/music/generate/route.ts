import { musicPolishBriefSchema } from "@/src/features/music-polish";
import { buildFunMusicPromptV2, FUN_MUSIC_PROMPT_VERSION } from "@/src/prompts";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { admitRequest } from "@/src/services/api-rate-limit";

export async function POST(request: Request) {
  const parsed = musicPolishBriefSchema.safeParse((await request.json().catch(() => null) as { brief?: unknown } | null)?.brief);
  if (!parsed.success) return Response.json({ message: "作品编排摘要无效，无法生成背景层。" }, { status: 400 });

  const apiKey = process.env.FUN_MUSIC_API_KEY?.trim();
  const endpoint = process.env.FUN_MUSIC_API_ENDPOINT?.trim();
  const model = process.env.FUN_MUSIC_MODEL?.trim() || "fun-music-preview";
  const allowedUserId = process.env.FUN_MUSIC_ALLOWED_USER_ID?.trim();
  if (!apiKey || !endpoint) return Response.json({ message: "这台设备还没有开通 AI 背景音乐。" }, { status: 503 });
  if (allowedUserId) {
    const user = await getChatGPTUser();
    if (!user || user.userId !== allowedUserId) return Response.json({ message: "当前访客没有使用 AI 音乐额度的权限。" }, { status: 403 });
  }
  if (!isAllowedEndpoint(endpoint)) return Response.json({ message: "Fun-Music 服务地址配置无效。" }, { status: 500 });

  const admission = admitRequest(request, FUN_MUSIC_RATE_LIMIT);
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
        model,
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
      model,
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

const FUN_MUSIC_RATE_LIMIT = {
  scope: "fun-music",
  perClientLimit: 3,
  dailyLimit: 30,
  maxConcurrency: 3,
  singleFlightPerClient: true,
  messages: {
    perClient: "生成次数较多，请稍后再试。",
    daily: "今日 Fun-Music 体验额度已用完，将尝试智能音符背景。",
    concurrency: "当前生成任务较多，请稍后再试。",
    inFlight: "已有一首 AI 背景正在生成，请完成后再试。",
  },
} as const;

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
