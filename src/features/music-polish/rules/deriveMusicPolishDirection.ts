import type { MusicPolishBrief, MusicPolishDirection } from "../contracts";

const clamp = (value: number) => Math.max(0, Math.min(1, Number(value.toFixed(3))));

/** 同一组确定性规则同时驱动 Fun-Music 提示词和本地 Plan B。 */
export function deriveMusicPolishDirection(brief: MusicPolishBrief): MusicPolishDirection {
  const sounds = Math.max(1, brief.soundCount);
  const loudness = (brief.intensityProfile.loud + brief.intensityProfile.medium * 0.45) / sounds;
  const softness = brief.intensityProfile.soft / sounds;
  const rhythmic = (brief.patternProfile.repeat * 0.72 + brief.patternProfile.bursts) / sounds;
  const gradual = brief.patternProfile.fadeIn / sounds;
  const density = Math.min(1, brief.eventCount / Math.max(1, brief.durationSeconds * 0.55));
  const arousal = brief.emotionCoordinates.enabled ? (brief.emotionCoordinates.arousal + 1) / 2 : 0.5;
  const negativeValence = brief.emotionCoordinates.enabled ? (1 - brief.emotionCoordinates.valence) / 2 : 0.35;

  const energy = clamp(0.08 + loudness * 0.34 + rhythmic * 0.22 + density * 0.16 + arousal * 0.28 - softness * 0.12 - gradual * 0.08);
  const pulse = clamp(0.04 + rhythmic * 0.46 + density * 0.2 + arousal * 0.25 + loudness * 0.12 - gradual * 0.1);
  const tension = clamp(0.06 + negativeValence * 0.38 + arousal * 0.28 + brief.patternProfile.bursts / sounds * 0.22);
  const space = clamp(1 - density * 0.38 - pulse * 0.3 - energy * 0.18 + softness * 0.22 + gradual * 0.18);
  return { energy, pulse, tension, space, energyBand: energy < 0.36 ? "quiet" : energy < 0.68 ? "balanced" : "driving" };
}
