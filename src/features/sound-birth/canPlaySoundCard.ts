import type { OriginalAudioAsset } from "@/src/domain/audio-asset";
import type { ConfirmedSoundCard } from "@/src/domain/sound-card";

export function canPlaySoundCard(card: ConfirmedSoundCard, asset: OriginalAudioAsset | undefined, allowBoundDraft = false) {
  if (!asset || card.sourceSelectionRequired) return false;
  return allowBoundDraft || !card.confirmedAt.endsWith("-draft");
}
