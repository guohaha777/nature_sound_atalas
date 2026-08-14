import { describe, expect, it } from "vitest";
import { buildExperienceRoute } from "./buildExperienceRoute";

describe("buildExperienceRoute", () => {
  it("keeps the entrance query so resume returns to the same capture mode", () => {
    expect(buildExperienceRoute("/cards", "entry=record")).toBe("/cards?entry=record");
  });

  it("does not append an empty query", () => {
    expect(buildExperienceRoute("/world", "")).toBe("/world");
  });
});
