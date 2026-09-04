import type { OriginalAudioAsset } from "@/src/domain/audio-asset";
import type { Composition, CompositionEvent } from "@/src/domain/composition";
import { smallestDurationOptionFor, type CompositionDurationSeconds } from "@/src/features/composition-duration";
import { MIN_SOURCE_CLIP_SECONDS, readEventSourceClip } from "./sourceClip";

export interface ClipCapacity {
  selectionSeconds: number;
  compositionDurationSeconds: number;
  /** 当前作品时长是否放得下这段完整选区。 */
  fits: boolean;
  overflowSeconds: number;
  /** 放不下时可切换到的最短作品档位；没有档位放得下时为 null。 */
  suggestedDurationSeconds: CompositionDurationSeconds | null;
  /** 不改变作品时长时，这段声音最多能用多长。 */
  maxSelectionSecondsInCurrentWork: number;
}

/**
 * 放置空间不足时不静默截断：先判断能否放下，再由界面选择“换更长的作品”或“手动缩短选区”。
 */
export function evaluateClipCapacity(selectionSeconds: number, compositionDurationSeconds: number): ClipCapacity {
  const selection = Math.max(MIN_SOURCE_CLIP_SECONDS, selectionSeconds);
  const work = Math.max(MIN_SOURCE_CLIP_SECONDS, compositionDurationSeconds);
  const fits = selection <= work + 0.001;
  const suggested = fits ? null : smallestDurationOptionFor(selection);
  return {
    selectionSeconds: round(selection),
    compositionDurationSeconds: round(work),
    fits,
    overflowSeconds: round(Math.max(0, selection - work)),
    suggestedDurationSeconds: suggested && suggested > work ? suggested : null,
    maxSelectionSecondsInCurrentWork: round(work),
  };
}

/**
 * 儿童手动选择的声音片段是作品时长的下限：自动编排和时长切换都不能把它剪短。
 */
export function minimumCompositionSecondsForUserClips(composition: Composition | null): number {
  if (!composition) return 0;
  return composition.events.reduce((longest, event) => Math.max(longest, userClipSeconds(event)), 0);
}

export function durationOptionFitsUserClips(composition: Composition | null, seconds: number): boolean {
  return seconds + 0.001 >= minimumCompositionSecondsForUserClips(composition);
}

export interface OversizedSourceNotice {
  eventId: string;
  soundUnitId: string;
  sourceDurationSeconds: number;
  usedSeconds: number;
  suggestedDurationSeconds: CompositionDurationSeconds | null;
}

/**
 * 原声比当前作品还长的胶囊：界面据此提示“换更长的作品”或“自己截取一段”，
 * 而不是让播放层悄悄剪掉尾巴。
 */
export function listOversizedSourceEvents(
  composition: Composition | null,
  assets: OriginalAudioAsset[],
): OversizedSourceNotice[] {
  if (!composition) return [];
  return composition.events.flatMap((event) => {
    if (event.generatedBy) return [];
    const asset = assets.find((item) => item.id === event.audioAssetId);
    if (!asset) return [];
    const clip = readEventSourceClip(event, asset);
    if (clip.sourceDurationSeconds <= composition.durationSeconds + 0.001) return [];
    return [{
      eventId: event.id,
      soundUnitId: event.soundUnitId,
      sourceDurationSeconds: clip.sourceDurationSeconds,
      usedSeconds: clip.durationSeconds,
      suggestedDurationSeconds: smallestDurationOptionFor(clip.sourceDurationSeconds),
    }];
  });
}

function userClipSeconds(event: CompositionEvent): number {
  if (event.generatedBy || event.sourceClipVersion !== "source-clip-v1") return 0;
  return event.sourceSelectionDurationSeconds ?? event.clipDurationSeconds ?? 0;
}

function round(value: number) {
  return Number(value.toFixed(3));
}
