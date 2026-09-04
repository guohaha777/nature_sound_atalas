import { describe, expect, it } from "vitest";
import { applyFades, resolveFades } from "./fitBackgroundAudio";

/** 背景垫都是持续音，用全 1 的信号能直接读出包络。 */
function flatSignal(frames: number) {
  return [new Float32Array(frames).fill(1)];
}

describe("背景层淡入淡出", () => {
  it("首尾归零，中段保持原样", () => {
    const sampleRate = 100;
    const channels = flatSignal(10 * sampleRate);
    applyFades(channels, sampleRate, { fadeInSeconds: 1, fadeOutSeconds: 2 });
    const data = channels[0];

    expect(data[0]).toBeCloseTo(0, 5);
    expect(data[data.length - 1]).toBeCloseTo(0, 2);
    // 淡入结束到淡出开始之间不应被改动。
    expect(data[Math.round(2 * sampleRate)]).toBeCloseTo(1, 5);
    expect(data[Math.round(7 * sampleRate)]).toBeCloseTo(1, 5);
  });

  it("包络单调：淡入只升，淡出只降", () => {
    const sampleRate = 100;
    const channels = flatSignal(10 * sampleRate);
    applyFades(channels, sampleRate, { fadeInSeconds: 1, fadeOutSeconds: 2 });
    const data = channels[0];

    const fadeIn = Array.from(data.subarray(0, sampleRate));
    expect(fadeIn).toEqual([...fadeIn].sort((a, b) => a - b));

    const fadeOut = Array.from(data.subarray(data.length - 2 * sampleRate));
    expect(fadeOut).toEqual([...fadeOut].sort((a, b) => b - a));
  });

  it("等功率曲线在中点高于线性，避免持续音中途听起来塌陷", () => {
    const sampleRate = 100;
    const channels = flatSignal(2 * sampleRate);
    applyFades(channels, sampleRate, { fadeInSeconds: 2, fadeOutSeconds: 0 });
    expect(channels[0][sampleRate]).toBeGreaterThan(0.5);
  });

  it("多声道用同一条包络", () => {
    const sampleRate = 100;
    const channels = [new Float32Array(5 * sampleRate).fill(1), new Float32Array(5 * sampleRate).fill(1)];
    applyFades(channels, sampleRate, { fadeInSeconds: 1, fadeOutSeconds: 1 });
    expect(Array.from(channels[0])).toEqual(Array.from(channels[1]));
  });

  it("淡出比作品还长时不越界，也不吃掉淡入", () => {
    const sampleRate = 100;
    const channels = flatSignal(sampleRate);
    applyFades(channels, sampleRate, { fadeInSeconds: 10, fadeOutSeconds: 10 });
    expect(channels[0].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
  });
});

describe("按作品时长收敛淡入淡出", () => {
  it("45 秒作品用满默认值", () => {
    expect(resolveFades(45, {})).toEqual({ fadeInSeconds: 0.35, fadeOutSeconds: 1.2 });
  });

  it("20 秒作品也用得起默认值", () => {
    expect(resolveFades(20, {})).toEqual({ fadeInSeconds: 0.35, fadeOutSeconds: 1.2 });
  });

  it("极短作品按比例压缩，合计不超过三分之一", () => {
    const fades = resolveFades(3, { fadeInSeconds: 1, fadeOutSeconds: 3 });
    expect(fades.fadeInSeconds + fades.fadeOutSeconds).toBeCloseTo(1, 5);
    // 压缩后仍保持原来的长短关系：收尾长于开头。
    expect(fades.fadeOutSeconds).toBeGreaterThan(fades.fadeInSeconds);
  });
});
