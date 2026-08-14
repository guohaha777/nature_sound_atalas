import { describe, expect, it } from "vitest";
import { arrangeCompositionV1 } from "@/src/domain/composition";
import { MOCK_ORIGINAL_AUDIO_ASSETS, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { deleteWorldCompositionEvent, duplicateWorldCompositionEvent, listEligibleSoundWorldItems, moveWorldCompositionEvent, readWorldArrangement, selectWorldSoundUnits, updateWorldComposition } from "./worldArrangement";

describe("sound world arrangement", () => {
  it("excludes draft or unbound sounds from the selectable archive", () => {
    const draft = { ...MOCK_SOUND_CARDS[0], id: "draft", confirmedAt: "paper-draft", sourceSelectionRequired: true };
    const unit = { ...MOCK_SOUND_UNITS[0], id: "unit-draft", cardId: draft.id };
    expect(listEligibleSoundWorldItems([...MOCK_SOUND_CARDS, draft], [...MOCK_SOUND_UNITS, unit], MOCK_ORIGINAL_AUDIO_ASSETS)).toHaveLength(MOCK_SOUND_UNITS.length);
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

  it("moves, duplicates, and deletes individual sound points", () => {
    const units = MOCK_SOUND_UNITS.map((unit, index) => ({ ...unit, active: index === 0 }));
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1);
    const source = composition.events[0];
    const moved = moveWorldCompositionEvent(composition, source.id, { startBeat: 7.5, pitch: "high" });
    expect(moved.events.find((event) => event.id === source.id)).toMatchObject({ startBeat: 7.5, semitoneShift: 7 });
    const copied = duplicateWorldCompositionEvent(moved, source.id);
    expect(copied.events.filter((event) => event.soundUnitId === source.soundUnitId)).toHaveLength(moved.events.filter((event) => event.soundUnitId === source.soundUnitId).length + 1);
    const copy = copied.events.find((event) => event.id.startsWith(`${source.id}-copy-`));
    expect(copy).toMatchObject({ startBeat: 7.5, semitoneShift: 7 });
    expect(deleteWorldCompositionEvent(copied, copy!.id).events).toEqual(moved.events);
  });
});
