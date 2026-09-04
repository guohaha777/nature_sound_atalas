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
  const sourceOffsetSeconds = Math.min(Math.max(0, event.sourceOffsetSeconds ?? 0), Math.max(0, sourceDurationSeconds - 0.01));
  const availableSourceSeconds = Math.max(0.01, sourceDurationSeconds - sourceOffsetSeconds);
  const naturalSeconds = Math.min(availableSourceSeconds, event.sourceSelectionDurationSeconds ?? availableSourceSeconds);
  const requestedSeconds = Math.max(0, event.clipDurationSeconds ?? event.durationBeats * (60 / bpm));
  const shouldLoop = Boolean(event.loop) && requestedSeconds > naturalSeconds;
  const uncappedSeconds = event.clipDurationSeconds !== undefined
    ? shouldLoop ? requestedSeconds : Math.min(naturalSeconds, requestedSeconds)
    : shouldLoop ? requestedSeconds : naturalSeconds;
  const playbackSeconds = Math.max(0.01, Math.min(uncappedSeconds, maximumPlaybackSeconds));
  const sourceWasClipped = event.clipDurationSeconds !== undefined && !shouldLoop && playbackSeconds + 0.001 < naturalSeconds;

  return {
    naturalSeconds,
    playbackSeconds,
    shouldLoop: shouldLoop && playbackSeconds > naturalSeconds,
    wasTrimmed: sourceWasClipped || playbackSeconds + 0.001 < uncappedSeconds,
  };
}
