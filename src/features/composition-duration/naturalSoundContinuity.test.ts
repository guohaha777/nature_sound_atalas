import { describe, expect, it } from "vitest";
import { arrangeCompositionV1 } from "@/src/domain/composition";
import { MOCK_ORIGINAL_AUDIO_ASSETS, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { COMPOSITION_DURATION_OPTIONS } from "@/src/domain/composition";
import {
  analyzeNaturalSoundCoverage,
  ensureNaturalSoundContinuity,
  NATURAL_SOUND_COVERAGE_TARGET,
  NATURAL_SOUND_MAX_GAP_SECONDS,
  recommendCompositionDuration,
} from "./naturalSoundContinuity";

const samples = {
  short: ["sound-cow"],
  mixed: ["sound-cow", "sound-steps", "sound-rain"],
  varied: ["sound-cow", "sound-steps", "sound-bell", "sound-rain", "sound-springbird"],
} as const;

function select(ids: readonly string[]) {
  const selected = new Set(ids);
  return MOCK_SOUND_UNITS.map((unit) => ({ ...unit, active: selected.has(unit.id) }));
}

describe("composition duration recommendation", () => {
  it("maps the three baseline sample groups to the short, middle and long options", () => {
    const [shortest, middle, longest] = COMPOSITION_DURATION_OPTIONS;
    expect(recommendCompositionDuration(select(samples.short), MOCK_ORIGINAL_AUDIO_ASSETS).seconds).toBe(shortest);
    expect(recommendCompositionDuration(select(samples.mixed), MOCK_ORIGINAL_AUDIO_ASSETS).seconds).toBe(middle);
    expect(recommendCompositionDuration(select(samples.varied), MOCK_ORIGINAL_AUDIO_ASSETS).seconds).toBe(longest);
  });
});

describe("natural sound continuity", () => {
  it.each(Object.entries(samples).flatMap(([sampleName, ids]) => [...COMPOSITION_DURATION_OPTIONS].map((duration) => [sampleName, ids, duration] as const)))(
    "%s sample stays audible across a %s-second work",
    (_sampleName, ids, duration) => {
      const units = select(ids);
      const originalDurations = MOCK_ORIGINAL_AUDIO_ASSETS.map((asset) => asset.durationMs);
      const base = arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1, duration);
      const result = ensureNaturalSoundContinuity(base, units, MOCK_ORIGINAL_AUDIO_ASSETS);
      const analysis = analyzeNaturalSoundCoverage(result, MOCK_ORIGINAL_AUDIO_ASSETS);
      const secondsPerBeat = 60 / result.bpm;

      expect(analysis.coverageRatio).toBeGreaterThanOrEqual(NATURAL_SOUND_COVERAGE_TARGET);
      expect(analysis.maxSilentGapSeconds).toBeLessThanOrEqual(NATURAL_SOUND_MAX_GAP_SECONDS);
      expect([analysis.openingCovered, analysis.middleCovered, analysis.endingCovered]).toEqual([true, true, true]);
      expect(result.events.every((event) => event.startBeat * secondsPerBeat + (event.clipDurationSeconds ?? 0) <= duration + 0.001)).toBe(true);
      expect(MOCK_ORIGINAL_AUDIO_ASSETS.map((asset) => asset.durationMs)).toEqual(originalDurations);
    },
  );

  it("replaces only its own generated events and preserves child events", () => {
    const units = select(samples.short);
    const base = arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1, 15);
    const first = ensureNaturalSoundContinuity(base, units, MOCK_ORIGINAL_AUDIO_ASSETS);
    const second = ensureNaturalSoundContinuity(first, units, MOCK_ORIGINAL_AUDIO_ASSETS);

    expect(second.events.filter((event) => event.generatedBy !== "natural-sound-continuity-v1")).toEqual(base.events);
    expect(second.events.filter((event) => event.generatedBy === "natural-sound-continuity-v1")).toHaveLength(first.naturalSoundContinuity?.generatedEventCount ?? 0);
  });
});

describe("natural sound continuity and child chosen clips", () => {
  // sound-rain 绑定 18.99 秒的长原声，便于验证长选区的处理。
  const longSourceSample = ["sound-rain"] as const;

  it("repeats the child's own selection instead of shortening it", () => {
    const units = select(longSourceSample);
    const base = arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1, 24);
    const chosen = {
      ...base,
      events: base.events.map((event, index) => index === 0 ? {
        ...event,
        startBeat: 0,
        sourceClipVersion: "source-clip-v1" as const,
        sourceClipOrigin: "user" as const,
        sourceOffsetSeconds: 2,
        sourceSelectionDurationSeconds: 6,
        clipDurationSeconds: 6,
        loop: false,
      } : event).slice(0, 1),
    };
    const result = ensureNaturalSoundContinuity(chosen, units, MOCK_ORIGINAL_AUDIO_ASSETS);
    const generated = result.events.filter((event) => event.generatedBy === "natural-sound-continuity-v1");

    expect(generated.length).toBeGreaterThan(0);
    expect(generated.every((event) => event.clipDurationSeconds === 6)).toBe(true);
    expect(generated.every((event) => event.sourceOffsetSeconds === 2)).toBe(true);
    expect(generated.every((event) => event.loop !== true)).toBe(true);
    expect(result.events.filter((event) => !event.generatedBy)).toEqual(chosen.events);
  });

  it("skips a continuity copy instead of trimming a selection longer than the work", () => {
    const units = select(longSourceSample);
    const base = arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1, 15);
    const chosen = {
      ...base,
      durationSeconds: 15,
      events: base.events.slice(0, 1).map((event) => ({
        ...event,
        startBeat: 0,
        sourceClipVersion: "source-clip-v1" as const,
        sourceClipOrigin: "user" as const,
        sourceOffsetSeconds: 0,
        sourceSelectionDurationSeconds: 18,
        clipDurationSeconds: 18,
      })),
    };
    const result = ensureNaturalSoundContinuity(chosen, units, MOCK_ORIGINAL_AUDIO_ASSETS);

    expect(result.events.filter((event) => event.generatedBy === "natural-sound-continuity-v1")).toHaveLength(0);
    expect(result.events).toEqual(chosen.events);
  });
});
