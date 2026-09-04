import { FIELD_LABELS, type ConfirmedSoundCard } from "./types";

/**
 * 「小耳朵发现」这一句既要让孩子确认自己做了什么，也要给一点能往下想的启发。
 * 所以固定两段：你听成了什么 → 你这个选择在音乐里意味着什么。
 * 启发句按孩子实际选的形状和出现方式取，不是通用的鼓励语。
 */
const CONTOUR_INSIGHT: Record<ConfirmedSoundCard["contour"], string> = {
  rising: "往上走的声音会把耳朵一起带高",
  falling: "往下落的声音像慢慢坐下来",
  flat: "稳稳的声音最适合垫在下面，让别的声音站上去",
  wavy: "有起伏的声音自己就在呼吸",
};

const PATTERN_INSIGHT: Record<ConfirmedSoundCard["pattern"], string> = {
  once: "只出现一次，大家反而会记得最牢",
  repeat: "一重复就有了节奏，人会想跟着点头",
  bursts: "一阵一阵地来，像在和谁一问一答",
  "fade-in": "慢慢出现的声音，会让人不知不觉就听进去",
};

export function explainCard(card: ConfirmedSoundCard): string {
  const pitch = FIELD_LABELS.pitch[card.pitch];
  const duration = FIELD_LABELS.duration[card.duration];
  const contour = FIELD_LABELS.contour[card.contour];
  const intensity = FIELD_LABELS.intensity[card.intensity];
  const pattern = FIELD_LABELS.pattern[card.pattern];
  return `你把${card.source.label}听成“${pitch}、${duration}、${contour}、${intensity}、${pattern}”。${CONTOUR_INSIGHT[card.contour]}，${PATTERN_INSIGHT[card.pattern]}。`;
}
