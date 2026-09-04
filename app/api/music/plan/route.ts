import { getChatGPTUser } from "@/app/chatgpt-auth";
import { admitRequest } from "@/src/services/api-rate-limit";
import {
  derivePitchMaterial,
  developMusicIdea,
  musicIdeaSchema,
  musicPolishBriefSchema,
  repairSymbolicMusicPlan,
  symbolicMusicPlanApiResponseSchema,
} from "@/src/features/music-polish";
import { buildMusicIdeaPrompt, JSON_ONLY_SYSTEM_MESSAGE } from "@/src/prompts";
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

  const admission = admitRequest(request, PLAN_RATE_LIMIT);
  if (!admission.ok) return Response.json({ message: admission.message }, { status: 429, headers: { "Retry-After": String(admission.retryAfterSeconds) } });
  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: JSON_ONLY_SYSTEM_MESSAGE },
          { role: "user", content: buildMusicIdeaPrompt(parsed.data) },
        ],
        response_format: { type: "json_object" },
        enable_thinking: false,
        temperature: 0.35,
      }),
      signal: AbortSignal.timeout(150_000),
    });
    const payload = await upstream.json().catch(() => null) as OpenAICompatibleResponse | null;
    const content = payload?.choices?.[0]?.message?.content;
    if (!upstream.ok || typeof content !== "string") return Response.json({ message: "智能音符编排没有返回有效结果。" }, { status: 502 });
    const decoded = JSON.parse(stripCodeFence(content)) as unknown;
    // 模型只写想法，程序做发展：重复、变形、留白与收尾都由确定性规则完成。
    const idea = musicIdeaSchema.safeParse(normalizeIdea(decoded));
    if (!idea.success) {
      const issue = idea.error.issues[0];
      return Response.json({ message: `音乐想法不完整：${issue.path.join(".") || "根对象"} ${issue.message}` }, { status: 502 });
    }
    const developed = developMusicIdea(idea.data, parsed.data, derivePitchMaterial(parsed.data));
    // 发展出来的方案仍然过一遍修补，兜住越界与收尾的边缘情况。
    const repaired = repairSymbolicMusicPlan(developed.plan, parsed.data);
    if (!repaired.plan) {
      return Response.json({ message: `智能音符编排无法使用：${repaired.repairs.at(-1) ?? "返回内容不是音符方案"}。` }, { status: 502 });
    }
    const plan = symbolicMusicPlanSchema.safeParse(repaired.plan);
    if (!plan.success) {
      const issue = plan.error.issues[0];
      return Response.json({ message: `智能音符编排修补后仍不合规：${issue.path.join(".") || "根对象"} ${issue.message}` }, { status: 502 });
    }
    return Response.json(symbolicMusicPlanApiResponseSchema.parse({
      plan: plan.data,
      provider: new URL(endpoint).hostname,
      model,
      repairs: repaired.repairs,
    }));
  } catch (error) {
    return Response.json({ message: error instanceof DOMException && error.name === "TimeoutError" ? "智能音符编排超时。" : "暂时无法连接智能音符编排服务。" }, { status: 502 });
  } finally {
    admission.release();
  }
}

const PLAN_RATE_LIMIT = {
  scope: "music-plan",
  perClientLimit: 12,
  dailyLimit: 120,
  maxConcurrency: 6,
  messages: {
    perClient: "智能音符编排次数较多，请稍后再试。",
    daily: "今日智能音符编排额度已用完，将使用本地动态方案。",
    concurrency: "当前智能音符编排任务较多，请稍后再试。",
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

/** 模型偶尔会漏写 version 或把段落名写成中文，这些都不值得整份作废。 */
function normalizeIdea(decoded: unknown): unknown {
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) return decoded;
  const source = decoded as Record<string, unknown>;
  const sections = Array.isArray(source.sections)
    ? source.sections.map((section, index) => {
      if (typeof section !== "object" || section === null) return section;
      const item = section as Record<string, unknown>;
      return { ...item, name: SECTION_ORDER[index] ?? item.name };
    })
    : source.sections;
  return { ...source, version: "music-idea-v1", sections };
}

const SECTION_ORDER = ["intro", "development", "peak", "ending"] as const;

function stripCodeFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

interface OpenAICompatibleResponse {
  choices?: Array<{ message?: { content?: string } }>;
}
