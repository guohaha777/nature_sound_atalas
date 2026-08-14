import type { Composition } from "@/src/domain/composition";

export const COMPOSITION_DURATION_OPTIONS = [15, 24, 30] as const;
export type CompositionDurationSeconds = (typeof COMPOSITION_DURATION_OPTIONS)[number];

export function compositionBeatLength(composition: Pick<Composition, "bpm" | "durationSeconds">) {
  return composition.durationSeconds * composition.bpm / 60;
}

export function resizeCompositionDuration(composition: Composition, durationSeconds: CompositionDurationSeconds): Composition {
  const oldBeatLength = Math.max(0.001, compositionBeatLength(composition));
  const newBeatLength = durationSeconds * composition.bpm / 60;
  const scale = newBeatLength / oldBeatLength;

  return {
    ...composition,
    durationSeconds,
    revision: composition.revision + 1,
    savedAt: undefined,
    events: composition.events.map((event) => ({
      ...event,
      startBeat: Math.min(Math.max(0, newBeatLength - event.durationBeats), event.startBeat * scale),
    })),
  };
}
