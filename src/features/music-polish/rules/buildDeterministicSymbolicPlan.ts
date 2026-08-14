import type { SymbolicMusicPlan } from "@/src/domain/composition";
import type { MusicPolishBrief } from "../contracts";
import { deriveMusicPolishDirection } from "./deriveMusicPolishDirection";

const ROOTS = [48, 50, 53, 55] as const;

/** 无联网时也根据当前作品生成不同的音符方案，而不是播放固定和弦。 */
export function buildDeterministicSymbolicPlan(brief: MusicPolishBrief): SymbolicMusicPlan {
  const direction = deriveMusicPolishDirection(brief);
  const signature = brief.pitchProfile.high * 7
    + brief.pitchProfile.mid * 11
    + brief.pitchProfile.low * 13
    + brief.patternProfile.repeat * 17
    + brief.patternProfile.bursts * 19
    + brief.eventPositions.reduce((sum, value) => sum + Math.round(value * 31), 0);
  const root = ROOTS[Math.abs(signature) % ROOTS.length];
  const intervals = brief.emotion === "blue" ? [0, 3, 7]
    : brief.emotion === "tense" ? [0, 5, 10]
      : [0, 4, 7];
  const chordRoots = brief.pitchProfile.low > brief.pitchProfile.high ? [0, 5, 3, 7] : [0, 7, 5, 3];
  const padStep = direction.energyBand === "quiet" ? 7.5 : direction.energyBand === "balanced" ? 5 : 3.75;
  const events: SymbolicMusicPlan["events"] = [];

  for (let start = 0, index = 0; start < brief.durationSeconds - 0.05; start += padStep, index += 1) {
    const durationSeconds = Math.min(padStep + direction.space * 0.8, brief.durationSeconds - start);
    const chordRoot = root + chordRoots[index % chordRoots.length];
    events.push({
      startSeconds: Number(start.toFixed(3)),
      durationSeconds: Number(durationSeconds.toFixed(3)),
      midiNotes: intervals.map((interval) => chordRoot + interval),
      voice: "pad",
      velocity: Number((0.08 + direction.energy * 0.1).toFixed(3)),
    });
  }

  const shouldPulse = direction.pulse >= 0.24 || brief.patternProfile.repeat + brief.patternProfile.bursts > 0;
  if (shouldPulse) {
    const beat = 60 / brief.bpm;
    const pulseStep = beat * (direction.pulse >= 0.66 ? 1 : 2);
    for (let start = pulseStep / 2, index = 0; start < brief.durationSeconds - 0.08 && events.length < 90; start += pulseStep, index += 1) {
      const contourLift = brief.pitchProfile.high > brief.pitchProfile.low && index % 4 === 3 ? 12 : 0;
      events.push({
        startSeconds: Number(start.toFixed(3)),
        durationSeconds: Number(Math.min(0.16 + direction.space * 0.12, brief.durationSeconds - start).toFixed(3)),
        midiNotes: [root - 12 + chordRoots[Math.floor(index / 4) % chordRoots.length] + contourLift],
        voice: "bass",
        velocity: Number((0.07 + direction.pulse * 0.11).toFixed(3)),
      });
    }
  }

  brief.soundEvents.slice(0, 16).forEach((source, index) => {
    if (events.length >= 94) return;
    const responseStart = Math.min(brief.durationSeconds - 0.12, source.startRatio * brief.durationSeconds + 0.28 + (index % 2) * 0.12);
    const scale = brief.emotion === "blue" ? [0, 3, 5, 7, 10] : brief.emotion === "tense" ? [0, 2, 5, 8, 10] : [0, 2, 4, 7, 9];
    const pitchLift = source.pitch === "high" ? 12 : source.pitch === "low" ? -5 : 0;
    events.push({
      startSeconds: Number(responseStart.toFixed(3)),
      durationSeconds: Number(Math.min(source.pattern === "fade-in" ? 0.72 : 0.3 + source.durationRatio * 2, brief.durationSeconds - responseStart).toFixed(3)),
      midiNotes: [Math.max(43, Math.min(79, root + 12 + pitchLift + scale[(index + signature) % scale.length]))],
      voice: source.contour === "wavy" || source.pattern === "bursts" ? "mallet" : "pluck",
      velocity: Number((0.09 + (source.intensity === "loud" ? 0.12 : source.intensity === "medium" ? 0.07 : 0.03)).toFixed(3)),
    });
  });

  return {
    version: "symbolic-music-plan-v1",
    bpm: brief.bpm,
    durationSeconds: brief.durationSeconds,
    events: events.sort((a, b) => a.startSeconds - b.startSeconds),
  };
}
