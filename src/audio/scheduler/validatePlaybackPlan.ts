import type { PlaybackPlan } from "../ports/CompositionPlayer";

export function assertPlaybackPlanAssets(plan: PlaybackPlan): void {
  const missing = plan.composition.events.find((event) => !plan.assets[event.audioAssetId]);
  if (missing) throw new Error(`缺少音频资产：${missing.audioAssetId}`);
}
