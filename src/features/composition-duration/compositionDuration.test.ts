import { describe, expect, it } from "vitest";
import { arrangeCompositionV1 } from "@/src/domain/composition";
import { MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { compositionBeatLength, resizeCompositionDuration } from "./compositionDuration";

describe("composition duration", () => {
  it("rescales event positions and keeps every trigger inside the chosen duration", () => {
    const original = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 3);
    const resized = resizeCompositionDuration(original, 15);

    expect(resized.durationSeconds).toBe(15);
    expect(resized.revision).toBe(4);
    expect(resized.events).toHaveLength(original.events.length);
    expect(resized.events.every((event) => event.startBeat + event.durationBeats <= compositionBeatLength(resized) + 0.001)).toBe(true);
  });
});
