import { describe, expect, it } from "vitest";
import { arrangeCompositionV1, arrangeCompositionV2 } from "@/src/domain/composition";
import { MOCK_ORIGINAL_AUDIO_ASSETS, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { deleteWorldCompositionEvent, duplicateWorldCompositionEvent, listEligibleSoundWorldItems, moveWorldCompositionEvent, readWorldArrangement, selectedPaperCardUnitIds, selectWorldSoundUnits, updateWorldComposition } from "./worldArrangement";
import { normalizeEditableSourceClips, updateCompositionEventSourceClip } from "./sourceClip";

describe("sound world arrangement", () => {
  it("excludes draft or unbound sounds from the selectable archive", () => {
    const draft = { ...MOCK_SOUND_CARDS[0], id: "draft", confirmedAt: "paper-draft", sourceSelectionRequired: true };
    const unit = { ...MOCK_SOUND_UNITS[0], id: "unit-draft", cardId: draft.id };
    expect(listEligibleSoundWorldItems([...MOCK_SOUND_CARDS, draft], [...MOCK_SOUND_UNITS, unit], MOCK_ORIGINAL_AUDIO_ASSETS)).toHaveLength(MOCK_SOUND_UNITS.length);
  });

  it("selects every confirmed sound created from the same recognized paper card", () => {
    const cards = MOCK_SOUND_CARDS.slice(0, 3).map((card) => ({ ...card, confirmedAt: "confirmed" }));
    const units = MOCK_SOUND_UNITS.slice(0, 3).map((unit) => ({ ...unit, inputMode: "paper_card" as const }));
    const items = listEligibleSoundWorldItems(cards, units, MOCK_ORIGINAL_AUDIO_ASSETS);

    expect(selectedPaperCardUnitIds(cards[1].id, items)).toEqual(units.map((unit) => unit.id));
  });

  it("does not group a normal library selection by its mock paper-card id", () => {
    const items = listEligibleSoundWorldItems(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, MOCK_ORIGINAL_AUDIO_ASSETS);

    expect(selectedPaperCardUnitIds(MOCK_SOUND_CARDS[1].id, items)).toEqual([MOCK_SOUND_UNITS[1].id]);
  });

  it("edits the derived arrangement without mutating its SoundUnit", () => {
    const units = MOCK_SOUND_UNITS.map((unit, index) => ({ ...unit, active: index === 0 }));
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1);
    const before = structuredClone(units[0]);
    const updated = updateWorldComposition(composition, MOCK_SOUND_CARDS, units, units[0].id, { pitch: "low", repeatCount: 4, startSlot: 2 });
    const values = readWorldArrangement(updated, units[0]);
    expect(values).toEqual({ pitch: "low", repeatCount: 4, startSlot: 2 });
    expect(updated.events.filter((event) => event.soundUnitId === units[0].id)).toHaveLength(4);
    expect(units[0]).toEqual(before);
  });

  it("is deterministic for the same edit", () => {
    const units = MOCK_SOUND_UNITS.map((unit, index) => ({ ...unit, active: index === 0 }));
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1);
    const patch = { pitch: "high" as const, repeatCount: 2, startSlot: 5 };
    expect(updateWorldComposition(composition, MOCK_SOUND_CARDS, units, units[0].id, patch)).toEqual(updateWorldComposition(composition, MOCK_SOUND_CARDS, units, units[0].id, patch));
  });

  it("does not cap explicitly selected sounds", () => {
    const duplicate = { ...MOCK_SOUND_UNITS[0], id: "sound-extra", cardId: MOCK_SOUND_CARDS[0].id };
    const result = selectWorldSoundUnits(null, MOCK_SOUND_CARDS, [...MOCK_SOUND_UNITS, duplicate], [...MOCK_SOUND_UNITS.map((unit) => unit.id), duplicate.id]);
    expect(result.composition.soundUnitIds).toHaveLength(MOCK_SOUND_UNITS.length + 1);
    expect(result.units.filter((unit) => unit.active)).toHaveLength(MOCK_SOUND_UNITS.length + 1);
  });

  it("adds only one editable event when a sound is dragged into an existing V2 world", () => {
    const initialUnits = MOCK_SOUND_UNITS.map((unit, index) => ({ ...unit, active: index === 0 }));
    const composition = arrangeCompositionV2(MOCK_SOUND_CARDS, initialUnits, 1, 24, "drag-test");
    const addedUnit = MOCK_SOUND_UNITS[1];
    const result = selectWorldSoundUnits(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, [initialUnits[0].id, addedUnit.id]);

    expect(result.composition.events.filter((event) => event.soundUnitId === addedUnit.id)).toHaveLength(1);
    expect(result.composition.events.find((event) => event.soundUnitId === addedUnit.id)?.generatedBy).toBeUndefined();
  });

  it("moves, duplicates, and deletes individual sound points", () => {
    const units = MOCK_SOUND_UNITS.map((unit, index) => ({ ...unit, active: index === 0 }));
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1);
    const source = composition.events[0];
    const moved = moveWorldCompositionEvent(composition, source.id, { startBeat: 7.5, lane: 0 });
    // 换行只改画在哪一条线上；孩子的高低在声音配方里已经定了，挪位置不该动移调量。
    expect(moved.events.find((event) => event.id === source.id)).toMatchObject({ startBeat: 7.5, lane: 0, semitoneShift: source.semitoneShift });
    const copied = duplicateWorldCompositionEvent(moved, source.id);
    expect(copied.events.filter((event) => event.soundUnitId === source.soundUnitId)).toHaveLength(moved.events.filter((event) => event.soundUnitId === source.soundUnitId).length + 1);
    const copy = copied.events.find((event) => event.id.startsWith(`${source.id}-copy-`));
    expect(copy).toMatchObject({ startBeat: 7.5, lane: 0, semitoneShift: source.semitoneShift });
    expect(deleteWorldCompositionEvent(copied, copy!.id).events).toEqual(moved.events);
  });
});

describe("duplicated capsules", () => {
  it("inherits the current selection and can then be edited on its own", () => {
    const units = MOCK_SOUND_UNITS.map((unit) => ({ ...unit, active: unit.id === "sound-rain" }));
    const composition = normalizeEditableSourceClips(arrangeCompositionV2(MOCK_SOUND_CARDS, units, 1, 24, "duplicate-clip"), MOCK_ORIGINAL_AUDIO_ASSETS);
    const event = composition.events.find((item) => item.soundUnitId === "sound-rain" && !item.generatedBy)!;
    const asset = MOCK_ORIGINAL_AUDIO_ASSETS.find((item) => item.id === event.audioAssetId)!;
    const edited = updateCompositionEventSourceClip(composition, event.id, asset, { startSeconds: 3, endSeconds: 9 });
    const duplicated = duplicateWorldCompositionEvent(edited, event.id);
    const copy = duplicated.events.find((item) => item.id !== event.id && item.soundUnitId === "sound-rain" && !item.generatedBy)!;

    expect(copy).toMatchObject({ sourceOffsetSeconds: 3, sourceSelectionDurationSeconds: 6, sourceClipOrigin: "user" });

    const recut = updateCompositionEventSourceClip(duplicated, copy.id, asset, { startSeconds: 10, endSeconds: 12 });
    expect(recut.events.find((item) => item.id === copy.id)).toMatchObject({ sourceOffsetSeconds: 10, sourceSelectionDurationSeconds: 2 });
    expect(recut.events.find((item) => item.id === event.id)).toMatchObject({ sourceOffsetSeconds: 3, sourceSelectionDurationSeconds: 6 });
  });
});
