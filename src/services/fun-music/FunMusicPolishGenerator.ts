import type { AIPolishLayer, Composition } from "@/src/domain/composition";
import type { ConfirmedSoundCard, SoundUnit } from "@/src/domain/sound-card";
import { buildDeterministicSymbolicPlan, buildMusicPolishBrief, deriveMusicPolishDirection, funMusicGenerationResponseSchema, symbolicMusicPlanApiResponseSchema } from "@/src/features/music-polish";
import type { PolishGenerationPort } from "@/src/features/ports";

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
      audioUrl: result.audioUrl,
      audioAssetId: result.audioId,
      audioExpiresAt: result.expiresAt,
      validation: {
        version: "background-validation-v1",
        status: "basic-guarded",
        format: "mp3",
        trustedSource: true,
        instrumentalModeRequested: result.instrumentalModeRequested,
        generatedDurationSeconds: result.generatedDurationSeconds,
        playbackDurationSeconds: Math.min(result.generatedDurationSeconds, composition.durationSeconds),
        gainLimited: defaultGainDb <= -16,
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
    try {
      const response = await fetch("/api/music/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      const payload = await response.json().catch(() => null) as unknown;
      if (response.ok) {
        const result = symbolicMusicPlanApiResponseSchema.parse(payload);
        plan = result.plan;
        provider = result.provider;
        model = result.model;
        sourceKind = "symbolic_ai";
      }
    } catch {
      // 保持确定性本地方案；基础作品与背景试听均不依赖联网成功。
    }
    return {
      id: `${sourceKind === "symbolic_ai" ? "symbolic-ai" : "local-score"}-${composition.revision}`,
      compositionRevision: composition.revision,
      sourceKind,
      provider,
      model,
      promptVersion: "symbolic-music-plan-v1",
      defaultGainDb,
      basedOnInputHash: `fallback:${stableBriefHash(JSON.stringify(brief))}`,
      direction,
      symbolicPlan: plan,
      validation: {
        version: "background-validation-v1",
        status: "local-verified",
        format: "local-synthesis",
        trustedSource: true,
        instrumentalModeRequested: true,
        generatedDurationSeconds: null,
        playbackDurationSeconds: composition.durationSeconds,
        gainLimited: defaultGainDb <= -13,
        voiceRiskCheck: "not-applicable",
      },
    };
  }
}

function stableBriefHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
