import type { SymbolicMusicPlan } from "@/src/domain/composition";
import type { MusicPolishBrief } from "../contracts";
import { MAX_COMBINED_SILENCE_SECONDS, NO_ONSET_TAIL_SECONDS } from "./validateBackgroundArrangement";

type PlanEvent = SymbolicMusicPlan["events"][number];
type PlanVoice = PlanEvent["voice"];

const VOICES: PlanVoice[] = ["pad", "pulse", "mallet", "pluck", "bass"];
const MIN_EVENT_SECONDS = 0.08;
const MIN_NOTE = 36;
const MAX_NOTE = 84;
const MIN_VELOCITY = 0.04;
const MAX_VELOCITY = 0.5;
const MAX_EVENTS = 96;
/** 结尾长音至少要有这么长，才听得出是"收住"而不是断掉。 */
const MIN_CLOSING_SECONDS = 1.5;
const TAIL_SILENCE_SECONDS = 0.2;

export interface RepairedArrangement {
  /** 修补后仍然没有任何可发声的事件时为 null。 */
  plan: SymbolicMusicPlan | null;
  /** 这次修补了什么，用于判断提示词是否需要调整；会随作品一起归档。 */
  repairs: string[];
}

/**
 * 把模型返回的任意结果整理成一份能播放的伴奏方案。
 *
 * 取舍：格式问题一律修补，不因格式丢弃音乐。模型写了完整编排却漏写一个字段、
 * 或把时长写成 44.8 秒，都不应该让整首作品退回本地方案。
 * 修补只动格式、越界值和结尾，不改写模型的和声与段落安排。
 */
export function repairSymbolicMusicPlan(raw: unknown, brief: MusicPolishBrief): RepairedArrangement {
  const repairs: string[] = [];
  const duration = brief.durationSeconds;
  const source = raw as { version?: unknown; bpm?: unknown; durationSeconds?: unknown; events?: unknown } | null;

  if (!source || typeof source !== "object" || !Array.isArray(source.events)) {
    return { plan: null, repairs: ["模型没有返回可用的音符列表"] };
  }
  if (source.version !== "symbolic-music-plan-v1") repairs.push("补写方案版本号");
  if (typeof source.durationSeconds !== "number" || Math.abs(source.durationSeconds - duration) > 0.05) repairs.push("把时长对齐到作品长度");
  if (typeof source.bpm !== "number" || Math.abs(source.bpm - brief.bpm) > 0.01) repairs.push("把速度对齐到作品速度");

  let clampedValues = 0;
  const events = (source.events as unknown[]).flatMap((item) => {
    const event = item as Partial<PlanEvent> & { midiNotes?: unknown };
    const startSeconds = toNumber(event.startSeconds);
    const requested = toNumber(event.durationSeconds);
    if (startSeconds === null || requested === null) return [];
    if (startSeconds < 0 || startSeconds >= duration - 0.05) {
      clampedValues += 1;
      if (startSeconds >= duration - 0.05) return [];
    }
    const notes = Array.isArray(event.midiNotes)
      ? event.midiNotes.flatMap((note) => {
        const value = toNumber(note);
        if (value === null) return [];
        if (value < MIN_NOTE || value > MAX_NOTE) clampedValues += 1;
        return [Math.max(MIN_NOTE, Math.min(MAX_NOTE, Math.round(value)))];
      }).slice(0, 8)
      : [];
    if (notes.length === 0) return [];

    const start = Math.max(0, startSeconds);
    const maxDuration = duration - start - 0.05;
    if (requested > maxDuration + 0.001) clampedValues += 1;
    const durationSeconds = Math.max(MIN_EVENT_SECONDS, Math.min(requested, maxDuration));
    if (durationSeconds < MIN_EVENT_SECONDS) return [];

    const velocity = toNumber(event.velocity) ?? 0.12;
    if (velocity < MIN_VELOCITY || velocity > MAX_VELOCITY) clampedValues += 1;
    const voice = VOICES.includes(event.voice as PlanVoice) ? event.voice as PlanVoice : "pad";
    if (voice !== event.voice) clampedValues += 1;

    return [{
      startSeconds: round(start),
      durationSeconds: round(durationSeconds),
      midiNotes: notes,
      voice,
      velocity: round(Math.max(MIN_VELOCITY, Math.min(MAX_VELOCITY, velocity))),
    }];
  });

  if (clampedValues > 0) repairs.push(`把 ${clampedValues} 处越界的音高、力度或长度收进范围`);
  if (events.length === 0) return { plan: null, repairs: [...repairs, "模型没有返回可发声的音符"] };
  if (events.length > MAX_EVENTS) repairs.push(`只保留前 ${MAX_EVENTS} 个事件`);

  const kept = events.sort((a, b) => a.startSeconds - b.startSeconds).slice(0, MAX_EVENTS);
  const filled = fillDeadAir(kept, brief, repairs);
  const structured = closeEnding(filled, duration, repairs);

  return {
    plan: {
      version: "symbolic-music-plan-v1",
      bpm: brief.bpm,
      durationSeconds: duration,
      events: structured,
    },
    repairs,
  };
}

/**
 * 死气修补：伴奏与原声同时缺席太久时，把洞口之前最近的长音延长过去。
 * 模型常把"留白"放在孩子也没出声的地方；这属于放错位置，补一下即可，
 * 不必因为超出零点几秒就丢掉整份编排。
 */
function fillDeadAir(events: PlanEvent[], brief: MusicPolishBrief, repairs: string[]): PlanEvent[] {
  const duration = brief.durationSeconds;
  const audible = mergeIntervals([
    ...events.map((event) => ({ start: event.startSeconds, end: Math.min(duration, event.startSeconds + event.durationSeconds) })),
    ...brief.soundEvents.map((event) => ({ start: event.startSeconds, end: Math.min(duration, event.endSeconds) })),
  ]);

  let next = events;
  let filled = 0;
  let cursor = 0;
  audible.forEach((interval) => {
    if (interval.start - cursor > MAX_COMBINED_SILENCE_SECONDS) {
      const extended = extendSustainedInto(next, cursor, interval.start);
      if (extended) {
        next = extended;
        filled += 1;
      }
    }
    cursor = Math.max(cursor, interval.end);
  });
  if (duration - cursor > MAX_COMBINED_SILENCE_SECONDS) {
    const extended = extendSustainedInto(next, cursor, duration);
    if (extended) {
      next = extended;
      filled += 1;
    }
  }
  if (filled > 0) repairs.push(`把长音延长过 ${filled} 处过长的空白`);
  return next;
}

/** 把结束于空洞之前、最近的一个长音延长到空洞末端。 */
function extendSustainedInto(events: PlanEvent[], gapStart: number, gapEnd: number): PlanEvent[] | null {
  let index = -1;
  events.forEach((event, position) => {
    const end = event.startSeconds + event.durationSeconds;
    const isSustained = event.voice === "pad" || event.voice === "bass" || event.durationSeconds >= 1;
    if (!isSustained || end > gapStart + 0.05) return;
    if (index < 0 || end > events[index].startSeconds + events[index].durationSeconds) index = position;
  });
  if (index < 0) return null;
  const target = events[index];
  const next = [...events];
  next[index] = { ...target, durationSeconds: round(gapEnd - target.startSeconds) };
  return next;
}

function mergeIntervals(intervals: Array<{ start: number; end: number }>) {
  const merged: Array<{ start: number; end: number }> = [];
  intervals.sort((a, b) => a.start - b.start).forEach((interval) => {
    const last = merged.at(-1);
    if (last && interval.start <= last.end + 0.001) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  });
  return merged;
}

/**
 * 收尾修补：去掉结尾处新起的音，并把最后一个长音延长到作品末尾。
 * 这是"戛然而止"最常见的两种成因。
 */
function closeEnding(events: PlanEvent[], duration: number, repairs: string[]): PlanEvent[] {
  const lastOnsetAllowed = duration - NO_ONSET_TAIL_SECONDS;
  const withoutTailOnsets = events.filter((event) => event.startSeconds <= lastOnsetAllowed);
  const removed = events.length - withoutTailOnsets.length;
  const kept = withoutTailOnsets.length > 0 ? withoutTailOnsets : events;
  if (removed > 0 && withoutTailOnsets.length > 0) repairs.push(`删除结尾处新起的 ${removed} 个音`);

  const closingIndex = lastSustainedIndex(kept);
  if (closingIndex < 0) return kept;

  const closing = kept[closingIndex];
  const targetEnd = duration - TAIL_SILENCE_SECONDS;
  const currentEnd = closing.startSeconds + closing.durationSeconds;
  if (currentEnd >= targetEnd - 0.05) return kept;

  repairs.push("把最后的长音延长到结尾");
  const next = [...kept];
  next[closingIndex] = {
    ...closing,
    durationSeconds: round(Math.max(MIN_CLOSING_SECONDS, targetEnd - closing.startSeconds)),
  };
  return next;
}

/** 最后一个够长、适合用来收尾的音（优先长音铺底的声部）。 */
function lastSustainedIndex(events: PlanEvent[]): number {
  let best = -1;
  events.forEach((event, index) => {
    const isSustained = event.voice === "pad" || event.durationSeconds >= 1;
    if (isSustained && (best < 0 || event.startSeconds >= events[best].startSeconds)) best = index;
  });
  return best;
}

function toNumber(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

function round(value: number) {
  return Number(value.toFixed(3));
}
