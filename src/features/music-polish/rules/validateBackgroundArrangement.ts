import type { SymbolicMusicPlan } from "@/src/domain/composition";
import { NATURAL_SOUND_MAX_GAP_SECONDS } from "@/src/features/composition-duration";
import type { MusicPolishBrief } from "../contracts";

/**
 * 只保留三条硬规则，其余一律改为修补或软信号。
 * 判断标准：这一条不满足时，作品是不是真的坏了？如果只是"不够好"，就不该拒绝——
 * 拒绝的代价是整份编排作废、退回本地方案，比留下一段平淡的背景更糟。
 */
export interface BackgroundArrangementCheck {
  ok: boolean;
  /** 不合格时给出可以直接显示给老师的原因。 */
  reason: string | null;
  signals: BackgroundArrangementSignals;
}

/** 只记录不拦截，用来判断提示词写得好不好。 */
export interface BackgroundArrangementSignals {
  /** 背景明显在唱主角、且孩子没有出声的时间占比。 */
  backgroundLedRatio: number;
  /** 伴奏与原声同时缺席的最长一段。 */
  longestCombinedSilenceSeconds: number;
  /** 相邻段落之间发生了可听变化的次数。 */
  sectionChanges: number;
  /** 结尾是否比全曲最响处更轻。 */
  endingFadesOut: boolean;
}

/**
 * 哪些声部算"背景在唱"。
 *
 * 原来用力度阈值判断，但符号力度不是响度——真实响度取决于总线，
 * 一改编排的力度这条判据就失准。改用**声部角色**：
 * 旋律声部单独在唱时才算背景为主；pad 与 bass 是托底，
 * 在原声的空隙里垫一下不算抢主角。
 *
 * 响度上"原声为主"由混音结构保证（背景总线永远低于儿童总线一个固定落差），
 * 不由这条规则负责。
 */
const LEAD_VOICES = new Set(["mallet", "pluck", "pulse"]);
/** 背景主导时间的上限：以孩子的原声为主，背景只在必要时领奏。 */
export const MAX_BACKGROUND_LED_RATIO = 0.3;
/**
 * 伴奏和孩子的声音同时缺席的最长时间：超过这个长度就是一段死气。
 * 与"自然声贯穿"用同一个标准，避免同一个代码库里出现两套静默尺度。
 */
export const MAX_COMBINED_SILENCE_SECONDS = NATURAL_SOUND_MAX_GAP_SECONDS;
/** 结尾之前这段时间内不允许有新的起音，否则会显得戛然而止（由修补保证）。 */
export const NO_ONSET_TAIL_SECONDS = 1.2;

export function validateBackgroundArrangement(
  plan: SymbolicMusicPlan | null | undefined,
  brief: MusicPolishBrief,
): BackgroundArrangementCheck {
  const empty: BackgroundArrangementSignals = {
    backgroundLedRatio: 0,
    longestCombinedSilenceSeconds: brief.durationSeconds,
    sectionChanges: 0,
    endingFadesOut: false,
  };
  if (!plan || plan.events.length === 0) return { ok: false, reason: "伴奏方案是空的。", signals: empty };

  const events = [...plan.events].sort((a, b) => a.startSeconds - b.startSeconds);
  const signals = readSignals(events, brief);

  // 一、伴奏和孩子的声音不能同时长时间缺席：留白可以，空白不行。
  if (signals.longestCombinedSilenceSeconds > MAX_COMBINED_SILENCE_SECONDS) {
    return { ok: false, reason: `中间有约 ${signals.longestCombinedSilenceSeconds.toFixed(1)} 秒既没有伴奏也没有孩子的声音。`, signals };
  }

  // 二、孩子的原声始终是主线，背景领奏不能超过全曲三成。
  if (signals.backgroundLedRatio > MAX_BACKGROUND_LED_RATIO) {
    return { ok: false, reason: `背景抢了主角：有 ${Math.round(signals.backgroundLedRatio * 100)}% 的时间是背景在唱，超过了三成。`, signals };
  }

  return { ok: true, reason: null, signals };
}

function readSignals(events: SymbolicMusicPlan["events"], brief: MusicPolishBrief): BackgroundArrangementSignals {
  const duration = brief.durationSeconds;
  const childIntervals = mergeIntervals(brief.soundEvents.map((event) => ({ start: event.startSeconds, end: event.endSeconds })));
  const backgroundIntervals = mergeIntervals(events.map((event) => ({
    start: event.startSeconds,
    end: Math.min(duration, event.startSeconds + event.durationSeconds),
  })));
  // 只有旋律声部算"背景在唱主角"；长音托底不计入。
  const leadIntervals = mergeIntervals(events
    .filter((event) => LEAD_VOICES.has(event.voice))
    .map((event) => ({ start: event.startSeconds, end: Math.min(duration, event.startSeconds + event.durationSeconds) })));

  return {
    backgroundLedRatio: round(subtractSeconds(leadIntervals, childIntervals) / Math.max(0.001, duration)),
    longestCombinedSilenceSeconds: round(longestGap(mergeIntervals([...backgroundIntervals, ...childIntervals]), duration)),
    sectionChanges: countSectionChanges(events, brief),
    endingFadesOut: endingIsSofter(events),
  };
}

/** a 中不被 b 覆盖的总时长。 */
function subtractSeconds(a: Array<{ start: number; end: number }>, b: Array<{ start: number; end: number }>): number {
  return a.reduce((sum, interval) => {
    const overlap = b.reduce((covered, other) => covered + Math.max(0, Math.min(interval.end, other.end) - Math.max(interval.start, other.start)), 0);
    return sum + Math.max(0, interval.end - interval.start - overlap);
  }, 0);
}

/** 相邻段落之间，音区、密度、力度三项里有没有明显变化。 */
function countSectionChanges(events: SymbolicMusicPlan["events"], brief: MusicPolishBrief): number {
  const profiles = brief.sections.map((section) => {
    const inside = events.filter((event) => event.startSeconds < section.endSeconds && event.startSeconds + event.durationSeconds > section.startSeconds);
    const span = Math.max(0.001, section.endSeconds - section.startSeconds);
    const notes = inside.flatMap((event) => event.midiNotes);
    return {
      register: notes.length ? notes.reduce((sum, note) => sum + note, 0) / notes.length : 0,
      density: inside.length / span,
      velocity: inside.length ? inside.reduce((sum, event) => sum + event.velocity, 0) / inside.length : 0,
    };
  });
  return profiles.slice(1).filter((profile, index) => {
    const previous = profiles[index];
    return Math.abs(profile.register - previous.register) >= 2
      || Math.abs(profile.density - previous.density) >= 0.12
      || Math.abs(profile.velocity - previous.velocity) >= 0.03;
  }).length;
}

function endingIsSofter(events: SymbolicMusicPlan["events"]): boolean {
  const peak = Math.max(...events.map((event) => event.velocity));
  const closing = events.reduce((latest, event) => event.startSeconds > latest.startSeconds ? event : latest, events[0]);
  return closing.velocity < peak - 0.001;
}

function longestGap(intervals: Array<{ start: number; end: number }>, duration: number): number {
  let longest = 0;
  let cursor = 0;
  intervals.forEach((interval) => {
    longest = Math.max(longest, interval.start - cursor);
    cursor = Math.max(cursor, interval.end);
  });
  return Math.max(longest, duration - cursor);
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

function round(value: number) {
  return Number(value.toFixed(3));
}
