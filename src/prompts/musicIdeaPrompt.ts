import type { MusicPolishBrief } from "@/src/features/music-polish/contracts";
import { derivePitchMaterial, describePitchMaterial } from "@/src/features/music-polish/rules/derivePitchMaterial";

export const MUSIC_IDEA_PROMPT_VERSION = "music-idea-prompt-v1";

/**
 * 只向模型要"音乐想法"，不要整份事件表。
 *
 * 为什么这么改：让模型一次写几十个事件时，它会退化成每隔几秒放一个和弦的地毯——
 * 没有记忆点，也听不出情绪差别。真正需要想象力的是**那一句动机**和**四段的性格**；
 * 重复、变形、留白、收尾这些有名有姓的手法交给程序更可靠。
 *
 * 附带的好处：要返回的 JSON 很短，格式出错和被截断的概率大幅下降。
 */
/**
 * attempt 是"这是第几次尝试"。孩子点"重新生成"就是想听到不一样的东西，
 * 而这份摘要每次都相同，靠 0.35 的 temperature 换不出新动机——所以直接把
 * "换一个写法"写进提示词。第一次不加，保证首版是模型最有把握的那一版。
 */
export function buildMusicIdeaPrompt(brief: MusicPolishBrief, attempt = 0): string {
  const material = derivePitchMaterial(brief);
  const valence = brief.emotionCoordinates.enabled ? brief.emotionCoordinates.valence : 0;
  const arousal = brief.emotionCoordinates.enabled ? brief.emotionCoordinates.arousal : 0;

  return [
    "你是一位为儿童真实环境声音作品写伴奏的编曲者。只返回合法 JSON，不要 Markdown、不要解释文字。",

    "【你的任务】只写一个音乐想法：一句动机、四个段落的性格、低音律动。",
    "不要写完整的音符表——重复、变形、留白和收尾由程序按你给的想法来发展。",
    "所以请把心思花在**那一句动机**上：它要短、要好记、要能被哼出来。",

    "【JSON 结构】",
    "{version:'music-idea-v1',motifDegrees:[..],motifBeats:[..],sections:[{name,density,register,voice}x4],bassPulse,padSustain}",
    "  · motifDegrees：动机的音级，相对主音。0 是主音，1 是上一级，-1 是下一级。2 到 6 个音。",
    "  · motifBeats：每个音的时值（拍），与 motifDegrees 一一对应，取值 0.25 到 4。",
    "  · sections：必须依次是 intro、development、peak、ending 四段。",
    "      density 取 sparse/medium/busy，register 取 low/mid/high，voice 取 mallet/pluck/pulse。",
    "  · bassPulse 取 none/slow/steady；padSustain 是布尔值，决定要不要长音铺底。",

    "【这一首用的音高材料】动机的音级会落在这套音阶上：",
    ...describePitchMaterial(material),

    "【怎样的动机才算好】",
    "  · 音数要少：2 到 6 个音。多了就不好记。",
    "  · 至少有一次跳进（相邻两音相差 2 级以上），全是级进会平淡。",
    "  · 轮廓要有方向：先上后下、或先下后上，不要来回原地打转。",
    "  · 时值不要全都一样：长短相间才有性格，例如 [1, 0.5, 0.5, 2]。",
    "  · 想象它会被反复听到四次以上，每次略有变化——所以它要经得起重复。",

    "【段落性格怎么定】",
    `  · 这首作品 ${brief.durationSeconds} 秒，分成 ${brief.sections.length} 段：`,
    ...brief.sections.map((section) => `      ${sectionLabel(section.name)} ${section.startSeconds}–${section.endSeconds} 秒，孩子的声音出现 ${section.childEventCount} 次。`),
    "  · 孩子声音多的段落，伴奏要更稀疏（density 用 sparse），把位置让出来。",
    "  · 四段的 register 不要全都一样，至少换一次，才听得出段落变化。",

    "【情绪】只作为音乐方向，不做任何心理或能力判断。",
    `  · valence = ${valence.toFixed(2)}（-1 最暗，1 最亮）：${valence >= 0.25 ? "动机可以多用向上的跳进，明亮开朗" : valence <= -0.25 ? "动机可以多用向下的级进，收敛一些" : "明暗各半，保持中性"}。`,
    `  · arousal = ${arousal.toFixed(2)}（-1 最静，1 最激动）：${arousal >= 0.3 ? "动机短促、时值偏小，bassPulse 用 steady" : arousal <= -0.3 ? "动机舒展、时值偏大，bassPulse 用 none 或 slow" : "中等，bassPulse 用 slow"}。`,

    "【身份】伴奏是回应者，不是主角。孩子采集的原声永远是主线，你写的动机只负责托住它、回应它。",
    "不要人声、歌词、已知歌曲或品牌旋律。",

    "【本次作品的匿名摘要】",
    JSON.stringify(brief),
    attempt > 0
      ? `这是第 ${attempt + 1} 次为这首作品写伴奏。请换一个明显不同的动机：换一个起音、换一种节奏疏密，或者换一件主奏乐器。不要重复前几次的写法。`
      : "",
  ].filter(Boolean).join("\n");
}

function sectionLabel(name: MusicPolishBrief["sections"][number]["name"]) {
  return name === "intro" ? "引子" : name === "development" ? "发展" : name === "peak" ? "主要变化" : "收束";
}
