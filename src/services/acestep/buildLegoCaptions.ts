import type { MusicPolishBrief, MusicPolishDirection } from "@/src/features/music-polish";

export const LEGO_CAPTION_VERSION = "ace-step-lego-caption-v1";

export interface LegoCaptions {
  /** 全曲语境：这段音频整体是什么。对应 ACE-Step 的 "Global:"。 */
  global: string;
  /** 这一条要生成的轨道该是什么样。对应 ACE-Step 的 "Local:"。 */
  local: string;
  version: string;
}

/**
 * 由孩子的编排推导出送给模型的两段文字。
 *
 * 模型同时收到三样东西：编排混音、全曲语境、轨道约束。
 * 音频负责"跟得上"——调性、律动、孩子发声的时间点；
 * 文字负责"压得住"——不要人声、不要主旋律、动态小、留白。
 * 两者缺一不可：只给音频它会抢戏，只给文字它就与编排无关了。
 */
export function buildLegoCaptions(brief: MusicPolishBrief, direction: MusicPolishDirection): LegoCaptions {
  return {
    global: [
      `a ${Math.round(brief.durationSeconds)} second soundscape built from ${brief.soundCount} real recorded everyday sounds`,
      `arranged by young children as ${brief.eventCount} separate sound events`,
      EMOTION_WORDS[brief.emotion ?? "content"],
      `around ${Math.round(brief.bpm)} BPM`,
      REGISTER_WORDS[dominantRegister(brief)],
    ].join(", "),
    local: [
      // 先说要什么，再说绝对不要什么：约束放在后面，模型更容易守住。
      VOICE_WORDS[direction.energyBand],
      BRIGHTNESS_WORDS[brief.emotion ?? "content"],
      SPACE_WORDS[spaceBand(direction.space)],
      "instrumental only",
      "absolutely no vocals, no singing, no voice, no choir, no humming",
      "no lead melody, no solo instrument taking focus",
      "soft dynamics, low intensity, background bed",
      "leaves space and silence for the recorded sounds",
      "no drum fills, no builds, no drops",
      // 尾巴那一段没有孩子的声音，明确要求模型在那里自然收住，而不是戛然而止。
      "ends with a gentle natural resolution after the recorded sounds stop",
    ].join(", "),
    version: LEGO_CAPTION_VERSION,
  };
}

const EMOTION_WORDS = {
  bright: "warm, sunlit and open in mood",
  content: "calm, settled and unhurried in mood",
  tense: "quietly suspenseful but never loud or dramatic",
  blue: "muted, distant and slightly melancholy",
} as const;

/** 背景的声部密度直接对应能量档，与本地音符方案用的是同一套判断。 */
const VOICE_WORDS = {
  quiet: "extremely sparse sustained drone, almost no rhythm, wide gaps of near silence",
  balanced: "sparse and slow, a few soft repeating notes, subtle gentle pulse, plenty of space",
  driving: "a light steady pulse with soft repeated figures, gentle forward motion, still quiet",
} as const;

const BRIGHTNESS_WORDS = {
  bright: "airy bells and soft mallets",
  content: "warm sustained pads and distant felt piano",
  tense: "hovering strings with an unresolved shimmer",
  blue: "low soft pads in a muted minor colour",
} as const;

const SPACE_WORDS = {
  close: "dry and close, very little reverb",
  natural: "a natural room sense, moderate reverb",
  distant: "wide and distant, long airy reverb tail",
} as const;

const REGISTER_WORDS = {
  high: "the recorded sounds sit mostly in the upper register",
  mid: "the recorded sounds sit mostly in the middle register",
  low: "the recorded sounds sit mostly in the lower register",
} as const;

/** 孩子的声音偏高时背景走低，偏低时背景走高，两边才不会互相遮挡。 */
function dominantRegister(brief: MusicPolishBrief): "high" | "mid" | "low" {
  const { high, mid, low } = brief.pitchProfile;
  if (high >= mid && high >= low) return "high";
  if (low >= mid && low >= high) return "low";
  return "mid";
}

function spaceBand(space: number): "close" | "natural" | "distant" {
  if (space < 0.34) return "close";
  return space < 0.67 ? "natural" : "distant";
}
