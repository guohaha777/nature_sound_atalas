export const RECORDING_LEVEL_BAR_COUNT = 42;

/**
 * 录音波形的滚动缓冲：新的音量从右侧进入，旧的向左推出。
 * 纯函数便于测试，取样与绘制分别交给浏览器和组件。
 */
export function pushLevel(levels: number[], level: number, barCount = RECORDING_LEVEL_BAR_COUNT): number[] {
  const normalized = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  return [...levels, normalized].slice(-barCount);
}

export function createIdleLevels(barCount = RECORDING_LEVEL_BAR_COUNT): number[] {
  return Array.from({ length: barCount }, () => 0);
}

/** 把一帧时域采样换算成 0–1 的音量，并稍作放大，轻声也看得见。 */
export function readFrameLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) sum += samples[index] * samples[index];
  return Math.min(1, Math.sqrt(sum / samples.length) * 3.2);
}
