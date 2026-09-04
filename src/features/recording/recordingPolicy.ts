export const MAX_RECORDING_DURATION_MS = 30_000;

export function clampRecordingDuration(durationMs: number): number {
  return Math.max(1, Math.min(MAX_RECORDING_DURATION_MS, durationMs));
}
