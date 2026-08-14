import type { AIPolishLayer, Composition } from "@/src/domain/composition";
import type { ConfirmedSoundCard, SoundUnit } from "@/src/domain/sound-card";

export interface PolishGenerationPort {
  generate(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[]): Promise<AIPolishLayer>;
  fallback(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[]): AIPolishLayer | Promise<AIPolishLayer>;
}
