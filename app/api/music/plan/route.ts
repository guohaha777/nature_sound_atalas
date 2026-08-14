import { getChatGPTUser } from "@/app/chatgpt-auth";
import { buildSymbolicMusicPlanPrompt, musicPolishBriefSchema, symbolicMusicPlanApiResponseSchema } from "@/src/features/music-polish";
import { symbolicMusicPlanSchema } from "@/src/domain/composition";

export async function POST(request: Request) {
  const parsed = musicPolishBriefSchema.safeParse((await request.json().catch(() => null) as { brief?: unknown } | null)?.brief);
  if (!parsed.success) return Response.json({ message: "音符编排摘要无效。" }, { status: 400 });

  const apiKey = process.env.COMPOSITION_ADVISOR_API_KEY?.trim();
  const endpoint = process.env.COMPOSITION_ADVISOR_API_ENDPOINT?.trim();
  const model = process.env.COMPOSITION_ADVISOR_MODEL?.trim();
  const allowedUserId = process.env.COMPOSITION_ADVISOR_ALLOWED_USER_ID?.trim();
  if (!apiKey || !endpoint || !model) return Response.json({ message: "智能音符编排 API 尚未配置。" }, { status: 503 });
  if (!isPublicHttpsEndpoint(endpoint)) return Response.json({ message: "智能音符编排服务地址配置无效。" }, { status: 500 });
  if (allowedUserId) {
    const user = await getChatGPTUser();
    if (!user || user.userId !== allowedUserId) return Response.json({ message: "当前访客没有使用智能编排额度的权限。" }, { status: 403 });
  }

  const admission = admitPlan(request);
  if (!admission.ok) return Response.json({ message: admission.message }, { status: 429, headers: { "Retry-After": String(admission.retryAfterSeconds) } });
  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "只返回合法 JSON，不要返回 Markdown。" },
          { role: "user", content: buildSymbolicMusicPlanPrompt(parsed.data) },
        ],
        enable_thinking: false,
        temperature: 0.35,
      }),
      signal: AbortSignal.timeout(150_000),
    });
    const payload = await upstream.json().catch(() => null) as OpenAICompatibleResponse | null;
    const content = payload?.choices?.[0]?.message?.content;
    if (!upstream.ok || typeof content !== "string") return Response.json({ message: "智能音符编排没有返回有效结果。" }, { status: 502 });
    const plan = symbolicMusicPlanSchema.safeParse(JSON.parse(stripCodeFence(content)));
    if (!plan.success || plan.data.durationSeconds !== parsed.data.durationSeconds || plan.data.bpm !== parsed.data.bpm) {
      return Response.json({ message: "智能音符编排没有通过时长与安全校验。" }, { status: 502 });
    }
    return Response.json(symbolicMusicPlanApiResponseSchema.parse({ plan: plan.data, provider: new URL(endpoint).hostname, model }));
  } catch (error) {
    return Response.json({ message: error instanceof DOMException && error.name === "TimeoutError" ? "智能音符编排超时。" : "暂时无法连接智能音符编排服务。" }, { status: 502 });
  } finally {
    admission.release();
  }
}

type PlanRateState = { day: string; dailyCount: number; attempts: Map<string, number[]>; active: number };
const WINDOW_MS = 60 * 60 * 1000;
const PER_CLIENT_LIMIT = 12;
const DAILY_LIMIT = 120;
const MAX_CONCURRENCY = 6;

function planRateState(): PlanRateState {
  const scope = globalThis as typeof globalThis & { __wanwuPlanRateState?: PlanRateState };
  const day = new Date().toISOString().slice(0, 10);
  if (!scope.__wanwuPlanRateState || scope.__wanwuPlanRateState.day !== day) scope.__wanwuPlanRateState = { day, dailyCount: 0, attempts: new Map(), active: 0 };
  return scope.__wanwuPlanRateState;
}

function admitPlan(request: Request): { ok: true; release(): void } | { ok: false; message: string; retryAfterSeconds: number } {
  const state = planRateState();
  const client = clientIdentifier(request);
  const now = Date.now();
  const recent = (state.attempts.get(client) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= PER_CLIENT_LIMIT) return { ok: false, message: "智能音符编排次数较多，请稍后再试。", retryAfterSeconds: 300 };
  if (state.dailyCount >= DAILY_LIMIT) return { ok: false, message: "今日智能音符编排额度已用完，将使用本地动态方案。", retryAfterSeconds: 3600 };
  if (state.active >= MAX_CONCURRENCY) return { ok: false, message: "当前智能音符编排任务较多，请稍后再试。", retryAfterSeconds: 20 };
  recent.push(now);
  state.attempts.set(client, recent);
  state.dailyCount += 1;
  state.active += 1;
  let released = false;
  return { ok: true, release: () => { if (!released) { released = true; state.active = Math.max(0, state.active - 1); } } };
}

function clientIdentifier(request: Request) {
  return request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown-client";
}

function isPublicHttpsEndpoint(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "::1" || hostname.endsWith(".local")) return false;
    if (/^(?:127|10)\./.test(hostname) || /^169\.254\./.test(hostname) || /^192\.168\./.test(hostname)) return false;
    const private172 = hostname.match(/^172\.(\d{1,3})\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
    return hostname !== "0.0.0.0";
  } catch {
    return false;
  }
}

function stripCodeFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

interface OpenAICompatibleResponse {
  choices?: Array<{ message?: { content?: string } }>;
}
