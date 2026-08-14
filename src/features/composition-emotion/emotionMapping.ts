import type { EmotionIntent } from "@/src/domain/composition";

export type SelectedEmotionLabel = Exclude<EmotionIntent["label"], null>;

const COPY: Record<SelectedEmotionLabel, { keyword: string; note: string }> = {
  bright: { keyword: "开心 · 激动", note: "明亮、有推动感、节奏更活跃" },
  content: { keyword: "开心 · 平静", note: "温暖、舒缓、稳定而有留白" },
  tense: { keyword: "不开心 · 激动", note: "略带紧张与不稳定感，但不过度压迫" },
  blue: { keyword: "不开心 · 平静", note: "低沉、稀疏、克制而温柔" },
};

export const EMOTION_NEUTRAL_ZONE = 0.1;

export function resolveEmotionSelection(valence: number, arousal: number) {
  const label: SelectedEmotionLabel = valence >= 0
    ? arousal >= 0 ? "bright" : "content"
    : arousal >= 0 ? "tense" : "blue";
  const valenceWord = valence > EMOTION_NEUTRAL_ZONE ? "开心" : valence < -EMOTION_NEUTRAL_ZONE ? "不开心" : "中立";
  const arousalWord = arousal > EMOTION_NEUTRAL_ZONE ? "激动" : arousal < -EMOTION_NEUTRAL_ZONE ? "平静" : "中等活力";
  const keyword = valenceWord === "中立" && arousalWord === "中等活力" ? "中立" : `${valenceWord} · ${arousalWord}`;
  const note = valenceWord === "中立"
    ? arousalWord === "激动" ? "情绪中立，但有清晰推动感" : arousalWord === "平静" ? "情绪中立、安静、保留更多空间" : "不偏开心或不开心，保持自然平衡"
    : arousalWord === "中等活力" ? `${valenceWord}，节奏与动态保持适中` : COPY[label].note;
  return { label, keyword, note, valenceWord, arousalWord };
}

export function clampEmotionCoordinate(value: number) {
  const clamped = Math.max(-1, Math.min(1, Number(value.toFixed(3))));
  return Math.abs(clamped) <= EMOTION_NEUTRAL_ZONE ? 0 : clamped;
}
