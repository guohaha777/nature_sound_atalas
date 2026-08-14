import { describe, expect, it } from "vitest";
import type { CompositionEvent } from "@/src/domain/composition";
import { resolveEventPlaybackDuration } from "./resolveEventPlaybackDuration";

const baseEvent: CompositionEvent = {
  id: "event-1",
  soundUnitId: "unit-1",
  audioAssetId: "audio-1",
  sourceKey: "cow",
  startBeat: 0,
  durationBeats: 1,
  gainDb: 0,
  semitoneShift: 0,
};

describe("resolveEventPlaybackDuration", () => {
  it("keeps the source intact when it fits the work boundary", () => {
    expect(resolveEventPlaybackDuration(baseEvent, 60, 12)).toEqual({
      naturalSeconds: 12,
      playbackSeconds: 12,
      shouldLoop: false,
      wasTrimmed: false,
    });
  });

  it("accounts for pitch playback rate while still consuming the full buffer", () => {
    expect(resolveEventPlaybackDuration({ ...baseEvent, semitoneShift: 12 }, 60, 12)).toMatchObject({
      naturalSeconds: 6,
      playbackSeconds: 6,
      wasTrimmed: false,
    });
  });

  it("only loops when an explicitly extended event is longer than the full source", () => {
    expect(resolveEventPlaybackDuration({ ...baseEvent, durationBeats: 8, loop: true }, 60, 3)).toEqual({
      naturalSeconds: 3,
      playbackSeconds: 8,
      shouldLoop: true,
      wasTrimmed: false,
    });
  });

  it("fits a derived clip inside the chosen work duration without changing the original file", () => {
    expect(resolveEventPlaybackDuration(baseEvent, 60, 12, 5)).toEqual({
      naturalSeconds: 12,
      playbackSeconds: 5,
      shouldLoop: false,
      wasTrimmed: true,
    });
  });
});
