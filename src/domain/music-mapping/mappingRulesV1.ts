import type {
  ContourChoice,
  DurationChoice,
  IntensityChoice,
  PitchChoice,
} from "../sound-card";

export const PITCH_SHIFT: Record<PitchChoice, number> = { high: 7, mid: 0, low: -7 };
export const DURATION_BEATS: Record<DurationChoice, number> = { short: 0.5, medium: 1, long: 3 };
export const GAIN_DB: Record<IntensityChoice, number> = { soft: -10, medium: -5, loud: -1 };
export const CONTOUR: Record<ContourChoice, { semitoneDelta: number; filterMotion: "up" | "down" | "none" | "lfo" }> = {
  rising: { semitoneDelta: 5, filterMotion: "up" },
  falling: { semitoneDelta: -5, filterMotion: "down" },
  flat: { semitoneDelta: 0, filterMotion: "none" },
  wavy: { semitoneDelta: 2, filterMotion: "lfo" },
};

