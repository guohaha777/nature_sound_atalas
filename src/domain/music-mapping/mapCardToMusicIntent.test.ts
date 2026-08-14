import { describe, expect, it } from "vitest";
import type { ConfirmedSoundCard } from "../sound-card";
import { mapCardToMusicIntent } from "./mapCardToMusicIntent";

const base: ConfirmedSoundCard = {
  id: "test",
  projectId: "test-project",
  paperCardId: "test-paper-card",
  entryIndex: 0,
  source: { label: "测试声音", normalizedKey: "test", decisionSource: "demo" },
  pitch: "low",
  duration: "long",
  contour: "flat",
  intensity: "soft",
  pattern: "fade-in",
  templateVersion: "sound-card-v1",
  confirmedAt: "test",
};

describe("music-mapping-v1", () => {
  it("maps low, long and fade-in to a quiet low texture", () => {
    const result = mapCardToMusicIntent(base);
    expect(result).toMatchObject({ semitoneShift: -7, durationBeats: 3, gainDb: -10, pattern: "fade-in", mappingVersion: "music-mapping-v1" });
    expect(result.roleCandidates).toContain("texture");
  });

  it("maps high, short and repeat to rhythm and melody candidates", () => {
    const result = mapCardToMusicIntent({ ...base, pitch: "high", duration: "short", contour: "rising", intensity: "medium", pattern: "repeat" });
    expect(result).toMatchObject({ semitoneShift: 7, durationBeats: 0.5, gainDb: -5, pattern: "repeat" });
    expect(result.roleCandidates).toEqual(expect.arrayContaining(["rhythm", "melody"]));
  });

  it("is deterministic", () => {
    expect(mapCardToMusicIntent(base)).toEqual(mapCardToMusicIntent(base));
  });

  it("rejects invalid choices", () => {
    expect(() => mapCardToMusicIntent({ ...base, pitch: "very-high" } as unknown as ConfirmedSoundCard)).toThrow();
  });
});
