import type { OriginalAudioAsset } from "@/src/domain/audio-asset";
import type { Composition } from "@/src/domain/composition";

export interface CompositionPlaybackTimeline {
  maxBeat: number;
  arrangementDurationSeconds: number;
  audibleDurationSeconds: number;
}

/**
 * UI 与音频引擎共享同一时间事实：事件按 beat 触发，作品严格落在所选时长内。
 * 原始文件仍完整保存在声卡与归档中；作品只使用其非破坏性片段。
 */
export function buildCompositionPlaybackTimeline(
  composition: Composition | null,
  assets: OriginalAudioAsset[],
  minimumBeat = 1,
): CompositionPlaybackTimeline {
  if (!composition) return { maxBeat: minimumBeat, arrangementDurationSeconds: 0, audibleDurationSeconds: 0 };
  const secondsPerBeat = 60 / composition.bpm;
  const targetBeat = composition.durationSeconds / secondsPerBeat;
  const maxBeat = Math.max(minimumBeat, targetBeat, ...composition.events.map((event) => event.startBeat + event.durationBeats));
  const arrangementDurationSeconds = composition.durationSeconds;
  void assets;
  const audibleDurationSeconds = composition.durationSeconds;
  return { maxBeat, arrangementDurationSeconds, audibleDurationSeconds };
}
