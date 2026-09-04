import { describe, expect, it } from "vitest";
import { expectedGenerationSeconds, GENERATION_STAGE_MESSAGES, readGenerationProgress } from "./generationProgress";

describe("背景生成等待提示", () => {
  it("进度只增不减，且不会自己走满", () => {
    const samples = [0, 1_000, 5_000, 15_000, 30_000, 120_000].map((elapsed) => readGenerationProgress(elapsed, 30).percent);
    expect(samples).toEqual([...samples].sort((a, b) => a - b));
    expect(samples[0]).toBe(0);
    expect(Math.max(...samples)).toBeLessThan(100);
  });

  it("按等待时间依次给出不同的说明", () => {
    const first = readGenerationProgress(0, 30).message;
    const middle = readGenerationProgress(15_000, 30).message;
    const last = readGenerationProgress(29_000, 30).message;
    expect(first).toBe(GENERATION_STAGE_MESSAGES[0]);
    expect(middle).not.toBe(first);
    expect(last).toBe(GENERATION_STAGE_MESSAGES[GENERATION_STAGE_MESSAGES.length - 1]);
  });

  it("超过预期时间才补一句解释", () => {
    expect(readGenerationProgress(20_000, 30).hint).toBeNull();
    expect(readGenerationProgress(40_000, 30).hint).toContain("再等一小会儿");
  });

  it("作品越长，预计等待越久", () => {
    expect(expectedGenerationSeconds(20)).toBeLessThan(expectedGenerationSeconds(45));
  });
});
