import { describe, expect, it } from "vitest";
import { assessUploadedAudio, clampIngestSelection, MAX_INGEST_DURATION_SECONDS } from "./audioIngest";

describe("uploaded audio ingest policy", () => {
  it("requires a trim before saving audio longer than the ingest limit", () => {
    const assessment = assessUploadedAudio(48.5);
    expect(assessment.requiresTrim).toBe(true);
    expect(assessment.suggestedSelection).toEqual({ startSeconds: 0, endSeconds: MAX_INGEST_DURATION_SECONDS });
    expect(assessment.message).toContain("先截取");
  });

  it("accepts audio inside the ingest limit without a trim step", () => {
    const assessment = assessUploadedAudio(12.4);
    expect(assessment).toMatchObject({ requiresTrim: false, tooShort: false, suggestedSelection: { startSeconds: 0, endSeconds: 12.4 } });
  });

  it("rejects a file that is too short to be a sound source", () => {
    expect(assessUploadedAudio(0.1).tooShort).toBe(true);
  });

  it("never lets a trim selection exceed the ingest limit", () => {
    expect(clampIngestSelection({ startSeconds: 10, endSeconds: 90 }, 120)).toEqual({ startSeconds: 10, endSeconds: 10 + MAX_INGEST_DURATION_SECONDS });
  });

  it("keeps a valid trim selection untouched", () => {
    expect(clampIngestSelection({ startSeconds: 4, endSeconds: 19 }, 40)).toEqual({ startSeconds: 4, endSeconds: 19 });
  });
});
