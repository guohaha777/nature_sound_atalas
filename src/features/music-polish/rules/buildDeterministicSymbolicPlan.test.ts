import { describe, expect, it } from "vitest";
import { symbolicMusicPlanSchema } from "@/src/domain/composition";
import type { MusicPolishBrief } from "../contracts";
import { buildDeterministicSymbolicPlan } from "./buildDeterministicSymbolicPlan";

const base: MusicPolishBrief = {
  version: "music-polish-brief-v3",
  durationSeconds: 15,
  bpm: 88,
  soundCount: 3,
  eventCount: 5,
  pitchProfile: { high: 1, mid: 1, low: 1 },
  intensityProfile: { soft: 1, medium: 1, loud: 1 },
  patternProfile: { once: 1, repeat: 1, bursts: 1, fadeIn: 0 },
  eventPositions: [0, 0.3, 0.7],
  soundEvents: [
    { soundIndex: 1, startRatio: 0, durationRatio: 0.1, pitch: "high", intensity: "soft", pattern: "once", contour: "rising" },
    { soundIndex: 2, startRatio: 0.3, durationRatio: 0.2, pitch: "mid", intensity: "medium", pattern: "repeat", contour: "flat" },
    { soundIndex: 3, startRatio: 0.7, durationRatio: 0.12, pitch: "low", intensity: "loud", pattern: "bursts", contour: "wavy" },
  ],
  emotion: "bright",
  emotionCoordinates: { enabled: true, valence: 0.6, arousal: 0.3 },
};

describe("buildDeterministicSymbolicPlan", () => {
  it("is deterministic, valid, and ends exactly within the selected work duration", () => {
    const plan = buildDeterministicSymbolicPlan(base);
    expect(buildDeterministicSymbolicPlan(base)).toEqual(plan);
    expect(symbolicMusicPlanSchema.parse(plan)).toEqual(plan);
    expect(plan.durationSeconds).toBe(15);
    expect(plan.events.every((event) => event.startSeconds + event.durationSeconds <= 15.001)).toBe(true);
  });

  it("changes the score when the child composition changes", () => {
    const changed = buildDeterministicSymbolicPlan({
      ...base,
      pitchProfile: { high: 3, mid: 0, low: 0 },
      patternProfile: { once: 0, repeat: 0, bursts: 3, fadeIn: 0 },
      eventPositions: [0.05, 0.1, 0.15],
      emotion: "tense",
    });
    expect(changed.events).not.toEqual(buildDeterministicSymbolicPlan(base).events);
  });
});
