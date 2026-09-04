import { pitchBandFromSemitoneShift } from "../music-mapping/mappingRulesV1";
import type { PitchChoice } from "../sound-card";
import type { CompositionEvent } from "./types";

/**
 * 编排面板上的“行”。
 *
 * 行原本等同于高低三档，纵向拖动会真的把孩子的录音移调 ±3 个半音——
 * 而高低在声音配方里已经选过一次了。孩子挪动音块通常只是想错开重叠，
 * 不该因此改变声音本身。所以行退回成纯布局：它只决定画在哪一条线上。
 *
 * 旧作品没有 lane 字段，按当初的移调量反推，画出来和从前一致。
 */
export const DEFAULT_LANE_COUNT = 3;
export const MAX_LANE_COUNT = 6;

const PITCH_LANE: Record<PitchChoice, number> = { high: 0, mid: 1, low: 2 };

/** 新声音默认落在哪一行：仍按声音配方的高低分三层，保留原来的观感。 */
export function laneFromPitch(pitch: PitchChoice): number {
  return PITCH_LANE[pitch];
}

/** 事件画在第几行；旧数据缺省时按移调量反推。 */
export function laneOfEvent(event: CompositionEvent): number {
  if (typeof event.lane === "number" && Number.isFinite(event.lane)) {
    return Math.max(0, Math.min(MAX_LANE_COUNT - 1, Math.round(event.lane)));
  }
  return laneFromPitch(pitchBandFromSemitoneShift(event.semitoneShift));
}

/** 面板要显示几行：至少三行，装得下已用到的最大行号，最多六行。 */
export function laneCountFor(events: CompositionEvent[]): number {
  const used = events.reduce((most, event) => Math.max(most, laneOfEvent(event)), 0);
  return Math.max(DEFAULT_LANE_COUNT, Math.min(MAX_LANE_COUNT, used + 1));
}

/**
 * 行在面板里的纵向位置（百分比）。
 * 三行时刻意沿用原来的 18 / 49 / 78，改动不该顺手动了现有版式。
 */
export function laneTopPercent(lane: number, laneCount: number): number {
  if (laneCount <= DEFAULT_LANE_COUNT) return [18, 49, 78][Math.min(2, lane)];
  const top = 14;
  const bottom = 82;
  return top + (bottom - top) * (lane / (laneCount - 1));
}
