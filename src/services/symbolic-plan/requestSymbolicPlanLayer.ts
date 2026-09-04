import { isBackgroundGainLimited } from "@/src/audio/mixing";
import { maxOverlappingEvents } from "@/src/audio/mixing/maxOverlappingEvents";
import type { AIPolishLayer, Composition } from "@/src/domain/composition";
import type { ConfirmedSoundCard, SoundUnit } from "@/src/domain/sound-card";
import {
  buildDeterministicSymbolicPlan, buildMusicPolishBrief, deriveBackgroundVoicing,
  deriveMusicPolishDirection, symbolicMusicPlanApiResponseSchema, validateBackgroundArrangement,
} from "@/src/features/music-polish";

/**
 * Plan B：语言模型给出动机与四段性格，由 /api/music/plan 里的代码把它发展成音符伴奏。
 *
 * 这一层必须和音频模型的实现分开：换 Fun-Music、换 ACE-Step，Plan B 都是同一条链路。
 * 之前 AceStepPolishGenerator 自己重写了一个只跑本地规则的 fallback，
 * 结果音频模型一失败就直接掉到机械伴奏，语言模型那一环被整条跳过。
 *
 * 只有在请求失败或模型方案过不了编排检查时，才退到确定性规则；
 * 退的原因一路带到界面，老师和评审要能分清"没联上"和"联上了但没通过检查"。
 */
export async function requestSymbolicPlanLayer(
  composition: Composition,
  cards: ConfirmedSoundCard[],
  units: SoundUnit[],
): Promise<AIPolishLayer> {
  const brief = buildMusicPolishBrief(composition, cards, units);
  const direction = deriveMusicPolishDirection(brief);
  const defaultGainDb = direction.energyBand === "driving" ? -13 : direction.energyBand === "balanced" ? -15 : -17;
  let sourceKind: AIPolishLayer["sourceKind"] = "local_fallback";
  let provider = "wanwu-deterministic-score";
  let model: string | null = null;
  let plan = buildDeterministicSymbolicPlan(brief);
  let fallbackReason: AIPolishLayer["fallbackReason"] = "not-connected";
  let repairs: string[] = [];

  try {
    const response = await fetch("/api/music/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief }),
    });
    const payload = await response.json().catch(() => null) as unknown;
    if (response.ok) {
      // 服务端已经做过确定性修补（格式、越界、收尾），这里只判断音乐上能不能用。
      const result = symbolicMusicPlanApiResponseSchema.parse(payload);
      const check = validateBackgroundArrangement(result.plan, brief);
      if (check.ok) {
        plan = result.plan;
        provider = result.provider;
        model = result.model;
        sourceKind = "symbolic_ai";
        repairs = result.repairs;
        fallbackReason = undefined;
        if (repairs.length > 0) reportPolishFallback(`模型方案已修补后使用：${repairs.join("、")}`);
      } else {
        fallbackReason = "model-rejected";
        reportPolishFallback(`模型写的伴奏没有通过编排检查：${check.reason}`);
      }
    } else {
      fallbackReason = response.status === 503 ? "not-configured" : response.status === 429 ? "quota-used" : "model-rejected";
      reportPolishFallback(readMessage(payload) ?? `智能音符编排请求失败（${response.status}）。`);
    }
  } catch (error) {
    fallbackReason = "not-connected";
    reportPolishFallback(error instanceof Error ? error.message : "无法连接智能音符编排服务。");
  }

  return {
    id: `${sourceKind === "symbolic_ai" ? "symbolic-ai" : "local-score"}-${composition.revision}`,
    compositionRevision: composition.revision,
    sourceKind,
    provider,
    model,
    promptVersion: "symbolic-music-plan-v1",
    fallbackReason,
    arrangementRepairs: repairs.length > 0 ? repairs : undefined,
    defaultGainDb,
    basedOnInputHash: `fallback:${stableBriefHash(JSON.stringify(brief))}`,
    direction,
    voicing: deriveBackgroundVoicing(brief),
    symbolicPlan: plan,
    validation: {
      version: "background-validation-v1",
      status: "local-verified",
      format: "local-synthesis",
      trustedSource: true,
      instrumentalModeRequested: true,
      generatedDurationSeconds: null,
      playbackDurationSeconds: composition.durationSeconds,
      gainLimited: isBackgroundGainLimited(defaultGainDb, maxOverlappingEvents(composition)),
      voiceRiskCheck: "not-applicable",
    },
  };
}

function stableBriefHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function readMessage(payload: unknown): string | null {
  return typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string" ? payload.message : null;
}

/** 降级不阻塞创作，但原因要留在控制台，便于老师与评审现场排查。 */
function reportPolishFallback(reason: string) {
  if (typeof console !== "undefined") console.warn(`[背景降级] ${reason}`);
}
