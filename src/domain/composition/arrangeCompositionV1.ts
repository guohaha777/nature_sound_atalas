import type { ConfirmedSoundCard, SoundUnit } from "../sound-card";
import { mapCardToMusicIntent } from "../music-mapping";
import type { Composition, CompositionEvent } from "./types";

function patternStarts(pattern: string, latestStart: number, offset: number): number[] {
  const span = Math.max(0, latestStart - offset);
  const fractions = pattern === "once" ? [0]
    : pattern === "repeat" ? [0, 0.25, 0.5, 0.75, 1]
      : pattern === "bursts" ? [0, 0.08, 0.45, 0.53, 1]
        : [0.08, 0.45, 0.82];
  return fractions.map((fraction) => Math.min(latestStart, offset + span * fraction));
}

export function arrangeCompositionV1(cards: ConfirmedSoundCard[], units: SoundUnit[], revision = 1, durationSeconds = 24): Composition {
  const bpm = 88;
  const beatLength = durationSeconds * bpm / 60;
  const activeUnits = units.filter((unit) => unit.active);
  const events: CompositionEvent[] = [];
  activeUnits.forEach((unit, unitIndex) => {
    const card = cards.find((item) => item.id === unit.cardId);
    if (!card) return;
    const intent = mapCardToMusicIntent(card);
    const latestStart = Math.max(0, beatLength - intent.durationBeats);
    patternStarts(intent.pattern, latestStart, Math.min(latestStart, unitIndex * 2)).forEach((startBeat, eventIndex) => {
      events.push({
        id: `${unit.id}-event-${eventIndex}`,
        soundUnitId: unit.id,
        audioAssetId: unit.originalAudioAssetId,
        sourceKey: intent.sourceKey,
        startBeat,
        durationBeats: intent.durationBeats,
        gainDb: intent.gainDb,
        semitoneShift: intent.semitoneShift,
      });
    });
  });

  return {
    id: "demo-composition",
    projectId: activeUnits[0]?.projectId ?? "demo-project",
    soundUnitIds: activeUnits.map((unit) => unit.id),
    events: events.sort((a, b) => a.startBeat - b.startBeat),
    polishLayer: null,
    polishEnabled: false,
    bpm,
    durationSeconds,
    emotionIntent: {
      enabled: false,
      valence: 0,
      arousal: 0,
      label: null,
      mappingVersion: "emotion-mapping-v1",
    },
    seed: "demo-arrangement-v1",
    arrangerVersion: "arranger-v1",
    revision,
  };
}
