import type { SoundUnit } from "../sound-card";
import type { Composition, CompositionContextAnalysis } from "./types";

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
    const band = event.semitoneShift >= 4 ? "high" : event.semitoneShift <= -4 ? "low" : "mid";
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
    const band = event.semitoneShift >= 4 ? "high" : event.semitoneShift <= -4 ? "low" : "mid";
    const key = `${event.startBeat.toFixed(3)}:${band}`;
    overlapCounts.set(key, (overlapCounts.get(key) ?? 0) + 1);
  });
  const exactOverlapGroups = Array.from(overlapCounts.values()).filter((count) => count >= 4).length;
  const status = density === "busy" || exactOverlapGroups > 0 ? "review" : "ready";
  const notice = exactOverlapGroups > 0
    ? "有几个声音叠在同一位置。先听一听；如果分不清，可以把它们左右错开一点。"
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
