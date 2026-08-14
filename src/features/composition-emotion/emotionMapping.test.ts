import { describe, expect, it } from "vitest";
import { clampEmotionCoordinate, resolveEmotionSelection } from "./emotionMapping";

describe("composition emotion mapping", () => {
  it.each([
    [0.6, 0.7, "bright"],
    [0.6, -0.7, "content"],
    [-0.6, 0.7, "tense"],
    [-0.6, -0.7, "blue"],
  ] as const)("maps (%s, %s) to %s", (valence, arousal, label) => {
    expect(resolveEmotionSelection(valence, arousal).label).toBe(label);
  });

  it("clamps direct manipulation to the domain", () => {
    expect(clampEmotionCoordinate(1.4)).toBe(1);
    expect(clampEmotionCoordinate(-2)).toBe(-1);
  });

  it("keeps a usable neutral zone on both axes", () => {
    expect(resolveEmotionSelection(0, 0).keyword).toBe("中立");
    expect(resolveEmotionSelection(0, 0.8).keyword).toBe("中立 · 激动");
    expect(resolveEmotionSelection(0.8, 0).keyword).toBe("开心 · 中等活力");
    expect(clampEmotionCoordinate(0.08)).toBe(0);
  });
});
