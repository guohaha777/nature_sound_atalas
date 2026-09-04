import { resolveEmotionSelection } from "@/src/features/composition-emotion";
import type { MusicPolishBrief } from "@/src/features/music-polish/contracts";
import { deriveMusicPolishDirection } from "@/src/features/music-polish/rules/deriveMusicPolishDirection";

export function buildFunMusicPromptV2(brief: MusicPolishBrief): string {
  const direction = deriveMusicPolishDirection(brief);
  const emotion = brief.emotionCoordinates.enabled
    ? resolveEmotionSelection(brief.emotionCoordinates.valence, brief.emotionCoordinates.arousal).keyword
    : "未指定情绪，保持自然中立";
  const energyCopy = direction.energyBand === "quiet"
    ? "低能量：慢起音、稀疏长音、大量留白，不设置持续节拍"
    : direction.energyBand === "balanced"
      ? "中等能量：加入轻柔木质脉冲，保持稳定但不抢占原声"
      : "有推动感：使用清晰但克制的低频与木质节奏脉冲，允许适度切分和张力，不能压过原声";
  const register = brief.pitchProfile.high > brief.pitchProfile.low ? "背景以中低音域为主" : "背景以中高音域的轻薄织体为主";
  const positions = [0, 1, 2].map((section) => brief.eventPositions.filter((value) => value >= section / 3 && (section === 2 ? value <= 1 : value < (section + 1) / 3)).length);

  return [
    "生成一段用于儿童真实环境声音作品的纯音乐背景垫音层。",
    `作品的试听长度是 ${Math.round(brief.durationSeconds)} 秒；尽量在这段时间内自然开始并收束。`,
    `情绪关键词：${emotion}；参考速度 ${Math.round(brief.bpm)} BPM。`,
    `${energyCopy}。能量 ${direction.energy.toFixed(2)}，脉冲 ${direction.pulse.toFixed(2)}，张力 ${direction.tension.toFixed(2)}，留白 ${direction.space.toFixed(2)}。`,
    `${register}。声音事件在前段、中段、后段的数量约为 ${positions.join("、")}，据此形成自然的开始、发展和收束。`,
    "只能作为陪衬：不要主旋律、不要独奏性旋律、不要人声、歌词、说话声或拟声；不要模仿、替代或掩盖儿童原声。",
    "可以使用空气感合成器、轻薄弦乐、柔和木质打击和克制低频脉冲；避免强烈鼓组、突然爆发和过度压缩。",
    "开头与结尾自然，不要引用或模仿任何已知歌曲、品牌音乐或受版权保护的旋律。",
  ].join(" ");
}

export const FUN_MUSIC_PROMPT_VERSION = "fun-music-prompt-v2" as const;
