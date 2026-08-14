import { describe, expect, it } from "vitest";
import { buildHomeEntryRoute } from "./buildHomeEntryRoute";

describe("buildHomeEntryRoute", () => {
  it("carries the paper-card acquisition choice into capture", () => {
    expect(buildHomeEntryRoute("diary", "upload")).toBe("/cards?entry=diary&capture=upload");
  });

  it("carries the original-sound choice into capture", () => {
    expect(buildHomeEntryRoute("record", "library")).toBe("/cards?entry=record&source=library");
  });
});
