import type { MusicPolishBrief } from "../contracts";

const EMOTION_COPY = {
  bright: "明亮、开心、有活力，但不过度热闹",
  content: "平静、满足、温暖、舒缓",
  tense: "略带紧张和推动感，但避免惊吓或压迫",
  blue: "安静、低沉、克制，但保留温柔感",
} as const;

export function buildFunMusicPromptV1(brief: MusicPolishBrief): string {
  const density = brief.eventCount / Math.max(1, brief.durationSeconds);
  const densityCopy = density > 0.55 ? "为密集原声留下清晰间隙" : density > 0.25 ? "保持适中留白" : "用稀疏长音轻轻托住原声";
  const register = brief.pitchProfile.high > brief.pitchProfile.low ? "中低音域为主，避免遮挡高音原声" : "中高音域轻柔铺陈，避免压住低音原声";
  const emotion = brief.emotion ? EMOTION_COPY[brief.emotion] : "中性、自然、带一点森林和空气感";

  return [
    "生成一段纯音乐背景垫音，用于儿童采集的真实环境声音作品。",
    `整体情绪：${emotion}。速度参考 ${Math.round(brief.bpm)} BPM。`,
    `${register}；${densityCopy}。`,
    "使用柔和木质打击、轻薄弦乐或空气感合成器，旋律极简，节奏克制，不要主唱、歌词、说话声、拟声或强烈鼓组。",
    "背景只能衬托，不要模仿、替代或掩盖儿童原声；开头与结尾自然，避免突然爆发。",
    "不要引用已知歌曲、旋律、品牌音乐或受版权保护的作品。",
  ].join(" ");
}

export const FUN_MUSIC_PROMPT_VERSION = "fun-music-prompt-v1" as const;
