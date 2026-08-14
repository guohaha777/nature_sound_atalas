import { describe, expect, it } from "vitest";
import { HOME_PAGE_MOCK } from "./homePageMockData";

describe("home page sound points", () => {
  it("maps the three scene positions to the confirmed public demo audio", () => {
    expect(HOME_PAGE_MOCK.sounds.map(({ id, position, audioSrc }) => ({ id, position, audioSrc }))).toEqual([
      { id: "wind", position: "cloud", audioSrc: "/demo/audio/wind.mp3" },
      { id: "forest-bird", position: "forest", audioSrc: "/demo/audio/forest-bird.mp3" },
      { id: "falling-apple", position: "apple", audioSrc: "/demo/audio/falling-apple.mp3" },
    ]);
  });
});
