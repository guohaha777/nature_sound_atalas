import { BACKGROUND_DURATION_TOLERANCE_SECONDS } from "@/src/audio/editing/fitBackgroundAudio";
import type { PrerenderedClip } from "./contracts";

/** 儿童没有选情绪时的底色：最中性的一档，不替孩子决定作品的情绪。 */
export const DEFAULT_EMOTION = "content" as const;

export interface ClipQuery {
  emotion: PrerenderedClip["emotion"] | null;
  density: PrerenderedClip["density"];
  durationSeconds: number;
  /** 作品种子：同一个作品每次重放都要选到同一条素材。 */
  seed: string;
}

/**
 * 按「情绪 × 密度 × 时长」挑一条素材。
 *
 * 挑选必须是确定性的：作品保存后重新打开，听到的背景不能换一条。
 * 时长只接受「够长」的素材——短的会被 fitBackgroundAudio 拒绝，
 * 与其取回来再失败，不如在这里就排掉。
 */
export function selectPrerenderedClip(clips: PrerenderedClip[], query: ClipQuery): PrerenderedClip | null {
  const emotion = query.emotion ?? DEFAULT_EMOTION;
  const usable = clips.filter((clip) =>
    clip.emotion === emotion
    && clip.density === query.density
    // 实测时长要够铺满作品，容差与裁剪模块一致，避免两边判断不一样。
    && clip.actualDurationSeconds >= query.durationSeconds - BACKGROUND_DURATION_TOLERANCE_SECONDS);
  if (usable.length === 0) return null;

  // 优先用为这个时长专门泡的素材；没有就用更长的裁下来，绝不用更短的补。
  const exact = usable.filter((clip) => clip.durationSeconds === query.durationSeconds);
  const candidates = exact.length > 0
    ? exact
    : usable
      .filter((clip) => clip.durationSeconds > query.durationSeconds)
      .sort((a, b) => a.durationSeconds - b.durationSeconds)
      .filter((clip, _index, list) => clip.durationSeconds === list[0].durationSeconds);
  if (candidates.length === 0) return null;

  const ordered = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
  return ordered[hash(query.seed) % ordered.length];
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}
