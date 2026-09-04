import type { OriginalAudioAsset } from "@/src/domain/audio-asset";
import type { Composition, CompositionEvent } from "@/src/domain/composition";
import { smallestDurationOptionFor } from "@/src/features/composition-duration";

export const MAX_SOURCE_DURATION_SECONDS = 30;
export const MIN_SOURCE_CLIP_SECONDS = 0.25;

export interface SourceClipSelection {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  sourceDurationSeconds: number;
  limitedByIngestPolicy: boolean;
}

export function sourceDurationSeconds(asset: OriginalAudioAsset): number {
  return round(Math.min(MAX_SOURCE_DURATION_SECONDS, Math.max(0.01, asset.durationMs / 1000)));
}

export function readEventSourceClip(event: CompositionEvent, asset: OriginalAudioAsset): SourceClipSelection {
  const sourceDuration = sourceDurationSeconds(asset);
  const startSeconds = clamp(event.sourceOffsetSeconds ?? 0, 0, Math.max(0, sourceDuration - MIN_SOURCE_CLIP_SECONDS));
  const remaining = Math.max(MIN_SOURCE_CLIP_SECONDS, sourceDuration - startSeconds);
  const requestedDuration = event.sourceClipVersion === "source-clip-v1"
    ? event.sourceSelectionDurationSeconds ?? event.clipDurationSeconds ?? remaining
    : remaining;
  const durationSeconds = clamp(requestedDuration, MIN_SOURCE_CLIP_SECONDS, remaining);
  return {
    startSeconds: round(startSeconds),
    endSeconds: round(startSeconds + durationSeconds),
    durationSeconds: round(durationSeconds),
    sourceDurationSeconds: sourceDuration,
    limitedByIngestPolicy: asset.durationMs / 1000 > MAX_SOURCE_DURATION_SECONDS + 0.001,
  };
}

/**
 * 旧作品的可编辑胶囊统一升级为“默认完整原声”。自动编排事件保持原有短片段，
 * 用户编辑过的 source-clip-v1 也不会在刷新后被覆盖。
 * 作品时长还没被用户选定时，为放下最长的原声自动换到能容纳它的档位；
 * 用户已选定时长后不再改动它，只把默认选区收在作品长度内，并由界面提示如何处理。
 */
export function normalizeEditableSourceClips(
  composition: Composition,
  assets: OriginalAudioAsset[],
): Composition {
  if (composition.arrangerVersion !== "arranger-v2") return composition;
  const editableUnitIds = new Set(composition.events.filter((event) => !event.generatedBy).map((event) => event.soundUnitId));
  const promotedEventIds = new Set(composition.soundUnitIds.flatMap((soundUnitId) => {
    if (editableUnitIds.has(soundUnitId)) return [];
    const firstAutomaticEvent = composition.events
      .filter((event) => event.soundUnitId === soundUnitId)
      .sort((a, b) => a.startBeat - b.startBeat)[0];
    return firstAutomaticEvent ? [firstAutomaticEvent.id] : [];
  }));
  const editableEvents = composition.events.filter((event) => !event.generatedBy || promotedEventIds.has(event.id));
  const longestSource = editableEvents.reduce((longest, event) => {
    const asset = assets.find((item) => item.id === event.audioAssetId);
    return asset ? Math.max(longest, sourceDurationSeconds(asset)) : longest;
  }, 0);
  const durationSeconds = composition.durationOrigin === "user" || longestSource <= composition.durationSeconds
    ? composition.durationSeconds
    : smallestDurationOptionFor(longestSource) ?? composition.durationSeconds;
  const events = composition.events.map((event) => {
    const editableEvent = promotedEventIds.has(event.id) ? { ...event, generatedBy: undefined } : event;
    if (editableEvent.generatedBy || editableEvent.sourceClipVersion === "source-clip-v1") return editableEvent;
    const asset = assets.find((item) => item.id === event.audioAssetId);
    if (!asset) return editableEvent;
    return applySelectionToEvent(editableEvent, composition.bpm, durationSeconds, {
      startSeconds: 0,
      endSeconds: Math.min(sourceDurationSeconds(asset), durationSeconds),
    }, "full-source");
  });
  return { ...composition, durationSeconds, events: events.sort((a, b) => a.startBeat - b.startBeat) };
}

export function updateCompositionEventSourceClip(
  composition: Composition,
  eventId: string,
  asset: OriginalAudioAsset,
  selection: { startSeconds: number; endSeconds: number },
): Composition {
  const sourceDuration = sourceDurationSeconds(asset);
  const startSeconds = clamp(selection.startSeconds, 0, Math.max(0, sourceDuration - MIN_SOURCE_CLIP_SECONDS));
  const endSeconds = clamp(selection.endSeconds, startSeconds + MIN_SOURCE_CLIP_SECONDS, sourceDuration);
  const events = composition.events.map((event) => event.id === eventId
    ? applySelectionToEvent(event, composition.bpm, composition.durationSeconds, { startSeconds, endSeconds }, "user")
    : event);
  return {
    ...composition,
    events: events.sort((a, b) => a.startBeat - b.startBeat),
    revision: composition.revision + 1,
  };
}

function applySelectionToEvent(
  event: CompositionEvent,
  bpm: number,
  compositionDurationSeconds: number,
  selection: { startSeconds: number; endSeconds: number },
  origin: NonNullable<CompositionEvent["sourceClipOrigin"]>,
): CompositionEvent {
  const durationSeconds = Math.max(MIN_SOURCE_CLIP_SECONDS, selection.endSeconds - selection.startSeconds);
  const durationBeats = durationSeconds * bpm / 60;
  const workBeats = compositionDurationSeconds * bpm / 60;
  return {
    ...event,
    startBeat: round(clamp(event.startBeat, 0, Math.max(0, workBeats - durationBeats))),
    durationBeats: round(durationBeats),
    sourceOffsetSeconds: round(selection.startSeconds),
    clipDurationSeconds: round(durationSeconds),
    sourceClipVersion: "source-clip-v1",
    sourceClipOrigin: origin,
    sourceSelectionDurationSeconds: round(durationSeconds),
    loop: false,
    fadeOutSeconds: Math.min(event.fadeOutSeconds ?? 0.45, durationSeconds / 2),
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number) {
  return Number(value.toFixed(3));
}
