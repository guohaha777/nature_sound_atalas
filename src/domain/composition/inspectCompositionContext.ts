import type { SoundUnit } from "../sound-card";
import type { Composition, CompositionContextAnalysis } from "./types";
import { pitchBandFromSemitoneShift } from "../music-mapping/mappingRulesV1";

export type CompositionArrangementDecision = CompositionContextAnalysis["decision"];

/** 对当前基础作品做确定性检查。它不修改儿童的声音或位置。 */
export function inspectCompositionContext(
  composition: Composition,
  units: SoundUnit[],
  decision: CompositionArrangementDecision,
): CompositionContextAnalysis {
  const selected = new Set(composition.soundUnitIds);
  const selectedUnits = units.filter((unit) => selected.has(unit.id));
  const pitchBandUnitIds = { high: new Set<string>(), mid: new Set<string>(), low: new Set<string>() };
  composition.events.forEach((event) => {
    const band = pitchBandFromSemitoneShift(event.semitoneShift);
    pitchBandUnitIds[band].add(event.soundUnitId);
  });
  const pitchBandCounts = {
    high: pitchBandUnitIds.high.size,
    mid: pitchBandUnitIds.mid.size,
    low: pitchBandUnitIds.low.size,
  };
  const eventsPerSecond = composition.events.length / Math.max(1, composition.durationSeconds);
  const density = eventsPerSecond > 1.5 ? "busy" : eventsPerSecond < 0.35 ? "open" : "balanced";
  const overlapCounts = new Map<string, number>();
  composition.events.forEach((event) => {
    const band = pitchBandFromSemitoneShift(event.semitoneShift);
    const key = `${event.startBeat.toFixed(3)}:${band}`;
    overlapCounts.set(key, (overlapCounts.get(key) ?? 0) + 1);
  });
  const exactOverlapGroups = Array.from(overlapCounts.values()).filter((count) => count >= 4).length;
  const secondsPerBeat = 60 / composition.bpm;
  const starts = composition.events.map((event) => event.startBeat * secondsPerBeat).sort((a, b) => a - b);
  const overDenseWindows = starts.filter((start, index) => starts.slice(index, index + 4).length === 4 && starts[index + 3] - start <= 1).length;
  const plannedIntervals = composition.events.map((event) => ({
    start: event.startBeat * secondsPerBeat,
    end: Math.min(composition.durationSeconds, event.startBeat * secondsPerBeat + (event.clipDurationSeconds ?? event.durationBeats * secondsPerBeat)),
  })).sort((a, b) => a.start - b.start);
  let intervalCursor = 0;
  let longestSilentGapSeconds = 0;
  plannedIntervals.forEach((interval) => {
    longestSilentGapSeconds = Math.max(longestSilentGapSeconds, interval.start - intervalCursor);
    intervalCursor = Math.max(intervalCursor, interval.end);
  });
  longestSilentGapSeconds = Math.max(longestSilentGapSeconds, composition.durationSeconds - intervalCursor);
  const occupiedPitchBands = Object.values(pitchBandCounts).filter((count) => count > 0).length;
  const pitchImbalance = selectedUnits.length >= 3 && occupiedPitchBands === 1;
  const hasLongSilence = composition.arrangerVersion === "arranger-v2" && longestSilentGapSeconds > 4;
  const status = density === "busy" || exactOverlapGroups > 0 || overDenseWindows > 0 || pitchImbalance || hasLongSilence ? "review" : "ready";
  const notice = exactOverlapGroups > 0
    ? "有几个声音叠在同一位置。先听一听；如果分不清，可以把它们左右错开一点。"
    : overDenseWindows > 0
      ? "有一小段声音靠得很近。先听一听；如果分不清，可以让它们轮流出现。"
      : pitchImbalance
        ? "这些声音集中在相近的高低位置。可以保留孩子的选择，试听后再决定是否增加对比。"
        : hasLongSilence
          ? "作品中有一段较长的空位。系统会先用已有自然声轻轻补齐，再请你试听。"
    : density === "busy"
      ? "声音出现得很密。先听一听；如果有点挤，可以删掉一个声音点或把它们拉开。"
      : null;
  const reason = decision === "run-deterministic-arranger"
    ? "当前没有可保留的儿童编排，按已确认的声音参数建立基础声谱。"
    : decision === "preserve-and-extend"
      ? "保留儿童已经摆放的声音，只为新加入的声音补充初始位置。"
      : "儿童已经完成摆放，保持现有位置、先后与叠放关系。";

  return {
    version: "composition-context-v1",
    selectedSoundCount: selectedUnits.length,
    eventCount: composition.events.length,
    pitchBandCounts,
    density,
    exactOverlapGroups,
    overDenseWindows,
    longestSilentGapSeconds: Number(longestSilentGapSeconds.toFixed(3)),
    pitchImbalance,
    status,
    notice,
    decision,
    reason,
  };
}

export function attachCompositionContext(
  composition: Composition,
  units: SoundUnit[],
  decision: CompositionArrangementDecision,
): Composition {
  return { ...composition, contextAnalysis: inspectCompositionContext(composition, units, decision) };
}
