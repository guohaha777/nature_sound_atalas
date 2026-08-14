import { describe, expect, it } from "vitest";
import { clampRecordingDuration, MAX_RECORDING_DURATION_MS } from "./recordingPolicy";

describe("recording policy", () => {
  it("caps a single recording at the declared maximum", () => {
    expect(clampRecordingDuration(MAX_RECORDING_DURATION_MS + 5_000)).toBe(MAX_RECORDING_DURATION_MS);
  });

  it("keeps valid shorter recording durations", () => {
    expect(clampRecordingDuration(12_345)).toBe(12_345);
  });
});
