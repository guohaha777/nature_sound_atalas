import { describe, expect, it } from "vitest";
import { createIdleLevels, pushLevel, readFrameLevel, RECORDING_LEVEL_BAR_COUNT } from "./levelMeter";

describe("录音音量条", () => {
  it("新音量从右侧进入并保持固定长度", () => {
    const full = Array.from({ length: RECORDING_LEVEL_BAR_COUNT }, (_, index) => index / RECORDING_LEVEL_BAR_COUNT);
    const next = pushLevel(full, 0.9);
    expect(next).toHaveLength(RECORDING_LEVEL_BAR_COUNT);
    expect(next.at(-1)).toBe(0.9);
    expect(next[0]).toBe(full[1]);
  });

  it("把越界或异常的音量收进 0 到 1", () => {
    expect(pushLevel([], 4.2).at(-1)).toBe(1);
    expect(pushLevel([], -1).at(-1)).toBe(0);
    expect(pushLevel([], Number.NaN).at(-1)).toBe(0);
  });

  it("静音是 0，有声音明显更大", () => {
    expect(readFrameLevel(new Float32Array(64))).toBe(0);
    expect(readFrameLevel(Float32Array.from({ length: 64 }, () => 0.5))).toBeGreaterThan(0.5);
  });

  it("空闲时是一排静止的零", () => {
    expect(createIdleLevels(5)).toEqual([0, 0, 0, 0, 0]);
  });
});
