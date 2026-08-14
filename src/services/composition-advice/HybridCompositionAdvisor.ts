import type { Composition, CompositionTeachingAdvice } from "@/src/domain/composition";
import type { ConfirmedSoundCard, SoundUnit } from "@/src/domain/sound-card";
import { buildCompositionAdviceBrief, buildLocalCompositionAdvice, compositionAdviceApiResponseSchema, stableAdviceHash } from "@/src/features/composition-advice";
import type { CompositionAdvicePort } from "@/src/features/ports";

export class HybridCompositionAdvisor implements CompositionAdvicePort {
  async advise(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[]): Promise<CompositionTeachingAdvice> {
    const brief = buildCompositionAdviceBrief(composition, cards, units);
    const response = await fetch("/api/composition/advice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief }),
    });
    const payload = await response.json().catch(() => null) as unknown;
    if (!response.ok) throw new Error("作品理解服务暂不可用。");
    const result = compositionAdviceApiResponseSchema.parse(payload);
    return {
      version: "composition-teaching-advice-v1",
      compositionRevision: composition.revision,
      sourceKind: "live_ai",
      provider: result.provider,
      model: result.model,
      basedOnInputHash: stableAdviceHash(JSON.stringify(brief)),
      confidence: result.confidence,
      roles: result.roles,
      backgroundRecommendation: result.backgroundRecommendation,
      musicDiscovery: result.musicDiscovery,
    };
  }

  fallback(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[]) {
    return buildLocalCompositionAdvice(composition, cards, units);
  }
}
