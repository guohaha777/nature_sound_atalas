import { describe, expect, it } from "vitest";
import type { Composition, CompositionEvent } from "@/src/domain/composition";
import { COMPOSITION_DURATION_OPTIONS, LONGEST_COMPOSITION_SECONDS, smallestDurationOptionFor } from "@/src/features/composition-duration";
import { MOCK_ORIGINAL_AUDIO_ASSETS } from "@/src/mocks/mockData";
import { durationOptionFitsUserClips, evaluateClipCapacity, listOversizedSourceEvents, minimumCompositionSecondsForUserClips } from "./clipCapacity";

const baseEvent: CompositionEvent = {
  id: "event-1",
  soundUnitId: "unit-1",
  audioAssetId: "audio-1",
  sourceKey: "cow",
  startBeat: 0,
  durationBeats: 8,
  gainDb: -6,
  semitoneShift: 0,
};

function compositionWith(events: CompositionEvent[], durationSeconds = 15): Composition {
  return { id: "composition-1", projectId: "project-1", title: "测试", bpm: 88, durationSeconds, seed: "seed", revision: 1, createdAt: "2026-01-01T00:00:00.000Z", soundUnitIds: ["unit-1"], events, polishLayer: null, polishEnabled: false, arrangerVersion: "arranger-v2" } as Composition;
}

describe("clip capacity", () => {
  it("reports a selection that fits inside the current work", () => {
    const [shortest] = COMPOSITION_DURATION_OPTIONS;
    expect(evaluateClipCapacity(shortest - 6, shortest)).toMatchObject({ fits: true, overflowSeconds: 0, suggestedDurationSeconds: null });
  });

  it("suggests the shortest work length that keeps the whole selection", () => {
    const [shortest, middle, longest] = COMPOSITION_DURATION_OPTIONS;
    expect(evaluateClipCapacity(shortest + 2, shortest)).toMatchObject({ fits: false, overflowSeconds: 2, suggestedDurationSeconds: middle });
    expect(evaluateClipCapacity(middle + 2, shortest).suggestedDurationSeconds).toBe(longest);
  });

  it("has no suggestion when even the longest work cannot hold the selection", () => {
    expect(smallestDurationOptionFor(LONGEST_COMPOSITION_SECONDS + 1)).toBeNull();
  });

  it("treats user chosen clips as the minimum work length", () => {
    const composition = compositionWith([
      { ...baseEvent, sourceClipVersion: "source-clip-v1", sourceClipOrigin: "user", sourceSelectionDurationSeconds: 18.4, clipDurationSeconds: 18.4 },
      { ...baseEvent, id: "event-2", generatedBy: "natural-sound-continuity-v1", sourceClipVersion: "source-clip-v1", sourceSelectionDurationSeconds: 28, clipDurationSeconds: 28 },
    ], 30);
    expect(minimumCompositionSecondsForUserClips(composition)).toBe(18.4);
    expect(durationOptionFitsUserClips(composition, COMPOSITION_DURATION_OPTIONS[0] - 5)).toBe(false);
    expect(durationOptionFitsUserClips(composition, COMPOSITION_DURATION_OPTIONS[0])).toBe(true);
  });

  it("ignores compositions without editable clip selections", () => {
    expect(minimumCompositionSecondsForUserClips(compositionWith([baseEvent]))).toBe(0);
    expect(minimumCompositionSecondsForUserClips(null)).toBe(0);
  });
});

describe("sources longer than the work", () => {
  it("reports the sound, its original length and the work length that would hold it", () => {
    const composition = compositionWith([
      { ...baseEvent, audioAssetId: "audio-wind", sourceClipVersion: "source-clip-v1", sourceClipOrigin: "full-source", sourceOffsetSeconds: 0, sourceSelectionDurationSeconds: 15, clipDurationSeconds: 15 },
      { ...baseEvent, id: "event-support", audioAssetId: "audio-wind", generatedBy: "natural-sound-continuity-v1" },
    ], 15);

    expect(listOversizedSourceEvents(composition, MOCK_ORIGINAL_AUDIO_ASSETS)).toEqual([
      { eventId: "event-1", soundUnitId: "unit-1", sourceDurationSeconds: 18.991, usedSeconds: 15, suggestedDurationSeconds: COMPOSITION_DURATION_OPTIONS[0] },
    ]);
  });

  it("stays quiet when the whole source already fits", () => {
    const composition = compositionWith([{ ...baseEvent, audioAssetId: "audio-wind" }], 30);
    expect(listOversizedSourceEvents(composition, MOCK_ORIGINAL_AUDIO_ASSETS)).toEqual([]);
  });
});

