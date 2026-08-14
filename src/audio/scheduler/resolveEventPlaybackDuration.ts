import type { CompositionEvent } from "@/src/domain/composition";

export interface EventPlaybackDuration {
  naturalSeconds: number;
  playbackSeconds: number;
  shouldLoop: boolean;
  wasTrimmed: boolean;
}

/**
 * 原始文件保持不变；作品中的片段可以在所选总时长边界处淡出。
 * 短声音仍可按孩子选择的重复方式延长。
 */
export function resolveEventPlaybackDuration(
  event: CompositionEvent,
  bpm: number,
  sourceDurationSeconds: number,
  maximumPlaybackSeconds = Number.POSITIVE_INFINITY,
): EventPlaybackDuration {
  const playbackRate = Math.pow(2, event.semitoneShift / 12);
  const naturalSeconds = Math.max(0.01, sourceDurationSeconds / playbackRate);
  const requestedSeconds = Math.max(0, event.durationBeats * (60 / bpm));
  const shouldLoop = Boolean(event.loop) && requestedSeconds > naturalSeconds;
  const uncappedSeconds = shouldLoop ? requestedSeconds : naturalSeconds;
  const playbackSeconds = Math.max(0.01, Math.min(uncappedSeconds, maximumPlaybackSeconds));

  return {
    naturalSeconds,
    playbackSeconds,
    shouldLoop: shouldLoop && playbackSeconds > naturalSeconds,
    wasTrimmed: playbackSeconds + 0.001 < uncappedSeconds,
  };
}
