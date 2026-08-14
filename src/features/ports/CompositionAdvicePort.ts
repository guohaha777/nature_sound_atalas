import type { Composition, CompositionTeachingAdvice } from "@/src/domain/composition";
import type { ConfirmedSoundCard, SoundUnit } from "@/src/domain/sound-card";

export interface CompositionAdvicePort {
  advise(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[]): Promise<CompositionTeachingAdvice>;
  fallback(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[]): CompositionTeachingAdvice;
}
