import { FIELD_LABELS, type ConfirmedSoundCard } from "./types";

export function explainCard(card: ConfirmedSoundCard): string {
  const pitch = FIELD_LABELS.pitch[card.pitch];
  const duration = FIELD_LABELS.duration[card.duration];
  const contour = FIELD_LABELS.contour[card.contour];
  const intensity = FIELD_LABELS.intensity[card.intensity];
  const pattern = FIELD_LABELS.pattern[card.pattern];
  return `你把${card.source.label}听成“${pitch}、${duration}、${contour}、${intensity}、${pattern}”。所以它会保留自己的原声，再按你的选择改变出现的位置、长度和动作。`;
}

