import { getChatGPTUser } from "@/app/chatgpt-auth";
import { admitRequest } from "@/src/services/api-rate-limit";
import { compositionAdviceBriefSchema, compositionAdviceResultSchema, hasMusicCreationValue } from "@/src/features/composition-advice";
import { buildCompositionAdvicePrompt, JSON_ONLY_SYSTEM_MESSAGE } from "@/src/prompts";

export async function POST(request: Request) {
  const parsed = compositionAdviceBriefSchema.safeParse((await request.json().catch(() => null) as { brief?: unknown } | null)?.brief);
  if (!parsed.success) return Response.json({ message: "作品摘要无效。" }, { status: 400 });

  const apiKey = process.env.COMPOSITION_ADVISOR_API_KEY?.trim();
  const endpoint = process.env.COMPOSITION_ADVISOR_API_ENDPOINT?.trim();
  const model = process.env.COMPOSITION_ADVISOR_MODEL?.trim();
  const allowedUserId = process.env.COMPOSITION_ADVISOR_ALLOWED_USER_ID?.trim();
  if (!apiKey || !endpoint || !model) return Response.json({ message: "作品理解 API 尚未配置。" }, { status: 503 });
  if (!isPublicHttpsEndpoint(endpoint)) return Response.json({ message: "作品理解服务地址配置无效。" }, { status: 500 });
  if (allowedUserId) {
    const user = await getChatGPTUser();
    if (!user || user.userId !== allowedUserId) return Response.json({ message: "当前访客没有使用作品理解额度的权限。" }, { status: 403 });
  }

  const admission = admitRequest(request, ADVICE_RATE_LIMIT);
  if (!admission.ok) return Response.json({ message: admission.message }, { status: 429, headers: { "Retry-After": String(admission.retryAfterSeconds) } });
  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: JSON_ONLY_SYSTEM_MESSAGE },
          { role: "user", content: buildCompositionAdvicePrompt(parsed.data) },
        ],
        response_format: { type: "json_object" },
        enable_thinking: false,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(150_000),
    });
    const payload = await upstream.json().catch(() => null) as OpenAICompatibleResponse | null;
    const content = payload?.choices?.[0]?.message?.content;
    if (!upstream.ok || typeof content !== "string") return Response.json({ message: "作品理解服务没有返回有效结果。" }, { status: 502 });
    const result = compositionAdviceResultSchema.safeParse(JSON.parse(stripCodeFence(content)));
    if (!result.success) return Response.json({ message: "作品理解结果没有通过安全校验。" }, { status: 502 });
    if (!hasMusicCreationValue(result.data.musicDiscovery)) return Response.json({ message: "作品理解没有说明音乐创作作用。" }, { status: 502 });
    const roleIndexes = result.data.roles.map((role) => role.soundIndex);
    const expectedIndexes = parsed.data.sounds.map((sound) => sound.soundIndex);
    if (roleIndexes.length !== expectedIndexes.length || new Set(roleIndexes).size !== roleIndexes.length || expectedIndexes.some((index) => !roleIndexes.includes(index))) {
      return Response.json({ message: "作品理解结果没有覆盖全部声音。" }, { status: 502 });
    }
    return Response.json({ ...result.data, provider: new URL(endpoint).hostname, model });
  } catch (error) {
    return Response.json({ message: error instanceof DOMException && error.name === "TimeoutError" ? "作品理解超时。" : "暂时无法连接作品理解服务。" }, { status: 502 });
  } finally {
    admission.release();
  }
}

const ADVICE_RATE_LIMIT = {
  scope: "composition-advice",
  perClientLimit: 12,
  dailyLimit: 120,
  maxConcurrency: 6,
  messages: {
    perClient: "作品理解次数较多，请稍后再试。",
    daily: "今日作品理解额度已用完，将使用本地建议。",
    concurrency: "当前作品理解任务较多，请稍后再试。",
  },
} as const;

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
