import type { OriginalAudioAsset } from "@/src/domain/audio-asset";
import type {
  Composition,
  CompositionDurationRecommendation,
  CompositionEvent,
  NaturalSoundContinuityPlan,
} from "@/src/domain/composition";
import type { SoundUnit } from "@/src/domain/sound-card";
import { COMPOSITION_DURATION_OPTIONS, type CompositionDurationSeconds } from "@/src/domain/composition";

export const NATURAL_SOUND_COVERAGE_TARGET = 0.6;
export const NATURAL_SOUND_MAX_GAP_SECONDS = 4;

interface Interval { start: number; end: number }

interface EligibleSource { unit: SoundUnit; asset: OriginalAudioAsset; template: CompositionEvent }

export function recommendCompositionDuration(
  units: SoundUnit[],
  assets: OriginalAudioAsset[],
): CompositionDurationRecommendation {
  const selected = units.filter((unit) => unit.active).flatMap((unit) => {
    const asset = assets.find((item) => item.id === unit.originalAudioAssetId);
    return asset ? [{ unit, seconds: asset.durationMs / 1000 }] : [];
  });
  const durations = selected.map((item) => item.seconds);
  const totalSourceSeconds = durations.reduce((sum, value) => sum + value, 0);
  const durationSpreadSeconds = durations.length > 1 ? Math.max(...durations) - Math.min(...durations) : 0;
  const count = selected.length;
  const longestSourceSeconds = durations.length ? Math.max(...durations) : 0;
  const repeated = selected.filter(({ unit }) => unit.parameters.pattern === "repeat" || unit.parameters.pattern === "bursts").length;

  const [shortest, middle, longest] = COMPOSITION_DURATION_OPTIONS;
  let seconds: CompositionDurationSeconds = shortest;
  let reason = `素材精简，约 ${shortest} 秒足够让声音形成清楚的小乐段。`;
  if (count >= 4 || totalSourceSeconds >= 40 || (count >= 3 && totalSourceSeconds >= 28)) {
    seconds = longest;
    reason = `声音数量或素材总长度较多，约 ${longest} 秒更适合展开成声音故事。`;
  } else if (count >= 2 || longestSourceSeconds > 20 || totalSourceSeconds >= 12 || durationSpreadSeconds >= 6) {
    seconds = middle;
    reason = `声音之间有足够的长短或数量变化，约 ${middle} 秒能保留发展和收束。`;
  } else if (repeated > 0) {
    reason = `短声音可以通过错落和呼应形成主题，约 ${shortest} 秒即可完整表达。`;
  }

  return {
    version: "duration-recommendation-v1",
    seconds,
    selectedSoundCount: count,
    totalSourceSeconds: round(totalSourceSeconds),
    durationSpreadSeconds: round(durationSpreadSeconds),
    reason,
  };
}

/**
 * 只补足自然声贯穿，不移动或删除儿童已有事件。重复规划时仅替换本规则生成的事件。
 */
export function ensureNaturalSoundContinuity(
  composition: Composition,
  units: SoundUnit[],
  assets: OriginalAudioAsset[],
): Composition {
  const retained = composition.events.filter((event) => event.generatedBy !== "natural-sound-continuity-v1");
  const eligible = composition.soundUnitIds.flatMap((unitId) => {
    const unit = units.find((item) => item.id === unitId);
    const asset = unit ? assets.find((item) => item.id === unit.originalAudioAssetId) : null;
    const template = retained.find((event) => event.soundUnitId === unitId);
    return unit && asset && template ? [{ unit, asset, template }] : [];
  });
  if (!eligible.length) {
    return { ...composition, events: retained, naturalSoundContinuity: emptyContinuityPlan(composition.durationSeconds) };
  }

  const additions: CompositionEvent[] = [];
  const addContinuityEvent = (source: EligibleSource, startSeconds: number, requestedClipSeconds?: number) => {
    const event = buildContinuityEvent(composition, source, startSeconds, additions.length, requestedClipSeconds);
    if (event) additions.push(event);
    return event !== null;
  };
  const anchors = [0.35, composition.durationSeconds * 0.5, Math.max(0, composition.durationSeconds - 2.2)];
  anchors.forEach((start, index) => {
    const current = analyzeNaturalSoundCoverage({ ...composition, events: [...retained, ...additions] }, assets);
    const flags = [current.openingCovered, current.middleCovered, current.endingCovered];
    if (!flags[index]) addContinuityEvent(eligible[index % eligible.length], start);
  });

  for (let guard = 0; guard < 28; guard += 1) {
    const draft = { ...composition, events: [...retained, ...additions] };
    const analysis = analyzeNaturalSoundCoverage(draft, assets);
    if (analysis.coverageRatio >= NATURAL_SOUND_COVERAGE_TARGET && analysis.maxSilentGapSeconds <= NATURAL_SOUND_MAX_GAP_SECONDS) break;
    const gap = largestGap(buildIntervals(draft, assets), composition.durationSeconds);
    if (!gap || gap.end - gap.start <= 0.05) break;
    const desiredClip = Math.min(2.8, Math.max(1.4, gap.end - gap.start));
    const start = Math.max(0, Math.min(composition.durationSeconds - desiredClip, gap.start + (gap.end - gap.start - desiredClip) / 2));
    // 用户选区放不进这个空隙时不缩短它，改为放弃这次补齐。
    const placed = eligible.some((_, offset) => addContinuityEvent(eligible[(additions.length + offset) % eligible.length], start, desiredClip));
    if (!placed) break;
  }

  const events = [...retained, ...additions].sort((a, b) => a.startBeat - b.startBeat);
  const naturalSoundContinuity = analyzeNaturalSoundCoverage({ ...composition, events }, assets, additions.length);
  return { ...composition, events, naturalSoundContinuity };
}

export function analyzeNaturalSoundCoverage(
  composition: Composition,
  assets: OriginalAudioAsset[],
  generatedEventCount = composition.events.filter((event) => event.generatedBy === "natural-sound-continuity-v1").length,
): NaturalSoundContinuityPlan {
  const intervals = mergeIntervals(buildIntervals(composition, assets));
  const audibleSeconds = intervals.reduce((sum, interval) => sum + interval.end - interval.start, 0);
  const openingWindow: Interval = { start: 0, end: composition.durationSeconds * 0.25 };
  const middleWindow: Interval = { start: composition.durationSeconds * 0.35, end: composition.durationSeconds * 0.65 };
  const endingWindow: Interval = { start: composition.durationSeconds * 0.75, end: composition.durationSeconds };
  return {
    version: "natural-sound-continuity-v1",
    coverageRatio: round(Math.min(1, audibleSeconds / Math.max(0.001, composition.durationSeconds))),
    maxSilentGapSeconds: round(largestGap(intervals, composition.durationSeconds)?.length ?? 0),
    openingCovered: intervals.some((interval) => overlaps(interval, openingWindow)),
    middleCovered: intervals.some((interval) => overlaps(interval, middleWindow)),
    endingCovered: intervals.some((interval) => overlaps(interval, endingWindow)),
    generatedEventCount,
  };
}

/**
 * P2 自动编排只能决定这次补齐出现在哪里、用哪个层次；
 * 儿童在声场里选好的声音片段按原样重复使用，放不下时宁可不补。
 */
function buildContinuityEvent(
  composition: Composition,
  source: EligibleSource,
  requestedStartSeconds: number,
  index: number,
  requestedClipSeconds = 2.4,
): CompositionEvent | null {
  const sourceSeconds = Math.min(30, source.asset.durationMs / 1000);
  const selectedStartSeconds = source.template.sourceClipVersion === "source-clip-v1" ? source.template.sourceOffsetSeconds ?? 0 : 0;
  const selectedDurationSeconds = source.template.sourceClipVersion === "source-clip-v1"
    ? Math.min(source.template.sourceSelectionDurationSeconds ?? source.template.clipDurationSeconds ?? sourceSeconds, Math.max(0.01, sourceSeconds - selectedStartSeconds))
    : sourceSeconds;
  const userChosenClip = source.template.sourceClipOrigin === "user";
  if (userChosenClip && selectedDurationSeconds > composition.durationSeconds + 0.001) return null;
  const clipDurationSeconds = userChosenClip
    ? selectedDurationSeconds
    : Math.min(requestedClipSeconds, composition.durationSeconds);
  const startSeconds = Math.max(0, Math.min(composition.durationSeconds - clipDurationSeconds, requestedStartSeconds));
  const shouldLoop = selectedDurationSeconds + 0.01 < clipDurationSeconds;
  const maxRelativeOffset = Math.max(0, selectedDurationSeconds - clipDurationSeconds);
  const sourceOffsetSeconds = shouldLoop
    ? selectedStartSeconds
    : selectedStartSeconds + maxRelativeOffset * Math.min(1, startSeconds / Math.max(0.001, composition.durationSeconds));
  const variation = [-1.2, 0.6, -0.4, 1][index % 4];
  return {
    ...source.template,
    id: `${source.unit.id}-continuity-${index}`,
    startBeat: startSeconds * composition.bpm / 60,
    durationBeats: clipDurationSeconds * composition.bpm / 60,
    gainDb: source.template.gainDb + variation,
    semitoneShift: source.template.semitoneShift + (shouldLoop ? [-0.35, 0.2, 0, 0.35][index % 4] : 0),
    fadeInSeconds: Math.min(source.template.fadeInSeconds ?? 0.08, clipDurationSeconds / 4),
    fadeOutSeconds: Math.min(startSeconds >= composition.durationSeconds * 0.75 ? 0.9 : 0.45, clipDurationSeconds / 2),
    loop: shouldLoop,
    sourceOffsetSeconds: round(sourceOffsetSeconds),
    sourceSelectionDurationSeconds: round(shouldLoop
      ? selectedDurationSeconds
      : Math.max(0.01, Math.min(clipDurationSeconds, selectedDurationSeconds - (sourceOffsetSeconds - selectedStartSeconds)))),
    clipDurationSeconds: round(clipDurationSeconds),
    generatedBy: "natural-sound-continuity-v1",
  };
}

function buildIntervals(composition: Composition, assets: OriginalAudioAsset[]): Interval[] {
  const secondsPerBeat = 60 / composition.bpm;
  return composition.events.flatMap((event) => {
    const asset = assets.find((item) => item.id === event.audioAssetId);
    if (!asset) return [];
    const start = event.startBeat * secondsPerBeat;
    if (start >= composition.durationSeconds) return [];
    const available = Math.max(0.01, Math.min(
      asset.durationMs / 1000 - (event.sourceOffsetSeconds ?? 0),
      event.sourceSelectionDurationSeconds ?? Number.POSITIVE_INFINITY,
    ));
    const requested = event.durationBeats * secondsPerBeat;
    const planned = event.clipDurationSeconds ?? (event.loop && requested > available ? requested : available);
    const end = Math.min(composition.durationSeconds, start + Math.max(0.01, planned));
    return end > start ? [{ start, end }] : [];
  });
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const merged: Interval[] = [];
  intervals.sort((a, b) => a.start - b.start).forEach((interval) => {
    const last = merged.at(-1);
    if (last && interval.start <= last.end + 0.001) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  });
  return merged;
}

function largestGap(intervals: Interval[], durationSeconds: number): (Interval & { length: number }) | null {
  const merged = mergeIntervals(intervals);
  const gaps: Interval[] = [];
  let cursor = 0;
  merged.forEach((interval) => {
    if (interval.start > cursor) gaps.push({ start: cursor, end: interval.start });
    cursor = Math.max(cursor, interval.end);
  });
  if (cursor < durationSeconds) gaps.push({ start: cursor, end: durationSeconds });
  const gap = gaps.sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
  return gap ? { ...gap, length: gap.end - gap.start } : null;
}

function overlaps(a: Interval, b: Interval) {
  return a.end > b.start + 0.001 && a.start < b.end - 0.001;
}

function emptyContinuityPlan(durationSeconds: number): NaturalSoundContinuityPlan {
  return {
    version: "natural-sound-continuity-v1",
    coverageRatio: 0,
    maxSilentGapSeconds: durationSeconds,
    openingCovered: false,
    middleCovered: false,
    endingCovered: false,
    generatedEventCount: 0,
  };
}

function round(value: number) {
  return Number(value.toFixed(3));
}
