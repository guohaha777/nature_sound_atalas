import { describe, expect, it } from "vitest";
import { clampSeekSeconds } from "./clampSeekSeconds";

describe("clampSeekSeconds", () => {
  it("keeps a seek target inside the playable duration", () => {
    expect(clampSeekSeconds(-4, 24)).toBe(0);
    expect(clampSeekSeconds(8.25, 24)).toBe(8.25);
    expect(clampSeekSeconds(40, 24)).toBe(24);
  });

  it("fails closed for invalid numbers", () => {
    expect(clampSeekSeconds(Number.NaN, 24)).toBe(0);
    expect(clampSeekSeconds(4, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
