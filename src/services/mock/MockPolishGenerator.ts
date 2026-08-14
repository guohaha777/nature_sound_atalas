import type { AIPolishLayer, Composition } from "@/src/domain/composition";
import type { ConfirmedSoundCard, SoundUnit } from "@/src/domain/sound-card";
import type { PolishGenerationPort } from "@/src/features/ports";
import { MOCK_LOCAL_FALLBACK, MOCK_POLISH_RESULT } from "@/src/mocks/mockData";
import { buildMusicPolishBrief, deriveMusicPolishDirection } from "@/src/features/music-polish";

function hashInput(composition: Composition, cards: ConfirmedSoundCard[]): string {
  return cards
    .filter((card) => composition.soundUnitIds.some((id) => id.endsWith(card.id)))
    .map((card) => `${card.id}:${card.pitch}:${card.duration}:${card.contour}:${card.intensity}:${card.pattern}`)
    .join("|");
}

export class MockPolishGenerator implements PolishGenerationPort {
  async generate(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[]): Promise<AIPolishLayer> {
    void units;
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    return {
      id: `mock-polish-${composition.revision}`,
      compositionRevision: composition.revision,
      sourceKind: MOCK_POLISH_RESULT.sourceKind,
      provider: MOCK_POLISH_RESULT.provider,
      model: MOCK_POLISH_RESULT.model,
      promptVersion: MOCK_POLISH_RESULT.promptVersion,
      defaultGainDb: -16,
      basedOnInputHash: hashInput(composition, cards),
    };
  }

  fallback(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[]): AIPolishLayer {
    return {
      id: `local-fallback-${composition.revision}`,
      compositionRevision: composition.revision,
      sourceKind: MOCK_LOCAL_FALLBACK.sourceKind,
      provider: MOCK_LOCAL_FALLBACK.provider,
      model: MOCK_LOCAL_FALLBACK.model,
      promptVersion: MOCK_LOCAL_FALLBACK.promptVersion,
      defaultGainDb: -18,
      basedOnInputHash: `fallback:${composition.revision}`,
      direction: deriveMusicPolishDirection(buildMusicPolishBrief(composition, cards, units)),
    };
  }
}
