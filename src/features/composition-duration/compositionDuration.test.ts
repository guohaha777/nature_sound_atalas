import { describe, expect, it } from "vitest";
import { arrangeCompositionV1 } from "@/src/domain/composition";
import { MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { alignCompositionDurationToOptions, COMPOSITION_DURATION_OPTIONS, compositionBeatLength, resizeCompositionDuration } from "./compositionDuration";

describe("composition duration", () => {
  it("rescales event positions and keeps every trigger inside the chosen duration", () => {
    const shortest = COMPOSITION_DURATION_OPTIONS[0];
    const original = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 3);
    const resized = resizeCompositionDuration(original, shortest);

    expect(resized.durationSeconds).toBe(shortest);
    expect(resized.revision).toBe(4);
    expect(resized.events).toHaveLength(original.events.length);
    expect(resized.events.every((event) => event.startBeat + event.durationBeats <= compositionBeatLength(resized) + 0.001)).toBe(true);
  });
});

describe("旧档位草稿升级", () => {
  it("把停在旧档位的草稿抬到放得下的最短当前档位，而不是剪短它", () => {
    const legacy = { ...arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 3, 24), durationRecommendation: { version: "duration-recommendation-v1" as const, seconds: 30 as const, selectedSoundCount: 3, totalSourceSeconds: 26, durationSpreadSeconds: 6, reason: "旧档位说明" }, savedAt: "2026-08-30T00:00:00.000Z" };
    const aligned = alignCompositionDurationToOptions(legacy);

    expect(aligned.durationSeconds).toBe(30);
    expect(aligned.durationSeconds).toBeGreaterThanOrEqual(legacy.durationSeconds);
    expect(aligned.durationRecommendation).toBeUndefined();
    expect(aligned.revision).toBe(legacy.revision);
    expect(aligned.savedAt).toBe(legacy.savedAt);
  });

  it("已经在当前档位上的作品原样返回", () => {
    const current = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 3, COMPOSITION_DURATION_OPTIONS[0]);
    expect(alignCompositionDurationToOptions(current)).toBe(current);
  });
});

