import type { MusicPolishBrief } from "../contracts";
import { deriveMusicPolishDirection } from "./deriveMusicPolishDirection";

/**
 * 背景的"音色底色"：亮度、空间、音区、起音、明暗。
 *
 * 这一层解决的是"不同素材听上去都差不多"的问题。音符结构本来就随素材变化，
 * 但音色和空间此前是一条恒定流水线——不管孩子录的是牛叫还是风声，听上去都一样。
 *
 * 三条原则：
 * 1. 每个参数都由**成曲前的数据**推导：声音配方、情绪坐标、疏密、时长。
 * 2. 不使用随机数。孩子改一个选择再听一遍，必须能听出是那一下造成的差别，
 *    否则差异对教学无效；随机差异也会破坏归档重放。
 * 3. 背景音区与孩子的音区**反向**：孩子的声音偏高时背景往低走，
 *    既制造差异，又顺带避开遮蔽，让原声始终可辨认。
 */
export interface BackgroundVoicing {
  version: "background-voicing-v1";
  /** 0–1：越大越明亮。驱动滤波开度与包络。 */
  brightness: number;
  /** 0–1：越大空间感越强。密集的作品自动收紧，避免糊住留白。 */
  space: number;
  /** 背景整体移调，负数更低沉。与孩子的音区反向。 */
  registerShiftSemitones: number;
  /** 起音形态：孩子的声音平稳时背景也从容，起伏时背景更利落。 */
  attackShape: "soft" | "natural" | "sharp";
  /** −1 到 1：明暗倾向，由情绪的愉悦度决定。 */
  colorTilt: number;
}

/** 背景可移调的范围：往下让得多一些，往上留一点点即可。 */
const LOWEST_SHIFT = -12;
const HIGHEST_SHIFT = 5;

export function deriveBackgroundVoicing(brief: MusicPolishBrief): BackgroundVoicing {
  const direction = deriveMusicPolishDirection(brief);
  const sounds = Math.max(1, brief.soundCount);
  const loud = brief.intensityProfile.loud / sounds;
  const soft = brief.intensityProfile.soft / sounds;
  const arousal = brief.emotionCoordinates.enabled ? (brief.emotionCoordinates.arousal + 1) / 2 : 0.5;
  const valence = brief.emotionCoordinates.enabled ? brief.emotionCoordinates.valence : 0;

  // 亮度：孩子选"响"的越多、情绪越激动，背景越亮；"轻"的素材配更暗的音色。
  const brightness = clamp01(0.28 + loud * 0.34 + arousal * 0.26 + direction.energy * 0.18 - soft * 0.3);

  // 空间：留白多的作品才给空间感；密集的作品保持干，否则会糊住留白。
  // 长作品略多一点空间，短作品要紧凑。
  const lengthBonus = clamp01((brief.durationSeconds - 20) / 40) * 0.12;
  const space = clamp01(direction.space * 0.62 + soft * 0.16 + lengthBonus - direction.pulse * 0.22);

  return {
    version: "background-voicing-v1",
    brightness: round(brightness),
    space: round(space),
    registerShiftSemitones: registerShift(brief),
    attackShape: attackShape(brief),
    colorTilt: round(clamp(valence * 0.7 + (loud - soft) * 0.2, -1, 1)),
  };
}

/**
 * 孩子的声音偏高 → 背景往低走；偏低 → 背景往上让。
 * 这样两者不挤在同一音区，原声更容易被听出来。
 */
function registerShift(brief: MusicPolishBrief): number {
  const sounds = Math.max(1, brief.soundCount);
  const highShare = brief.pitchProfile.high / sounds;
  const lowShare = brief.pitchProfile.low / sounds;
  const tilt = highShare - lowShare;
  return Math.round(clamp(-tilt * 12, LOWEST_SHIFT, HIGHEST_SHIFT));
}

/** 孩子声音的轮廓决定背景的起音：平稳配从容，起伏配利落。 */
function attackShape(brief: MusicPolishBrief): BackgroundVoicing["attackShape"] {
  const contours = brief.soundEvents.map((event) => event.contour);
  if (contours.length === 0) return "natural";
  const lively = contours.filter((contour) => contour === "wavy" || contour === "rising").length / contours.length;
  const steady = contours.filter((contour) => contour === "flat").length / contours.length;
  if (lively >= 0.5) return "sharp";
  if (steady >= 0.5) return "soft";
  return "natural";
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number) {
  return Number(value.toFixed(3));
}
