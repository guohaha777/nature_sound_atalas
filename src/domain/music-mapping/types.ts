import type { ContourChoice, PatternChoice } from "../sound-card";

export interface MusicIntent {
  sourceKey: string;
  semitoneShift: number;
  durationBeats: number;
  contour: {
    kind: ContourChoice;
    semitoneDelta: number;
    filterMotion: "up" | "down" | "none" | "lfo";
  };
  gainDb: number;
  pattern: PatternChoice;
  roleCandidates: Array<"rhythm" | "bass" | "melody" | "texture">;
  explanationKey: string;
  mappingVersion: "music-mapping-v1";
}

