import type { Composition } from "@/src/domain/composition";
import {
  isCompositionDurationSeconds,
  LONGEST_COMPOSITION_SECONDS,
  smallestDurationOptionFor,
  type CompositionDurationSeconds,
} from "@/src/domain/composition";

// 档位本身是领域规则，统一在 domain/composition/durationOptions.ts 定义；这里只补界面文案。
export * from "@/src/domain/composition/durationOptions";

export const COMPOSITION_DURATION_LABELS: Record<CompositionDurationSeconds, { title: string; detail: string }> = {
  20: { title: "小小乐段", detail: "约 20 秒" },
  30: { title: "完整乐段", detail: "约 30 秒" },
  45: { title: "声音故事", detail: "约 45 秒" },
};

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

/**
 * 旧版本的草稿可能停在已经取消的档位（如 24 秒）。
 * 升级时只往"放得下的最短当前档位"上取整，绝不缩短，避免剪掉已经选好的声音。
 * 已归档的作品保持原样，不在这里改动。
 */
export function alignCompositionDurationToOptions(composition: Composition): Composition {
  if (isCompositionDurationSeconds(composition.durationSeconds)) return composition;
  const target = smallestDurationOptionFor(composition.durationSeconds) ?? LONGEST_COMPOSITION_SECONDS;
  const resized = resizeCompositionDuration(composition, target);
  return {
    ...resized,
    // 旧的推荐说明属于旧档位，清掉后由成曲页按当前素材重新给出。
    durationRecommendation: undefined,
    revision: composition.revision,
    savedAt: composition.savedAt,
  };
}
