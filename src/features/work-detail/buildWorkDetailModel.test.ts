import { describe, expect, it } from "vitest";
import { arrangeCompositionV1, attachCompositionContext } from "@/src/domain/composition";
import { buildLocalCompositionAdvice } from "@/src/features/composition-advice";
import { MOCK_ORIGINAL_AUDIO_ASSETS, MOCK_PROJECT, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { buildWorkDetailModel } from "./buildWorkDetailModel";

function savedComposition() {
  const arranged = attachCompositionContext(arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 3), MOCK_SOUND_UNITS, "run-deterministic-arranger");
  return {
    ...arranged,
    events: arranged.events.map((event, index) => index === 0 ? { ...event, startBeat: 28 } : event),
    title: "八月的声音",
    createdAt: "2026-08-11T10:00:00.000Z",
    savedAt: "2026-08-11T10:01:00.000Z",
    teachingAdvice: buildLocalCompositionAdvice(arranged, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS),
  };
}

describe("buildWorkDetailModel", () => {
  it("loads only the saved work whose id matches the route", () => {
    const composition = savedComposition();
    const model = buildWorkDetailModel({ workId: composition.id, composition, projectName: MOCK_PROJECT.name, units: MOCK_SOUND_UNITS, audioAssets: MOCK_ORIGINAL_AUDIO_ASSETS });
    expect(model).toMatchObject({ title: "八月的声音", contributorNames: ["系统"] });
    expect(model?.units).toHaveLength(3);
    expect(model?.audibleDurationSeconds).toBe(composition.durationSeconds);
    expect(model?.musicDiscovery).toMatchObject({ sourceLabel: "本地规则整理" });
    expect(model?.musicDiscovery?.childText).toBeTruthy();
    expect(buildWorkDetailModel({ workId: "missing", composition, projectName: MOCK_PROJECT.name, units: MOCK_SOUND_UNITS, audioAssets: MOCK_ORIGINAL_AUDIO_ASSETS })).toBeNull();
  });

  it("does not present an autosaved draft as an archived work", () => {
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1);
    expect(buildWorkDetailModel({ workId: composition.id, composition, projectName: MOCK_PROJECT.name, units: MOCK_SOUND_UNITS, audioAssets: MOCK_ORIGINAL_AUDIO_ASSETS })).toBeNull();
  });
});
