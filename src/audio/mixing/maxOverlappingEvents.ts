import type { Composition } from "@/src/domain/composition";

/**
 * 整首作品里最多有几个原声同时响。
 *
 * 儿童总线和背景总线的电平都由这个数推出来（见 mixPolicy），
 * 所以判断"背景是否确实低于原声"时必须用同一个口径，
 * 否则各处算出来的结论会互相矛盾。
 */
export function maxOverlappingEvents(composition: Composition): number {
  const secondsPerBeat = 60 / composition.bpm;
  const intervals = composition.events
    .map((event) => {
      const start = event.startBeat * secondsPerBeat;
      return { start, end: Math.min(composition.durationSeconds, start + event.durationBeats * secondsPerBeat) };
    })
    .filter((interval) => interval.end > interval.start);
  if (intervals.length === 0) return 1;

  // 扫描线：起点 +1、终点 -1，峰值就是最大重叠数。
  const points = intervals
    .flatMap((interval) => [{ at: interval.start, delta: 1 }, { at: interval.end, delta: -1 }])
    // 同一时刻先减后加：一个声音结束的瞬间不算和下一个重叠。
    .sort((a, b) => a.at - b.at || a.delta - b.delta);

  let active = 0;
  let peak = 1;
  points.forEach((point) => {
    active += point.delta;
    peak = Math.max(peak, active);
  });
  return peak;
}
