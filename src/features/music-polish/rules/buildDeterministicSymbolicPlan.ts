import type { SymbolicMusicPlan } from "@/src/domain/composition";
import type { MusicPolishBrief } from "../contracts";
import { deriveMusicPolishDirection } from "./deriveMusicPolishDirection";

type PlanEvent = SymbolicMusicPlan["events"][number];

const ROOTS = [48, 50, 53, 55] as const;
/** 四段各用一个和弦级数，形成能听出来的和声走向。 */
const SECTION_DEGREES = [0, 7, 9, 5] as const;
const MAX_EVENTS = 90;
const NO_ONSET_TAIL_SECONDS = 1.2;

/**
 * 联网不可用时的伴奏方案。遵循与提示词相同的编排原则：
 * 段落对齐时间线、原声响时让位、空白处呼应、情绪决定明暗与密度、结尾必须收住。
 */
export function buildDeterministicSymbolicPlan(brief: MusicPolishBrief): SymbolicMusicPlan {
  const direction = deriveMusicPolishDirection(brief);
  const signature = briefSignature(brief);
  const valence = brief.emotionCoordinates.enabled ? brief.emotionCoordinates.valence : 0;
  const arousal = brief.emotionCoordinates.enabled ? brief.emotionCoordinates.arousal : 0;
  // 音区与孩子的声音互补：孩子偏高，伴奏就往低走，避免互相遮蔽。
  const root = ROOTS[Math.abs(signature) % ROOTS.length] + (brief.pitchProfile.high > brief.pitchProfile.low ? -5 : 4);
  const scale = valence >= 0.25 ? [0, 2, 4, 7, 9] : valence <= -0.25 ? [0, 2, 3, 7, 10] : [0, 2, 4, 7, 10];
  const chord = valence >= 0.25 ? [0, 4, 7] : valence <= -0.25 ? [0, 3, 7] : [0, 4, 7];
  const endingSeconds = Math.min(4, Math.max(2, brief.durationSeconds * 0.12));
  const lastOnsetAt = brief.durationSeconds - NO_ONSET_TAIL_SECONDS;
  const events: PlanEvent[] = [];

  // 一、每段一个长和弦：段落边界即和声变化，听得出"到了下一段"。
  brief.sections.forEach((section, index) => {
    const isEnding = section.name === "ending";
    const startSeconds = isEnding ? Math.max(0, brief.durationSeconds - endingSeconds) : section.startSeconds;
    const endSeconds = isEnding ? brief.durationSeconds - 0.2 : section.endSeconds;
    if (endSeconds - startSeconds < 0.4) return;
    // 收束段落回到主音，其余段落按级数走。
    const degree = isEnding ? 0 : SECTION_DEGREES[index % SECTION_DEGREES.length];
    events.push({
      startSeconds: round(startSeconds),
      durationSeconds: round(endSeconds - startSeconds),
      midiNotes: chord.map((interval) => clampNote(root + degree + interval)),
      voice: "pad",
      velocity: round(clampVelocity((isEnding ? 0.06 : 0.09) + direction.energy * (isEnding ? 0.05 : 0.11))),
    });
  });

  // 二、在孩子声音之间的空白里呼应：音区与刚结束的那个声音相反，动机重复但有变化。
  const motif = [0, 2, 4].map((step) => scale[(Math.abs(signature) + step) % scale.length]);
  brief.quietWindows.slice(0, 10).forEach((window, index) => {
    if (events.length >= MAX_EVENTS) return;
    const previous = [...brief.soundEvents].reverse().find((event) => event.endSeconds <= window.startSeconds + 0.05);
    const answerLift = previous?.pitch === "high" ? -12 : previous?.pitch === "low" ? 12 : index % 2 === 0 ? 7 : -5;
    const variation = index === 0 ? 0 : index % 2 === 1 ? 5 : -3;
    const noteCount = window.endSeconds - window.startSeconds >= 3 ? 3 : 2;
    const step = Math.min(0.55, (window.endSeconds - window.startSeconds - 0.4) / Math.max(1, noteCount));
    for (let note = 0; note < noteCount; note += 1) {
      const startSeconds = window.startSeconds + 0.35 + step * note;
      if (startSeconds >= lastOnsetAt || startSeconds + 0.2 >= window.endSeconds) break;
      events.push({
        startSeconds: round(startSeconds),
        durationSeconds: round(Math.min(0.9, window.endSeconds - startSeconds)),
        midiNotes: [clampNote(root + 12 + answerLift + variation + motif[note % motif.length])],
        voice: index % 2 === 0 ? "mallet" : "pluck",
        velocity: round(clampVelocity(0.1 + direction.energy * 0.12)),
      });
    }
  });

  // 三、律动只在情绪够活跃时出现，并且避开孩子声音最密集的一段。
  if (direction.pulse >= 0.45 || arousal >= 0.3) {
    const beatSeconds = 60 / brief.bpm;
    const step = beatSeconds * (arousal >= 0.3 || direction.pulse >= 0.7 ? 1 : 2);
    for (let start = brief.sections[0]?.endSeconds ?? 0; start < lastOnsetAt && events.length < MAX_EVENTS; start += step) {
      if (brief.busiestWindow && start >= brief.busiestWindow.startSeconds && start <= brief.busiestWindow.endSeconds) continue;
      events.push({
        startSeconds: round(start),
        durationSeconds: round(Math.min(0.22, lastOnsetAt - start)),
        midiNotes: [clampNote(root - 12)],
        voice: "bass",
        velocity: round(clampVelocity(0.06 + direction.pulse * 0.1)),
      });
    }
  }

  return {
    version: "symbolic-music-plan-v1",
    bpm: brief.bpm,
    durationSeconds: brief.durationSeconds,
    // 孩子的声音在响时不加入新的起音：长和弦可以延续，短音符必须让位。
    events: events
      .filter((event) => event.voice === "pad" || !overlapsChildSound(event.startSeconds, brief))
      .sort((a, b) => a.startSeconds - b.startSeconds)
      .slice(0, MAX_EVENTS),
  };
}

function overlapsChildSound(startSeconds: number, brief: MusicPolishBrief) {
  return brief.soundEvents.some((event) => startSeconds >= event.startSeconds - 0.05 && startSeconds <= event.endSeconds - 0.15);
}

function briefSignature(brief: MusicPolishBrief) {
  return brief.pitchProfile.high * 7
    + brief.pitchProfile.mid * 11
    + brief.pitchProfile.low * 13
    + brief.patternProfile.repeat * 17
    + brief.patternProfile.bursts * 19
    + brief.eventPositions.reduce((sum, value) => sum + Math.round(value * 31), 0);
}

function clampNote(value: number) {
  return Math.max(36, Math.min(84, Math.round(value)));
}

function clampVelocity(value: number) {
  return Math.max(0.04, Math.min(0.5, value));
}

function round(value: number) {
  return Number(value.toFixed(3));
}
