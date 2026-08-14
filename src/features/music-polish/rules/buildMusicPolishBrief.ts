import type { Composition } from "@/src/domain/composition";
import type { ConfirmedSoundCard, SoundUnit } from "@/src/domain/sound-card";
import type { MusicPolishBrief } from "../contracts";

export function buildMusicPolishBrief(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[]): MusicPolishBrief {
  const selectedUnits = units.filter((unit) => composition.soundUnitIds.includes(unit.id));
  const selectedCards = selectedUnits.flatMap((unit) => {
    const card = cards.find((candidate) => candidate.id === unit.cardId);
    return card ? [{ ...card, ...unit.parameters }] : [];
  });
  const count = <T extends string>(values: T[], key: T) => values.filter((value) => value === key).length;
  const pitches = selectedCards.map((card) => card.pitch);
  const intensities = selectedCards.map((card) => card.intensity);
  const patterns = selectedCards.map((card) => card.pattern);
  const lastBeat = Math.max(1, ...composition.events.map((event) => event.startBeat));

  return {
    version: "music-polish-brief-v3",
    bpm: composition.bpm,
    durationSeconds: composition.durationSeconds,
    soundCount: Math.max(1, selectedUnits.length),
    eventCount: Math.max(1, composition.events.length),
    pitchProfile: { high: count(pitches, "high"), mid: count(pitches, "mid"), low: count(pitches, "low") },
    intensityProfile: { soft: count(intensities, "soft"), medium: count(intensities, "medium"), loud: count(intensities, "loud") },
    patternProfile: { once: count(patterns, "once"), repeat: count(patterns, "repeat"), bursts: count(patterns, "bursts"), fadeIn: count(patterns, "fade-in") },
    emotion: composition.emotionIntent.enabled ? composition.emotionIntent.label : null,
    emotionCoordinates: {
      enabled: composition.emotionIntent.enabled,
      valence: composition.emotionIntent.valence,
      arousal: composition.emotionIntent.arousal,
    },
    eventPositions: composition.events.slice(0, 128).map((event) => Number((event.startBeat / lastBeat).toFixed(3))),
    soundEvents: composition.events.slice(0, 64).flatMap((event, index) => {
      const unit = units.find((candidate) => candidate.id === event.soundUnitId);
      if (!unit) return [];
      const startSeconds = event.startBeat * (60 / composition.bpm);
      const durationSeconds = event.durationBeats * (60 / composition.bpm);
      return [{
        soundIndex: index + 1,
        startRatio: Number(Math.min(1, startSeconds / composition.durationSeconds).toFixed(3)),
        durationRatio: Number(Math.min(1, durationSeconds / composition.durationSeconds).toFixed(3)),
        pitch: unit.parameters.pitch,
        intensity: unit.parameters.intensity,
        pattern: unit.parameters.pattern,
        contour: unit.parameters.contour,
      }];
    }),
  };
}
