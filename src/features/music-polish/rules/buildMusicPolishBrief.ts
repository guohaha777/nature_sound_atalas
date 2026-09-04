import type { Composition } from "@/src/domain/composition";
import type { ConfirmedSoundCard, SoundUnit } from "@/src/domain/sound-card";
import type { MusicPolishBrief } from "../contracts";

/** 段落比例：引子、发展、主要变化、收束。伴奏据此对齐时间线。 */
const SECTION_BOUNDARIES = [
  { name: "intro" as const, from: 0, to: 0.18 },
  { name: "development" as const, from: 0.18, to: 0.55 },
  { name: "peak" as const, from: 0.55, to: 0.8 },
  { name: "ending" as const, from: 0.8, to: 1 },
];

const MIN_QUIET_WINDOW_SECONDS = 1.2;

export function buildMusicPolishBrief(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[]): MusicPolishBrief {
  const selectedUnits = units.filter((unit) => composition.soundUnitIds.includes(unit.id));
  const selectedCards = selectedUnits.flatMap((unit) => {
    const card = cards.find((candidate) => candidate.id === unit.cardId);
    return card ? [{ ...card, ...unit.parameters }] : [];
  });
  const count = <T extends string>(values: T[], key: T) => values.filter((value) => value === key).length;
  const pitches = selectedCards.map((card) => card.pitch);
  const intensities = selectedCards.map((card) => card.intensity);
  const patterns = selectedCards.map((card) => card.pattern);
  const lastBeat = Math.max(1, ...composition.events.map((event) => event.startBeat));
  const secondsPerBeat = 60 / composition.bpm;
  const durationSeconds = composition.durationSeconds;

  const childEvents = composition.events.slice(0, 64).flatMap((event, index) => {
    const unit = units.find((candidate) => candidate.id === event.soundUnitId);
    if (!unit) return [];
    const startSeconds = Math.min(durationSeconds, event.startBeat * secondsPerBeat);
    const playedSeconds = event.clipDurationSeconds ?? event.durationBeats * secondsPerBeat;
    const endSeconds = Math.min(durationSeconds, startSeconds + Math.max(0.1, playedSeconds));
    return [{
      soundIndex: index + 1,
      startSeconds: round(startSeconds),
      endSeconds: round(endSeconds),
      startRatio: round(Math.min(1, startSeconds / durationSeconds)),
      durationRatio: round(Math.min(1, (endSeconds - startSeconds) / durationSeconds)),
      pitch: unit.parameters.pitch,
      intensity: unit.parameters.intensity,
      pattern: unit.parameters.pattern,
      contour: unit.parameters.contour,
    }];
  });

  return {
    version: "music-polish-brief-v4",
    bpm: composition.bpm,
    durationSeconds,
    soundCount: Math.max(1, selectedUnits.length),
    eventCount: Math.max(1, composition.events.length),
    pitchProfile: { high: count(pitches, "high"), mid: count(pitches, "mid"), low: count(pitches, "low") },
    intensityProfile: { soft: count(intensities, "soft"), medium: count(intensities, "medium"), loud: count(intensities, "loud") },
    patternProfile: { once: count(patterns, "once"), repeat: count(patterns, "repeat"), bursts: count(patterns, "bursts"), fadeIn: count(patterns, "fade-in") },
    emotion: composition.emotionIntent.enabled ? composition.emotionIntent.label : null,
    emotionCoordinates: {
      enabled: composition.emotionIntent.enabled,
      valence: composition.emotionIntent.valence,
      arousal: composition.emotionIntent.arousal,
    },
    eventPositions: composition.events.slice(0, 128).map((event) => Number((event.startBeat / lastBeat).toFixed(3))),
    sections: buildSections(durationSeconds, childEvents),
    soundEvents: childEvents,
    quietWindows: findQuietWindows(childEvents, durationSeconds),
    busiestWindow: findBusiestWindow(childEvents, durationSeconds),
  };
}

function buildSections(durationSeconds: number, childEvents: MusicPolishBrief["soundEvents"]): MusicPolishBrief["sections"] {
  return SECTION_BOUNDARIES.map(({ name, from, to }) => {
    const startSeconds = round(durationSeconds * from);
    const endSeconds = round(durationSeconds * to);
    return {
      name,
      startSeconds,
      endSeconds,
      childEventCount: childEvents.filter((event) => event.startSeconds < endSeconds && event.endSeconds > startSeconds).length,
    };
  });
}

/** 孩子声音之间够长的空白；伴奏可以在这里说话，而不是全程铺底。 */
function findQuietWindows(childEvents: MusicPolishBrief["soundEvents"], durationSeconds: number) {
  const busy = mergeIntervals(childEvents.map((event) => ({ start: event.startSeconds, end: event.endSeconds })));
  const windows: Array<{ startSeconds: number; endSeconds: number }> = [];
  let cursor = 0;
  busy.forEach((interval) => {
    if (interval.start - cursor >= MIN_QUIET_WINDOW_SECONDS) windows.push({ startSeconds: round(cursor), endSeconds: round(interval.start) });
    cursor = Math.max(cursor, interval.end);
  });
  if (durationSeconds - cursor >= MIN_QUIET_WINDOW_SECONDS) windows.push({ startSeconds: round(cursor), endSeconds: round(durationSeconds) });
  return windows.slice(0, 32);
}

/** 用固定窗口扫一遍，找出孩子声音最密集的一段。 */
function findBusiestWindow(childEvents: MusicPolishBrief["soundEvents"], durationSeconds: number) {
  if (childEvents.length === 0) return null;
  const windowSeconds = Math.min(durationSeconds, Math.max(3, durationSeconds * 0.2));
  let best = { startSeconds: 0, endSeconds: round(windowSeconds), score: -1 };
  for (let start = 0; start + windowSeconds <= durationSeconds + 0.001; start += 0.5) {
    const end = start + windowSeconds;
    const score = childEvents.filter((event) => event.startSeconds < end && event.endSeconds > start).length;
    if (score > best.score) best = { startSeconds: round(start), endSeconds: round(end), score };
  }
  return { startSeconds: best.startSeconds, endSeconds: best.endSeconds };
}

function mergeIntervals(intervals: Array<{ start: number; end: number }>) {
  const merged: Array<{ start: number; end: number }> = [];
  intervals.sort((a, b) => a.start - b.start).forEach((interval) => {
    const last = merged.at(-1);
    if (last && interval.start <= last.end + 0.05) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  });
  return merged;
}

function round(value: number) {
  return Number(value.toFixed(3));
}
