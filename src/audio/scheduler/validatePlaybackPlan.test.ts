import { describe, expect, it } from "vitest";
import { arrangeCompositionV1 } from "@/src/domain/composition";
import { MOCK_ORIGINAL_AUDIO_ASSETS, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { assertPlaybackPlanAssets } from "./validatePlaybackPlan";

describe("assertPlaybackPlanAssets", () => {
  const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1);
  const assets = Object.fromEntries(MOCK_ORIGINAL_AUDIO_ASSETS.map((asset) => [asset.id, { id: asset.id, url: asset.storageRef, sourceKey: asset.sourceKey }]));

  it("accepts a complete immutable asset plan", () => {
    expect(() => assertPlaybackPlanAssets({ composition, assets })).not.toThrow();
  });

  it("rejects a plan with a missing original asset", () => {
    const incomplete = { ...assets };
    delete incomplete[composition.events[0].audioAssetId];
    expect(() => assertPlaybackPlanAssets({ composition, assets: incomplete })).toThrow(/缺少音频资产/);
  });
});
