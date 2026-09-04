import type {
  ContourChoice,
  DurationChoice,
  IntensityChoice,
  PitchChoice,
} from "../sound-card";

/**
 * 原声移调刻意保守：真实录音移调过多会失去本来的韵味，也不再像那个声音本身。
 * "高／中／低"主要由声场里的上下位置表达，音频上只做能听出、但不破坏音色的小幅移动。
 */
export const PITCH_SHIFT: Record<PitchChoice, number> = { high: 3, mid: 0, low: -3 };
export const DURATION_BEATS: Record<DurationChoice, number> = { short: 0.5, medium: 1, long: 3 };
export const GAIN_DB: Record<IntensityChoice, number> = { soft: -10, medium: -5, loud: -1 };
/** 轮廓用音色的明暗变化表达，不在真实录音上做夸张的滑音或扫频。 */
export const CONTOUR: Record<ContourChoice, { semitoneDelta: number; filterMotion: "up" | "down" | "none" | "lfo" }> = {
  rising: { semitoneDelta: 2, filterMotion: "up" },
  falling: { semitoneDelta: -2, filterMotion: "down" },
  flat: { semitoneDelta: 0, filterMotion: "none" },
  wavy: { semitoneDelta: 1, filterMotion: "lfo" },
};

/**
 * 从实际移调量反推音区。阈值由 PITCH_SHIFT 推导，
 * 以后调整移调幅度时不需要再去各个页面改判定条件。
 */
const PITCH_BAND_THRESHOLD = Math.max(1, Math.abs(PITCH_SHIFT.high) / 2);

export function pitchBandFromSemitoneShift(semitoneShift: number): PitchChoice {
  if (semitoneShift >= PITCH_BAND_THRESHOLD) return "high";
  if (semitoneShift <= -PITCH_BAND_THRESHOLD) return "low";
  return "mid";
}

