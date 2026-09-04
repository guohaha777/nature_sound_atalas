import { describe, expect, it } from "vitest";
import { MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { arrangeCompositionV2 } from "./arrangeCompositionV2";
import { inspectCompositionContext } from "./inspectCompositionContext";

function select(ids: string[]) {
  const selected = new Set(ids);
  return MOCK_SOUND_UNITS.map((unit) => ({ ...unit, active: selected.has(unit.id) }));
}

describe("arrangeCompositionV2", () => {
  it("is reproducible for the same input and seed", () => {
    const units = select(["sound-rain", "sound-cow", "sound-bell"]);
    expect(arrangeCompositionV2(MOCK_SOUND_CARDS, units, 2, 24, "class-a"))
      .toEqual(arrangeCompositionV2(MOCK_SOUND_CARDS, units, 2, 24, "class-a"));
  });

  it("changes timing when the seed changes without changing selected sounds", () => {
    const units = select(["sound-rain", "sound-cow", "sound-bell"]);
    const first = arrangeCompositionV2(MOCK_SOUND_CARDS, units, 1, 24, "seed-one");
    const second = arrangeCompositionV2(MOCK_SOUND_CARDS, units, 1, 24, "seed-two");
    expect(first.events.map((event) => event.startBeat)).not.toEqual(second.events.map((event) => event.startBeat));
    expect(first.soundUnitIds).toEqual(second.soundUnitIds);
  });

  it("creates distinct roles and structures for different material", () => {
    const short = arrangeCompositionV2(MOCK_SOUND_CARDS, select(["sound-bell"]), 1, 15, "same-seed");
    const mixed = arrangeCompositionV2(MOCK_SOUND_CARDS, select(["sound-rain", "sound-cow", "sound-steps"]), 1, 24, "same-seed");
    expect(new Set(short.events.map((event) => event.arrangementRole))).toEqual(new Set(["lead-natural"]));
    expect(new Set(mixed.events.map((event) => event.arrangementRole))).toEqual(new Set(["lead-natural", "texture", "accent"]));
    expect(short.events.map((event) => [event.startBeat, event.gainDb])).not.toEqual(mixed.events.map((event) => [event.startBeat, event.gainDb]));
  });

  it("always leaves one sound in front, even when every rule points at texture", () => {
    // 风和鸟都是「长长的 + 轻轻的」，assignRole 会在轮到领唱之前就把它们判成 texture。
    const allTexture = arrangeCompositionV2(MOCK_SOUND_CARDS, select(["sound-rain", "sound-springbird"]), 1, 24, "same-seed");
    const roles = allTexture.events.map((event) => event.arrangementRole);
    expect(roles).toContain("lead-natural");
    expect(new Set(roles)).toEqual(new Set(["lead-natural", "texture"]));
  });

  it.each([15, 24, 30])("scales four sections inside a %s-second work", (durationSeconds) => {
    const units = select(["sound-rain", "sound-cow", "sound-bell"]);
    const composition = arrangeCompositionV2(MOCK_SOUND_CARDS, units, 1, durationSeconds, "matrix-seed");
    const secondsPerBeat = 60 / composition.bpm;
    expect(new Set(composition.events.map((event) => event.section))).toEqual(new Set(["opening", "development", "peak", "ending"]));
    expect(composition.events.every((event) => event.startBeat * secondsPerBeat + (event.clipDurationSeconds ?? 0) <= durationSeconds + 0.001)).toBe(true);
    expect(composition.arrangerVersion).toBe("arranger-v2");
  });

  it("keeps one child-facing event per sound and marks the other section events as automatic support", () => {
    const composition = arrangeCompositionV2(MOCK_SOUND_CARDS, select(["sound-rain", "sound-cow", "sound-bell"]), 1, 24, "visible-events");
    composition.soundUnitIds.forEach((soundUnitId) => {
      const events = composition.events.filter((event) => event.soundUnitId === soundUnitId);
      expect(events.filter((event) => !event.generatedBy)).toHaveLength(1);
      expect(events.filter((event) => event.generatedBy === "deterministic-arranger-v2")).toHaveLength(3);
    });
  });

  it("avoids exact pile-ups and reports an ordinary score as ready", () => {
    const units = select(MOCK_SOUND_UNITS.map((unit) => unit.id));
    const composition = arrangeCompositionV2(MOCK_SOUND_CARDS, units, 1, 30, "density-seed");
    const analysis = inspectCompositionContext(composition, units, "run-deterministic-arranger");
    expect(analysis.exactOverlapGroups).toBe(0);
    expect(analysis.overDenseWindows).toBe(0);
    expect(analysis.status).toBe("ready");
  });
});
