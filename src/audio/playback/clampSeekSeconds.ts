export function clampSeekSeconds(seconds: number, duration: number): number {
  const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  if (!Number.isFinite(seconds)) return 0;
  return Math.max(0, Math.min(safeDuration, seconds));
}
