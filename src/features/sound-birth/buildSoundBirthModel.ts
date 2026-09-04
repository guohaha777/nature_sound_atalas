import type { OriginalAudioAsset } from "@/src/domain/audio-asset";
import type { Composition, CompositionEvent } from "@/src/domain/composition";
import { mapCardToMusicIntent, type MusicIntent } from "@/src/domain/music-mapping";
import { explainCard, type ConfirmedSoundCard, type PaperSoundCard, type SoundUnit } from "@/src/domain/sound-card";

export type SoundBirthResolution =
  | { status: "ready"; card: ConfirmedSoundCard; unit: SoundUnit; asset: OriginalAudioAsset; intent: MusicIntent; explanation: string; sourceTitle: string; sourceDescription: string; sourceBadge: string; sequenceIndex: number; sequenceTotal: number; nextCardId: string | null }
  | { status: "missing-card" | "unconfirmed" | "missing-unit" | "unbound-source" | "missing-audio" };

export function resolveSoundBirth(
  cardId: string,
  cards: ConfirmedSoundCard[],
  units: SoundUnit[],
  assets: OriginalAudioAsset[],
  paperCards: PaperSoundCard[],
  options: { followPaperSequence?: boolean } = {},
): SoundBirthResolution {
  const card = cards.find((item) => item.id === cardId);
  if (!card) return { status: "missing-card" };
  if (card.confirmedAt.endsWith("-draft")) return { status: "unconfirmed" };
  const unit = units.find((item) => item.cardId === card.id);
  if (!unit) return { status: "missing-unit" };
  if (card.sourceSelectionRequired || card.source.normalizedKey.startsWith("unbound-")) return { status: "unbound-source" };
  const asset = assets.find((item) => item.id === unit.originalAudioAssetId);
  if (!asset) return { status: "missing-audio" };

  const effectiveCard: ConfirmedSoundCard = { ...card, ...unit.parameters };
  const paperCard = options.followPaperSequence ? paperCards.find((item) => item.id === card.paperCardId) : null;
  const sequenceIds = paperCard?.entryIds.filter((id) => cards.some((item) => item.id === id && !item.confirmedAt.endsWith("-draft"))) ?? [card.id];
  const sequenceIndex = Math.max(0, sequenceIds.indexOf(card.id));
  const nextCardId = sequenceIds[sequenceIndex + 1] ?? null;
  const sourceCopy = describeSource(unit, asset);

  return {
    status: "ready",
    card: effectiveCard,
    unit,
    asset,
    intent: mapCardToMusicIntent(effectiveCard),
    explanation: explainCard(effectiveCard),
    ...sourceCopy,
    sequenceIndex,
    sequenceTotal: Math.max(1, sequenceIds.length),
    nextCardId,
  };
}

export function buildSoundBirthPreview(
  card: ConfirmedSoundCard,
  unit: SoundUnit,
  asset: OriginalAudioAsset,
  options: { fullOriginal?: boolean } = {},
): Composition {
  const bpm = 88;
  const secondsPerBeat = 60 / bpm;
  const originalSeconds = Math.max(0.2, asset.durationMs / 1000);
  const intent = mapCardToMusicIntent({ ...card, ...unit.parameters });
  const fullOriginal = Boolean(options.fullOriginal);
  const starts = fullOriginal ? [0] : patternStarts(intent.pattern);
  const playbackRate = fullOriginal ? 1 : Math.pow(2, intent.semitoneShift / 12);
  const naturalSeconds = originalSeconds / playbackRate;
  const requestedSeconds = fullOriginal ? naturalSeconds : intent.durationBeats * secondsPerBeat;
  const playbackSeconds = Math.max(naturalSeconds, requestedSeconds);
  const durationBeats = playbackSeconds / secondsPerBeat;
  const events: CompositionEvent[] = starts.map((startBeat, index) => ({
    id: `birth-${unit.id}-${fullOriginal ? "original" : "derived"}-${index}`,
    soundUnitId: unit.id,
    audioAssetId: asset.id,
    sourceKey: asset.sourceKey,
    startBeat,
    durationBeats,
    gainDb: fullOriginal ? 0 : intent.gainDb,
    semitoneShift: fullOriginal ? 0 : intent.semitoneShift,
    filterMotion: fullOriginal ? "none" : intent.contour.filterMotion,
    contourSemitoneDelta: fullOriginal ? 0 : intent.contour.semitoneDelta,
    fadeInSeconds: !fullOriginal && intent.pattern === "fade-in" ? 1.2 : 0.025,
    loop: !fullOriginal && requestedSeconds > naturalSeconds,
  }));
  const derivedEnd = Math.max(...events.map((event) => (event.startBeat + event.durationBeats) * secondsPerBeat));

  return {
    id: `birth-preview-${unit.id}-${fullOriginal ? "original" : "derived"}`,
    projectId: unit.projectId,
    soundUnitIds: [unit.id],
    events,
    polishLayer: null,
    polishEnabled: false,
    bpm,
    durationSeconds: Math.max(0.2, derivedEnd + 0.08),
    emotionIntent: { enabled: false, valence: 0, arousal: 0, label: null, mappingVersion: "emotion-mapping-v1" },
    seed: `birth-preview-${unit.id}`,
    arrangerVersion: "arranger-v1",
    revision: 1,
  };
}

function patternStarts(pattern: MusicIntent["pattern"]): number[] {
  if (pattern === "repeat") return [0, 1, 2, 3];
  if (pattern === "bursts") return [0, 0.45, 1.8, 2.25];
  return [0];
}

function describeSource(unit: SoundUnit, asset: OriginalAudioAsset) {
  if (unit.inputMode === "paper_card") {
    return { sourceTitle: "历史声音 · 纸卡加入", sourceDescription: `${unit.provenance.contributorName} · ${unit.provenance.place} · ${asset.label}`, sourceBadge: "用户声音" };
  }
  if (asset.kind === "local_recording" || unit.inputMode === "recording") {
    return { sourceTitle: "原始现场录音", sourceDescription: `${unit.provenance.contributorName} · ${unit.provenance.place} · ${asset.label}`, sourceBadge: "个人原声" };
  }
  if (asset.kind === "sound_library") {
    return { sourceTitle: "声音库原始素材", sourceDescription: `${asset.label} · 播放时按声音配方塑形`, sourceBadge: "不可变原声" };
  }
  return { sourceTitle: "系统授权原声", sourceDescription: `${asset.label} · 只保存原声，声卡效果属于贡献者档案`, sourceBadge: "不可变原声" };
}
