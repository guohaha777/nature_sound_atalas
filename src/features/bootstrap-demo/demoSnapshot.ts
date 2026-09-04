import type { DemoSnapshot } from "@/src/features/ports";
import { normalizeEditableSourceClips } from "@/src/features/sound-world";
import { alignCompositionDurationToOptions } from "@/src/features/composition-duration";
import { MOCK_ORIGINAL_AUDIO_ASSETS, MOCK_PAPER_SOUND_CARDS, MOCK_PROJECT, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, type MockSoundCard } from "@/src/mocks/mockData";

export function createInitialDemoSnapshot(): DemoSnapshot {
  return structuredClone({
    project: MOCK_PROJECT,
    paperCards: MOCK_PAPER_SOUND_CARDS,
    cards: MOCK_SOUND_CARDS,
    audioAssets: MOCK_ORIGINAL_AUDIO_ASSETS,
    units: MOCK_SOUND_UNITS,
    composition: null,
    archivedCompositions: [],
    currentCardId: MOCK_SOUND_CARDS[0].id,
    currentPath: "/cards?entry=diary",
    completedSteps: [],
  });
}

/** 把v1单快照补齐为当前公共契约；正式v2记录仍由Repository逐项校验。 */
export function normalizeDemoSnapshot(stored: DemoSnapshot): DemoSnapshot {
  const initial = createInitialDemoSnapshot();
  const partial = stored as Partial<DemoSnapshot>;
  const storedCards = Array.isArray(partial.cards) ? partial.cards : [];
  const baseCards = (initial.cards as MockSoundCard[]).map((base) => {
    const previous = storedCards.find((item) => item.id === base.id) as MockSoundCard | undefined;
    return {
      ...base,
      ...previous,
      projectId: base.projectId,
      paperCardId: base.paperCardId,
      entryIndex: base.entryIndex,
      owner: base.owner,
      ownerInitials: base.ownerInitials,
      place: base.place,
      source: {
        ...base.source,
        label: base.source.label,
        decisionSource: previous?.source.decisionSource ?? base.source.decisionSource,
      },
      attribution: base.attribution,
      audioRecipe: base.audioRecipe,
    };
  }) as MockSoundCard[];
  const baseCardIds = new Set(baseCards.map((card) => card.id));
  const cards = [...baseCards, ...storedCards.filter((card) => !baseCardIds.has(card.id))] as MockSoundCard[];
  const storedUnits = Array.isArray(partial.units) ? partial.units : [];
  const baseUnits = initial.units.map((base) => {
    const previous = storedUnits.find((item) => item.id === base.id);
    const card = cards.find((item) => item.id === base.cardId)!;
    return { ...base, active: previous?.active ?? base.active, parameters: { pitch: card.pitch, duration: card.duration, contour: card.contour, intensity: card.intensity, pattern: card.pattern } };
  });
  const baseUnitIds = new Set(baseUnits.map((unit) => unit.id));
  const units = [...baseUnits, ...storedUnits.filter((unit) => !baseUnitIds.has(unit.id) && cards.some((card) => card.id === unit.cardId))];
  const storedAudioAssets = Array.isArray(partial.audioAssets) ? partial.audioAssets : [];
  const baseAudioIds = new Set(initial.audioAssets.map((asset) => asset.id));
  const audioAssets = [...initial.audioAssets, ...storedAudioAssets.filter((asset) => !baseAudioIds.has(asset.id))];
  const storedPaperCards = Array.isArray(partial.paperCards) ? partial.paperCards : [];
  const basePaperCardIds = new Set(initial.paperCards.map((card) => card.id));
  const paperCards = [...initial.paperCards, ...storedPaperCards.filter((card) => !basePaperCardIds.has(card.id))];
  const previousComposition = partial.composition;
  const compositionBase = previousComposition ? {
    ...previousComposition,
    projectId: initial.project.id,
    events: previousComposition.events.map((event) => ({
      ...event,
      audioAssetId: event.audioAssetId ?? units.find((unit) => unit.id === event.soundUnitId)?.originalAudioAssetId ?? "audio-wind",
    })),
    emotionIntent: previousComposition.emotionIntent ?? { enabled: false, valence: 0, arousal: 0, label: null, mappingVersion: "emotion-mapping-v1" as const },
    seed: previousComposition.seed ?? "demo-arrangement-v1",
  } : null;
  const composition = compositionBase ? normalizeEditableSourceClips(alignCompositionDurationToOptions(compositionBase), audioAssets) : null;
  const archivedCompositions = (Array.isArray(partial.archivedCompositions)
    ? partial.archivedCompositions
    : composition?.savedAt ? [composition] : [])
    .filter((item) => item.savedAt);
  return {
    ...initial,
    ...partial,
    project: { ...initial.project, ...partial.project },
    paperCards,
    cards,
    audioAssets,
    units,
    composition,
    archivedCompositions,
    currentPath: partial.currentPath ?? initial.currentPath,
  };
}
