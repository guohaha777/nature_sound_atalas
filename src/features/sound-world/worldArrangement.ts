import type { OriginalAudioAsset } from "@/src/domain/audio-asset";
import type { Composition, CompositionEvent } from "@/src/domain/composition";
import { mapCardToMusicIntent } from "@/src/domain/music-mapping";
import { PITCH_SHIFT } from "@/src/domain/music-mapping/mappingRulesV1";
import type { ConfirmedSoundCard, PitchChoice, SoundUnit } from "@/src/domain/sound-card";

export const WORLD_POSITION_SLOTS = 8;
export const WORLD_MAX_REPEATS = 4;
export const WORLD_LAST_BEAT = 23;

export interface SoundWorldItem {
  card: ConfirmedSoundCard;
  unit: SoundUnit;
  asset: OriginalAudioAsset;
}

export interface WorldArrangementValues {
  pitch: PitchChoice;
  repeatCount: number;
  startSlot: number;
}

export function listEligibleSoundWorldItems(
  cards: ConfirmedSoundCard[],
  units: SoundUnit[],
  assets: OriginalAudioAsset[],
): SoundWorldItem[] {
  return units.flatMap((unit) => {
    const card = cards.find((item) => item.id === unit.cardId);
    const asset = assets.find((item) => item.id === unit.originalAudioAssetId);
    if (!card || !asset || card.sourceSelectionRequired || card.confirmedAt.endsWith("-draft")) return [];
    return [{ card, unit, asset }];
  });
}

export function readWorldArrangement(
  composition: Composition | null,
  unit: SoundUnit,
): WorldArrangementValues {
  const events = composition?.events.filter((event) => event.soundUnitId === unit.id).sort((a, b) => a.startBeat - b.startBeat) ?? [];
  const first = events[0];
  const pitch = first ? pitchFromSemitoneShift(first.semitoneShift) : unit.parameters.pitch;
  return {
    pitch,
    repeatCount: Math.max(1, Math.min(WORLD_MAX_REPEATS, events.length || patternDefaultRepeats(unit.parameters.pattern))),
    startSlot: Math.max(0, Math.min(WORLD_POSITION_SLOTS - 1, Math.round((first?.startBeat ?? 0) / 3))),
  };
}

export function updateWorldComposition(
  composition: Composition,
  cards: ConfirmedSoundCard[],
  units: SoundUnit[],
  soundUnitId: string,
  patch: Partial<WorldArrangementValues>,
): Composition {
  const unit = units.find((item) => item.id === soundUnitId);
  const card = unit ? cards.find((item) => item.id === unit.cardId) : null;
  if (!unit || !card || !composition.soundUnitIds.includes(soundUnitId)) return composition;

  const current = readWorldArrangement(composition, unit);
  const values: WorldArrangementValues = {
    pitch: patch.pitch ?? current.pitch,
    repeatCount: Math.max(1, Math.min(WORLD_MAX_REPEATS, Math.round(patch.repeatCount ?? current.repeatCount))),
    startSlot: Math.max(0, Math.min(WORLD_POSITION_SLOTS - 1, Math.round(patch.startSlot ?? current.startSlot))),
  };
  const intent = mapCardToMusicIntent({ ...card, ...unit.parameters });
  const startBeat = values.startSlot * 3;
  const lastBeat = 23;
  const spacing = values.repeatCount > 1 ? Math.max(0.5, (lastBeat - startBeat) / (values.repeatCount - 1)) : 0;
  const replacement: CompositionEvent[] = Array.from({ length: values.repeatCount }, (_, index) => ({
    id: `${unit.id}-world-${index}`,
    soundUnitId: unit.id,
    audioAssetId: unit.originalAudioAssetId,
    sourceKey: intent.sourceKey,
    startBeat: Math.min(lastBeat, startBeat + spacing * index),
    durationBeats: intent.durationBeats,
    gainDb: intent.gainDb,
    semitoneShift: PITCH_SHIFT[values.pitch],
    filterMotion: intent.contour.filterMotion,
    contourSemitoneDelta: intent.contour.semitoneDelta,
    fadeInSeconds: intent.pattern === "fade-in" ? 1.2 : 0.025,
  }));

  return {
    ...composition,
    events: [...composition.events.filter((event) => event.soundUnitId !== soundUnitId), ...replacement].sort((a, b) => a.startBeat - b.startBeat),
    polishLayer: composition.polishLayer,
    revision: composition.revision + 1,
  };
}

export function selectWorldSoundUnits(
  composition: Composition | null,
  cards: ConfirmedSoundCard[],
  units: SoundUnit[],
  requestedIds: string[],
): { composition: Composition; units: SoundUnit[] } {
  const ids = Array.from(new Set(requestedIds));
  const selected = new Set(ids);
  const nextUnits = units.map((unit) => ({ ...unit, active: selected.has(unit.id) }));
  const base = buildBaseComposition(cards, nextUnits, (composition?.revision ?? 0) + 1);
  if (!composition) return { composition: base, units: nextUnits };

  const retainedEvents = composition.events.filter((event) => selected.has(event.soundUnitId));
  const retainedIds = new Set(retainedEvents.map((event) => event.soundUnitId));
  const addedEvents = base.events.filter((event) => !retainedIds.has(event.soundUnitId));
  return {
    units: nextUnits,
    composition: {
      ...base,
      events: [...retainedEvents, ...addedEvents].sort((a, b) => a.startBeat - b.startBeat),
      polishLayer: composition.polishLayer,
      polishEnabled: composition.polishEnabled,
      emotionIntent: composition.emotionIntent,
      seed: composition.seed,
      durationSeconds: composition.durationSeconds,
      title: composition.title,
      createdAt: composition.createdAt,
    },
  };
}

export function moveWorldCompositionEvent(
  composition: Composition,
  eventId: string,
  patch: { startBeat?: number; pitch?: PitchChoice },
): Composition {
  const events = composition.events.map((event) => event.id === eventId ? {
    ...event,
    startBeat: Math.max(0, Math.min(WORLD_LAST_BEAT, patch.startBeat ?? event.startBeat)),
    semitoneShift: patch.pitch ? PITCH_SHIFT[patch.pitch] : event.semitoneShift,
  } : event).sort((a, b) => a.startBeat - b.startBeat);
  return { ...composition, events, revision: composition.revision + 1 };
}

export function duplicateWorldCompositionEvent(composition: Composition, eventId: string): Composition {
  const source = composition.events.find((event) => event.id === eventId);
  if (!source) return composition;
  let copyIndex = 1;
  while (composition.events.some((event) => event.id === `${source.id}-copy-${copyIndex}`)) copyIndex += 1;
  const copy: CompositionEvent = { ...source, id: `${source.id}-copy-${copyIndex}` };
  return {
    ...composition,
    events: [...composition.events, copy].sort((a, b) => a.startBeat - b.startBeat),
    revision: composition.revision + 1,
  };
}

export function deleteWorldCompositionEvent(composition: Composition, eventId: string): Composition {
  const events = composition.events.filter((event) => event.id !== eventId);
  const retainedUnitIds = composition.soundUnitIds.filter((id) => events.some((event) => event.soundUnitId === id));
  return { ...composition, soundUnitIds: retainedUnitIds, events, revision: composition.revision + 1 };
}

function pitchFromSemitoneShift(value: number): PitchChoice {
  if (value >= 4) return "high";
  if (value <= -4) return "low";
  return "mid";
}

function patternDefaultRepeats(pattern: SoundUnit["parameters"]["pattern"]): number {
  if (pattern === "repeat" || pattern === "bursts") return 3;
  if (pattern === "fade-in") return 2;
  return 1;
}

function buildBaseComposition(cards: ConfirmedSoundCard[], units: SoundUnit[], revision: number): Composition {
  const activeUnits = units.filter((unit) => unit.active);
  const events = activeUnits.flatMap((unit, index) => {
    const card = cards.find((item) => item.id === unit.cardId);
    if (!card) return [];
    const intent = mapCardToMusicIntent({ ...card, ...unit.parameters });
    return [{
      id: `${unit.id}-world-0`,
      soundUnitId: unit.id,
      audioAssetId: unit.originalAudioAssetId,
      sourceKey: intent.sourceKey,
      startBeat: (index % 12) * 2,
      durationBeats: intent.durationBeats,
      gainDb: intent.gainDb,
      semitoneShift: intent.semitoneShift,
      filterMotion: intent.contour.filterMotion,
      contourSemitoneDelta: intent.contour.semitoneDelta,
      fadeInSeconds: intent.pattern === "fade-in" ? 1.2 : 0.025,
    } satisfies CompositionEvent];
  });
  return {
    id: "demo-composition",
    projectId: activeUnits[0]?.projectId ?? "demo-project",
    soundUnitIds: activeUnits.map((unit) => unit.id),
    events,
    polishLayer: null,
    polishEnabled: false,
    bpm: 88,
    durationSeconds: 24,
    emotionIntent: { enabled: false, valence: 0, arousal: 0, label: null, mappingVersion: "emotion-mapping-v1" },
    seed: "demo-arrangement-v1",
    arrangerVersion: "arranger-v1",
    revision,
  };
}
