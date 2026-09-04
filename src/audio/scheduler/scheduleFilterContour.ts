import type * as Tone from "tone";

export type FilterMotion = "up" | "down" | "none" | "lfo";

/**
 * 按孩子选的"音色变化"给这一声安排扫频。
 *
 * 实时播放和离线渲染共用同一份实现：送给音乐模型的混音，
 * 必须和老师听到的是同一版，否则模型是在为另一段音频配背景。
 */
export function scheduleFilterContour(
  filter: Tone.Filter,
  motion: FilterMotion,
  time: number,
  durationSeconds: number,
): void {
  const frequency = filter.frequency;
  frequency.cancelScheduledValues(time);
  // 扫频范围刻意收窄：跨越几个八度的扫频听上去是电子效果器，不是"声音在变化"。
  if (motion === "up") {
    frequency.setValueAtTime(2600, time);
    frequency.exponentialRampToValueAtTime(11000, time + durationSeconds);
    return;
  }
  if (motion === "down") {
    frequency.setValueAtTime(11000, time);
    frequency.exponentialRampToValueAtTime(2600, time + durationSeconds);
    return;
  }
  if (motion === "lfo") {
    // 一次温和的起伏，而不是四次来回摆动。
    const half = durationSeconds / 2;
    frequency.setValueAtTime(5200, time);
    frequency.exponentialRampToValueAtTime(9000, time + half);
    frequency.exponentialRampToValueAtTime(5600, time + durationSeconds);
    return;
  }
  frequency.setValueAtTime(18000, time);
}
