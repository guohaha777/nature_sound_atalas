import { MAX_RECORDING_DURATION_MS } from "./recordingPolicy";

export const MAX_INGEST_DURATION_SECONDS = MAX_RECORDING_DURATION_MS / 1000;
export const AUDIO_UPLOAD_ACCEPT = "audio/*";
export const MIN_INGEST_DURATION_SECONDS = 0.3;

export interface UploadedAudioAssessment {
  /** 上传文件的完整长度，仅用于提示与截取，不写入声音库。 */
  sourceDurationSeconds: number;
  /** 超过录入上限时必须先截取，才允许保存。 */
  requiresTrim: boolean;
  tooShort: boolean;
  /** 默认选区：从头开始，最长不超过录入上限。 */
  suggestedSelection: { startSeconds: number; endSeconds: number };
  message: string;
}

/**
 * 录入策略与录音一致：单个音源最长 30 秒。
 * 超过上限的上传文件不静默截断，而是要求用户先选择保留哪一段。
 */
export function assessUploadedAudio(sourceDurationSeconds: number): UploadedAudioAssessment {
  const duration = Number.isFinite(sourceDurationSeconds) ? Math.max(0, sourceDurationSeconds) : 0;
  const requiresTrim = duration > MAX_INGEST_DURATION_SECONDS + 0.001;
  const tooShort = duration < MIN_INGEST_DURATION_SECONDS;
  return {
    sourceDurationSeconds: round(duration),
    requiresTrim,
    tooShort,
    suggestedSelection: { startSeconds: 0, endSeconds: round(Math.min(duration, MAX_INGEST_DURATION_SECONDS)) },
    message: tooShort
      ? "这个文件太短了，请换一段更完整的声音。"
      : requiresTrim
        ? `这段音频有 ${format(duration)} 秒，超过单个音源 ${MAX_INGEST_DURATION_SECONDS} 秒的上限。请先截取要保留的一段，再保存。`
        : `已读取 ${format(duration)} 秒音频，可以直接保存进声音库。`,
  };
}

export function clampIngestSelection(
  selection: { startSeconds: number; endSeconds: number },
  sourceDurationSeconds: number,
): { startSeconds: number; endSeconds: number } {
  const source = Math.max(MIN_INGEST_DURATION_SECONDS, sourceDurationSeconds);
  const startSeconds = Math.min(Math.max(0, selection.startSeconds), Math.max(0, source - MIN_INGEST_DURATION_SECONDS));
  const maxEnd = Math.min(source, startSeconds + MAX_INGEST_DURATION_SECONDS);
  const endSeconds = Math.min(maxEnd, Math.max(selection.endSeconds, startSeconds + MIN_INGEST_DURATION_SECONDS));
  return { startSeconds: round(startSeconds), endSeconds: round(endSeconds) };
}

function format(value: number) {
  return value.toFixed(1);
}

function round(value: number) {
  return Number(value.toFixed(3));
}
