import type { OriginalAudioAsset } from "@/src/domain/audio-asset";
import { arrangeCompositionV2, DEFAULT_COMPOSITION_DURATION_SECONDS, laneOfEvent, type Composition, type CompositionEvent } from "@/src/domain/composition";
import { mapCardToMusicIntent } from "@/src/domain/music-mapping";
import { PITCH_SHIFT, pitchBandFromSemitoneShift } from "@/src/domain/music-mapping/mappingRulesV1";
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

export function selectedPaperCardUnitIds(
  focusCardId: string,
  items: SoundWorldItem[],
): string[] {
  const focused = items.find((item) => item.card.id === focusCardId);
  if (!focused) return [];
  if (focused.unit.inputMode !== "paper_card") return [focused.unit.id];
  return items
    .filter((item) => item.unit.inputMode === "paper_card" && item.card.paperCardId === focused.card.paperCardId)
    .map((item) => item.unit.id);
}

export function readWorldArrangement(
  composition: Composition | null,
  unit: SoundUnit,
): WorldArrangementValues {
  const events = composition?.events.filter((event) => event.soundUnitId === unit.id).sort((a, b) => a.startBeat - b.startBeat) ?? [];
  const first = events[0];
  const pitch = first ? pitchFromSemitoneShift(first.semitoneShift) : unit.parameters.pitch;
  const lastBeat = composition ? Math.max(0.001, composition.durationSeconds * composition.bpm / 60) : WORLD_LAST_BEAT;
  return {
    pitch,
    repeatCount: Math.max(1, Math.min(WORLD_MAX_REPEATS, events.length || patternDefaultRepeats(unit.parameters.pattern))),
    startSlot: Math.max(0, Math.min(WORLD_POSITION_SLOTS - 1, Math.round((first?.startBeat ?? 0) / lastBeat * (WORLD_POSITION_SLOTS - 1)))),
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
  const workBeatLength = composition.durationSeconds * composition.bpm / 60;
  const lastBeat = Math.max(0, workBeatLength - intent.durationBeats);
  const startBeat = values.startSlot / (WORLD_POSITION_SLOTS - 1) * lastBeat;
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
    arrangementRole: roleFromWorldPlacement({ ...card, ...unit.parameters }, values),
    section: sectionFromBeat(Math.min(lastBeat, startBeat + spacing * index), workBeatLength),
  }));

  const events = [...composition.events.filter((event) => event.soundUnitId !== soundUnitId), ...replacement].sort((a, b) => a.startBeat - b.startBeat);

  return {
    ...composition,
    events: ensureLeadRole(events, cards, units),
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
  const base = buildBaseComposition(cards, nextUnits, (composition?.revision ?? 0) + 1, composition?.durationSeconds ?? DEFAULT_COMPOSITION_DURATION_SECONDS, composition?.seed);
  if (!composition) return { composition: base, units: nextUnits };

  const retainedEvents = composition.events.filter((event) => selected.has(event.soundUnitId));
  const retainedIds = new Set(retainedEvents.map((event) => event.soundUnitId));
  const addedEvents = base.events.filter((event) => !retainedIds.has(event.soundUnitId) && event.generatedBy !== "deterministic-arranger-v2");
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

/**
 * 在编排面板里挪一个声音点。
 *
 * 行只决定画在哪一条线上，不再改 semitoneShift——孩子的高低在声音配方里已经选过，
 * 挪位置通常只是想错开重叠，不该顺带把自己的录音升降三个半音。
 * 同理不再因为「拖到最下面一行」就把它判成节奏支点。
 */
export function moveWorldCompositionEvent(
  composition: Composition,
  eventId: string,
  patch: { startBeat?: number; lane?: number },
): Composition {
  const events = composition.events.map((event) => event.id === eventId ? {
    ...event,
    startBeat: Math.max(0, Math.min(Math.max(0, composition.durationSeconds * composition.bpm / 60 - event.durationBeats), patch.startBeat ?? event.startBeat)),
    lane: patch.lane ?? laneOfEvent(event),
    section: sectionFromBeat(patch.startBeat ?? event.startBeat, composition.durationSeconds * composition.bpm / 60),
  } : event).sort((a, b) => a.startBeat - b.startBeat);
  return { ...composition, events, revision: composition.revision + 1 };
}

export function duplicateWorldCompositionEvent(composition: Composition, eventId: string): Composition {
  const source = composition.events.find((event) => event.id === eventId);
  if (!source) return composition;
  let copyIndex = 1;
  while (composition.events.some((event) => event.id === `${source.id}-copy-${copyIndex}`)) copyIndex += 1;
  const copy: CompositionEvent = { ...source, id: `${source.id}-copy-${copyIndex}` };
  return { ...composition, events: [...composition.events, copy].sort((a, b) => a.startBeat - b.startBeat), revision: composition.revision + 1 };
}

export function deleteWorldCompositionEvent(composition: Composition, eventId: string): Composition {
  const events = composition.events.filter((event) => event.id !== eventId);
  const retainedUnitIds = composition.soundUnitIds.filter((id) => events.some((event) => event.soundUnitId === id));
  return { ...composition, soundUnitIds: retainedUnitIds, events, revision: composition.revision + 1 };
}

function pitchFromSemitoneShift(value: number): PitchChoice {
  return pitchBandFromSemitoneShift(value);
}

function patternDefaultRepeats(pattern: ConfirmedSoundCard["pattern"]): number {
  if (pattern === "repeat" || pattern === "bursts") return 3;
  if (pattern === "fade-in") return 2;
  return 1;
}

function buildBaseComposition(cards: ConfirmedSoundCard[], units: SoundUnit[], revision: number, durationSeconds: number, seed?: string): Composition {
  return arrangeCompositionV2(cards, units, revision, durationSeconds, seed);
}

function roleFromWorldPlacement(card: ConfirmedSoundCard, values: WorldArrangementValues): NonNullable<CompositionEvent["arrangementRole"]> {
  if (values.pitch === "low" && values.repeatCount >= 2) return "rhythmic-anchor";
  if (card.duration === "long" || card.pattern === "fade-in") return "texture";
  if (values.startSlot <= 1) return "lead-natural";
  if (values.startSlot >= 5) return "response";
  if (card.duration === "short" || card.pattern === "bursts") return "accent";
  return "response";
}

const LEAD_PITCH_RANK: Record<ConfirmedSoundCard["pitch"], number> = { high: 0, mid: 1, low: 2 };
const LEAD_INTENSITY_RANK: Record<ConfirmedSoundCard["intensity"], number> = { loud: 0, medium: 1, soft: 2 };
const LEAD_DURATION_RANK: Record<ConfirmedSoundCard["duration"], number> = { short: 0, medium: 1, long: 2 };

/**
 * roleFromWorldPlacement 和确定性编曲一样是「先命中先返回」：长音在轮到 lead-natural
 * 之前就被判成 texture，于是整张谱可能一个领唱都没有，老师面板里会读到「大家都在铺底」。
 * 兜底口径与 arrangeCompositionV2 保持一致：先从铺底里挑，再按更响、更短、音更高排。
 */
function ensureLeadRole(events: CompositionEvent[], cards: ConfirmedSoundCard[], units: SoundUnit[]): CompositionEvent[] {
  if (events.some((event) => event.arrangementRole === "lead-natural")) return events;
  const ranked = [...new Set(events.map((event) => event.soundUnitId))]
    .map((id) => {
      const unit = units.find((item) => item.id === id);
      const card = unit ? cards.find((item) => item.id === unit.cardId) : null;
      const isTexture = events.some((event) => event.soundUnitId === id && event.arrangementRole === "texture");
      return unit && card ? { id, isTexture, confirmed: { ...card, ...unit.parameters } } : null;
    })
    .filter((item): item is { id: string; isTexture: boolean; confirmed: ConfirmedSoundCard } => Boolean(item))
    .sort((a, b) =>
      (a.isTexture ? 0 : 1) - (b.isTexture ? 0 : 1)
      || LEAD_INTENSITY_RANK[a.confirmed.intensity] - LEAD_INTENSITY_RANK[b.confirmed.intensity]
      || LEAD_DURATION_RANK[a.confirmed.duration] - LEAD_DURATION_RANK[b.confirmed.duration]
      || LEAD_PITCH_RANK[a.confirmed.pitch] - LEAD_PITCH_RANK[b.confirmed.pitch]
      || a.id.localeCompare(b.id));
  const lead = ranked[0]?.id;
  return lead ? events.map((event) => event.soundUnitId === lead ? { ...event, arrangementRole: "lead-natural" as const } : event) : events;
}

function sectionFromBeat(startBeat: number, workBeatLength: number): NonNullable<CompositionEvent["section"]> {
  const ratio = startBeat / Math.max(0.001, workBeatLength);
  if (ratio < 0.2) return "opening";
  if (ratio < 0.5) return "development";
  if (ratio < 0.78) return "peak";
  return "ending";
}
