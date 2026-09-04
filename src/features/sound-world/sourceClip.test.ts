import { describe, expect, it } from "vitest";
import { arrangeCompositionV1, arrangeCompositionV2, COMPOSITION_DURATION_OPTIONS } from "@/src/domain/composition";
import { MOCK_ORIGINAL_AUDIO_ASSETS, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { normalizeEditableSourceClips, readEventSourceClip, updateCompositionEventSourceClip } from "./sourceClip";

function activeUnits(...ids: string[]) {
  return MOCK_SOUND_UNITS.map((unit) => ({ ...unit, active: ids.includes(unit.id) }));
}

describe("editable source clips", () => {
  it("migrates V2 editable events to their full source duration", () => {
    const units = activeUnits("sound-rain");
    const composition = arrangeCompositionV2(MOCK_SOUND_CARDS, units, 1, 24, "full-wind");
    const normalized = normalizeEditableSourceClips(composition, MOCK_ORIGINAL_AUDIO_ASSETS);
    const event = normalized.events.find((item) => item.soundUnitId === "sound-rain" && !item.generatedBy)!;

    expect(event).toMatchObject({
      sourceOffsetSeconds: 0,
      clipDurationSeconds: 18.991,
      sourceSelectionDurationSeconds: 18.991,
      sourceClipVersion: "source-clip-v1",
      sourceClipOrigin: "full-source",
      loop: false,
    });
    expect(event.durationBeats).toBeCloseTo(18.991 * normalized.bpm / 60, 3);
  });

  it("caps overlong assets to 30 seconds and gives the capsule room", () => {
    const units = activeUnits("sound-springbird");
    const composition = arrangeCompositionV2(MOCK_SOUND_CARDS, units, 1, 24, "bird-limit");
    const normalized = normalizeEditableSourceClips(composition, MOCK_ORIGINAL_AUDIO_ASSETS);
    const event = normalized.events.find((item) => item.soundUnitId === "sound-springbird" && !item.generatedBy)!;
    const asset = MOCK_ORIGINAL_AUDIO_ASSETS.find((item) => item.id === event.audioAssetId)!;

    expect(normalized.durationSeconds).toBe(30);
    expect(event.startBeat).toBe(0);
    expect(readEventSourceClip(event, asset)).toMatchObject({
      startSeconds: 0,
      endSeconds: 30,
      durationSeconds: 30,
      sourceDurationSeconds: 30,
      limitedByIngestPolicy: true,
    });
  });

  it("stores a user selection non-destructively and preserves it on normalization", () => {
    const units = activeUnits("sound-rain");
    const composition = normalizeEditableSourceClips(
      arrangeCompositionV2(MOCK_SOUND_CARDS, units, 1, 24, "user-selection"),
      MOCK_ORIGINAL_AUDIO_ASSETS,
    );
    const event = composition.events.find((item) => item.soundUnitId === "sound-rain" && !item.generatedBy)!;
    const asset = MOCK_ORIGINAL_AUDIO_ASSETS.find((item) => item.id === event.audioAssetId)!;
    const updated = updateCompositionEventSourceClip(composition, event.id, asset, { startSeconds: 5, endSeconds: 12 });
    const edited = updated.events.find((item) => item.id === event.id)!;

    expect(readEventSourceClip(edited, asset)).toMatchObject({ startSeconds: 5, endSeconds: 12, durationSeconds: 7 });
    expect(edited).toMatchObject({ sourceClipOrigin: "user", sourceSelectionDurationSeconds: 7, loop: false });
    expect(edited.durationBeats).toBeCloseTo(7 * updated.bpm / 60, 3);
    expect(normalizeEditableSourceClips(updated, MOCK_ORIGINAL_AUDIO_ASSETS)).toEqual(updated);
  });

  it("repairs early V2 compositions whose visible event was marked as automatic", () => {
    const units = activeUnits("sound-rain");
    const composition = arrangeCompositionV2(MOCK_SOUND_CARDS, units, 1, 24, "legacy-v2");
    const legacyEvents = composition.events.map((event) => ({ ...event, generatedBy: "deterministic-arranger-v2" as const }));
    const normalized = normalizeEditableSourceClips({ ...composition, events: legacyEvents }, MOCK_ORIGINAL_AUDIO_ASSETS);
    const visible = normalized.events.filter((event) => event.soundUnitId === "sound-rain" && !event.generatedBy);

    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({ sourceClipVersion: "source-clip-v1", clipDurationSeconds: 18.991 });
  });

  it("leaves legacy V1 arrangements unchanged", () => {
    const units = activeUnits("sound-rain");
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1);
    expect(normalizeEditableSourceClips(composition, MOCK_ORIGINAL_AUDIO_ASSETS)).toBe(composition);
  });
});

describe("placing a long selection", () => {
  it("moves the capsule earlier instead of trimming the chosen sound", () => {
    const units = activeUnits("sound-rain");
    const composition = normalizeEditableSourceClips(
      arrangeCompositionV2(MOCK_SOUND_CARDS, units, 1, 24, "late-capsule"),
      MOCK_ORIGINAL_AUDIO_ASSETS,
    );
    const event = composition.events.find((item) => item.soundUnitId === "sound-rain" && !item.generatedBy)!;
    const asset = MOCK_ORIGINAL_AUDIO_ASSETS.find((item) => item.id === event.audioAssetId)!;
    const secondsPerBeat = 60 / composition.bpm;
    const lateComposition = {
      ...composition,
      events: composition.events.map((item) => item.id === event.id ? { ...item, startBeat: 18 / secondsPerBeat } : item),
    };

    const updated = updateCompositionEventSourceClip(lateComposition, event.id, asset, { startSeconds: 0, endSeconds: 18.991 });
    const moved = updated.events.find((item) => item.id === event.id)!;

    expect(moved.sourceSelectionDurationSeconds).toBe(18.991);
    expect(moved.startBeat * secondsPerBeat).toBeCloseTo(24 - 18.991, 2);
    expect(moved.startBeat * secondsPerBeat + 18.991).toBeLessThanOrEqual(24.001);
  });
});

describe("an explicit work length", () => {
  it("keeps the chosen work length and caps the default selection instead of growing the work", () => {
    const units = activeUnits("sound-rain");
    const composition = { ...arrangeCompositionV2(MOCK_SOUND_CARDS, units, 1, 15, "explicit-15"), durationSeconds: 15, durationOrigin: "user" as const };
    const normalized = normalizeEditableSourceClips(composition, MOCK_ORIGINAL_AUDIO_ASSETS);
    const event = normalized.events.find((item) => item.soundUnitId === "sound-rain" && !item.generatedBy)!;

    expect(normalized.durationSeconds).toBe(15);
    expect(event.sourceSelectionDurationSeconds).toBe(15);
    expect(event.startBeat).toBe(0);
  });

  it("grows the work to the shortest option that holds the source while the length is still automatic", () => {
    const units = activeUnits("sound-rain");
    const normalized = normalizeEditableSourceClips(arrangeCompositionV2(MOCK_SOUND_CARDS, units, 1, 15, "auto-15"), MOCK_ORIGINAL_AUDIO_ASSETS);

    expect(normalized.durationSeconds).toBe(COMPOSITION_DURATION_OPTIONS[0]);
    expect(normalized.events.find((item) => !item.generatedBy)!.sourceSelectionDurationSeconds).toBe(18.991);
  });
});

