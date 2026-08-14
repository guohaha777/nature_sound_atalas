import { describe, expect, it } from "vitest";
import { MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { coordinateCompositionArrangement } from "./coordinateCompositionArrangement";

describe("coordinateCompositionArrangement", () => {
  it("runs deterministic arrangement when no prior score exists", () => {
    const ids = MOCK_SOUND_UNITS.slice(0, 2).map((unit) => unit.id);
    const result = coordinateCompositionArrangement({ composition: null, cards: MOCK_SOUND_CARDS, units: MOCK_SOUND_UNITS, requestedIds: ids });
    expect(result.composition.contextAnalysis?.decision).toBe("run-deterministic-arranger");
  });

  it("preserves moved events when the selection is unchanged", () => {
    const ids = MOCK_SOUND_UNITS.slice(0, 2).map((unit) => unit.id);
    const first = coordinateCompositionArrangement({ composition: null, cards: MOCK_SOUND_CARDS, units: MOCK_SOUND_UNITS, requestedIds: ids });
    const moved = { ...first.composition, events: first.composition.events.map((event, index) => index === 0 ? { ...event, startBeat: 7.5 } : event) };
    const second = coordinateCompositionArrangement({ composition: moved, cards: MOCK_SOUND_CARDS, units: first.units, requestedIds: ids });
    expect(second.composition.events.some((event) => event.startBeat === 7.5)).toBe(true);
    expect(second.composition.contextAnalysis?.decision).toBe("preserve-child-arrangement");
  });

  it("keeps existing events and only places the newly added sound", () => {
    const firstIds = MOCK_SOUND_UNITS.slice(0, 1).map((unit) => unit.id);
    const first = coordinateCompositionArrangement({ composition: null, cards: MOCK_SOUND_CARDS, units: MOCK_SOUND_UNITS, requestedIds: firstIds });
    const retainedEvent = { ...first.composition.events[0], startBeat: 9 };
    const existing = { ...first.composition, events: [retainedEvent] };
    const nextIds = MOCK_SOUND_UNITS.slice(0, 2).map((unit) => unit.id);
    const second = coordinateCompositionArrangement({ composition: existing, cards: MOCK_SOUND_CARDS, units: first.units, requestedIds: nextIds });
    expect(second.composition.events.find((event) => event.id === retainedEvent.id)?.startBeat).toBe(9);
    expect(second.composition.contextAnalysis?.decision).toBe("preserve-and-extend");
  });
});
