import { describe, expect, it } from "vitest";
import { arrangeCompositionV1 } from "./arrangeCompositionV1";
import { inspectCompositionContext } from "./inspectCompositionContext";
import { MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";

describe("inspectCompositionContext", () => {
  it("returns the same analysis for the same child arrangement", () => {
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1);
    expect(inspectCompositionContext(composition, MOCK_SOUND_UNITS, "preserve-child-arrangement"))
      .toEqual(inspectCompositionContext(composition, MOCK_SOUND_UNITS, "preserve-child-arrangement"));
  });

  it("does not warn for an ordinary arrangement", () => {
    const units = MOCK_SOUND_UNITS.map((unit, index) => ({ ...unit, active: index < 2 }));
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1);
    expect(inspectCompositionContext(composition, units, "run-deterministic-arranger")).toMatchObject({
      selectedSoundCount: 2,
      status: "ready",
      notice: null,
    });
  });

  it("suggests listening when four sounds occupy the same pitch and time", () => {
    const units = MOCK_SOUND_UNITS.map((unit) => ({ ...unit, active: true }));
    const base = arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1);
    const events = base.events.slice(0, 4).map((event, index) => ({ ...event, id: `overlap-${index}`, startBeat: 2, semitoneShift: 7 }));
    const result = inspectCompositionContext({ ...base, events }, units, "preserve-child-arrangement");
    expect(result).toMatchObject({ status: "review", exactOverlapGroups: 1 });
    expect(result.notice).toContain("先听一听");
  });
});
