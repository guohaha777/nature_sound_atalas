import { describe, expect, it } from "vitest";
import { arrangeCompositionV1 } from "@/src/domain/composition";
import { MOCK_ORIGINAL_AUDIO_ASSETS, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { buildCompositionPlaybackTimeline } from "./buildCompositionPlaybackTimeline";

describe("composition playback timeline", () => {
  it("keeps the work inside the selected duration while source files stay archived", () => {
    const units = MOCK_SOUND_UNITS.map((unit, index) => ({ ...unit, active: index === 0 }));
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, units);
    const timeline = buildCompositionPlaybackTimeline(composition, MOCK_ORIGINAL_AUDIO_ASSETS, 23);
    expect(timeline.audibleDurationSeconds).toBe(composition.durationSeconds);
    expect(timeline.audibleDurationSeconds).toBe(24);
  });
});
