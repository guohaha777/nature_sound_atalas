import type { AIPolishLayer, Composition } from "@/src/domain/composition";
import type { ConfirmedSoundCard, SoundUnit } from "@/src/domain/sound-card";
import { buildDeterministicSymbolicPlan, buildMusicPolishBrief, deriveBackgroundVoicing,
  deriveMusicPolishDirection, funMusicGenerationResponseSchema, symbolicMusicPlanApiResponseSchema, validateBackgroundArrangement } from "@/src/features/music-polish";
import type { PolishGenerationPort } from "@/src/features/ports";
import { BACKGROUND_DURATION_TOLERANCE_SECONDS, fitBackgroundAudio } from "@/src/audio/editing/fitBackgroundAudio";
import { isBackgroundGainLimited } from "@/src/audio/mixing";
import { maxOverlappingEvents } from "@/src/audio/mixing/maxOverlappingEvents";

export class FunMusicPolishGenerator implements PolishGenerationPort {
  async generate(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[]): Promise<AIPolishLayer> {
    const brief = buildMusicPolishBrief(composition, cards, units);
    const response = await fetch("/api/music/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief }),
    });
    const payload = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      const message = typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : "AI 背景生成失败，请稍后重试。";
      throw new Error(message);
    }
    const result = funMusicGenerationResponseSchema.parse(payload);
    if (result.generatedDurationSeconds < composition.durationSeconds - BACKGROUND_DURATION_TOLERANCE_SECONDS) {
      throw new Error(`音乐模型只生成了 ${Math.round(result.generatedDurationSeconds)} 秒，短于本次 ${composition.durationSeconds} 秒作品，已拒绝使用这段不完整背景。请重试或使用 Plan B。`);
    }
    // 模型按自己的乐句收尾，不会正好停在 20／30／45 秒。
    // 这里裁到作品时长并加淡入淡出，避免硬切盖过孩子的原声。
    const fitted = await fitBackgroundAudio(await fetchBackgroundAudio(result.audioUrl), {
      targetDurationSeconds: composition.durationSeconds,
    });
    const defaultGainDb = -16;
    return {
      id: `fun-music-${result.audioId}`,
      compositionRevision: composition.revision,
      sourceKind: "live_ai",
      provider: result.provider,
      model: result.model,
      promptVersion: result.promptVersion,
      defaultGainDb,
      basedOnInputHash: stableBriefHash(JSON.stringify(brief)),
      direction: deriveMusicPolishDirection(brief),
      voicing: deriveBackgroundVoicing(brief),
      audioUrl: URL.createObjectURL(fitted.blob),
      audioAssetId: result.audioId,
      audioExpiresAt: result.expiresAt,
      validation: {
        version: "background-validation-v1",
        status: "basic-guarded",
        format: "mp3",
        trustedSource: true,
        instrumentalModeRequested: result.instrumentalModeRequested,
        generatedDurationSeconds: result.generatedDurationSeconds,
        // 裁剪后是真实播放时长，不再是"取个小值"的估算。
        playbackDurationSeconds: fitted.durationSeconds,
        gainLimited: isBackgroundGainLimited(defaultGainDb, maxOverlappingEvents(composition)),
        voiceRiskCheck: "provider-request-only",
      },
    };
  }

  async fallback(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[]): Promise<AIPolishLayer> {
    const brief = buildMusicPolishBrief(composition, cards, units);
    const direction = deriveMusicPolishDirection(brief);
    const defaultGainDb = direction.energyBand === "driving" ? -13 : direction.energyBand === "balanced" ? -15 : -17;
    let sourceKind: AIPolishLayer["sourceKind"] = "local_fallback";
    let provider = "wanwu-deterministic-score";
    let model: string | null = null;
    let plan = buildDeterministicSymbolicPlan(brief);
    // 降级原因要一直带到界面：老师和评审需要分清“没联上”和“联上了但结果没通过检查”。
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
}

/** 模型返回的是临时链接，取回后就不再依赖它，过期也不影响已生成的背景。 */
async function fetchBackgroundAudio(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`取回背景音频失败（${response.status}），请重试或使用 Plan B。`);
  return response.blob();
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
