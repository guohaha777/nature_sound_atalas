import { z } from "zod";
import { LEGACY_MIN_COMPOSITION_SECONDS, LONGEST_COMPOSITION_SECONDS, type Composition, type CompositionTeachingAdvice } from "@/src/domain/composition";
import type { ConfirmedSoundCard, SoundUnit } from "@/src/domain/sound-card";

const soundDescriptorSchema = z.object({
  soundIndex: z.number().int().positive().max(20),
  pitch: z.enum(["high", "mid", "low"]),
  duration: z.enum(["short", "medium", "long"]),
  contour: z.enum(["rising", "falling", "flat", "wavy"]),
  intensity: z.enum(["soft", "medium", "loud"]),
  pattern: z.enum(["once", "repeat", "bursts", "fade-in"]),
});

export const compositionAdviceBriefSchema = z.object({
  version: z.literal("composition-advice-brief-v1"),
  soundCount: z.number().int().min(1).max(20),
  eventCount: z.number().int().min(1).max(200),
  durationSeconds: z.number().min(LEGACY_MIN_COMPOSITION_SECONDS).max(LONGEST_COMPOSITION_SECONDS),
  pitchBandCounts: z.object({ high: z.number().int().nonnegative(), mid: z.number().int().nonnegative(), low: z.number().int().nonnegative() }),
  density: z.enum(["open", "balanced", "busy"]),
  exactOverlapGroups: z.number().int().nonnegative().max(50),
  emotion: z.enum(["bright", "content", "tense", "blue"]).nullable(),
  sounds: z.array(soundDescriptorSchema).min(1).max(20),
});
export type CompositionAdviceBrief = z.infer<typeof compositionAdviceBriefSchema>;

export const compositionAdviceResultSchema = z.object({
  confidence: z.number().min(0).max(1).nullable(),
  roles: z.array(z.object({
    soundIndex: z.number().int().positive().max(20),
    role: z.enum(["lead", "response", "texture", "pulse"]),
    reason: z.string().min(1).max(100),
  })).max(20),
  backgroundRecommendation: z.object({
    value: z.enum(["helpful", "not-needed", "uncertain"]),
    reason: z.string().min(1).max(160),
  }),
  musicDiscovery: z.object({
    concept: z.enum(["pitch", "layering", "density", "dynamics", "repetition"]),
    childText: z.string().min(1).max(60),
    tryThis: z.string().min(1).max(60),
  }),
});

export const compositionAdviceApiResponseSchema = compositionAdviceResultSchema.extend({
  provider: z.string().min(1),
  model: z.string().min(1),
});

export function buildCompositionAdviceBrief(composition: Composition, _cards: ConfirmedSoundCard[], units: SoundUnit[]): CompositionAdviceBrief {
  const selected = new Set(composition.soundUnitIds);
  const sounds = units.filter((unit) => selected.has(unit.id)).slice(0, 20).map((unit, index) => {
    return {
      soundIndex: index + 1,
      pitch: unit.parameters.pitch,
      duration: unit.parameters.duration,
      contour: unit.parameters.contour,
      intensity: unit.parameters.intensity,
      pattern: unit.parameters.pattern,
    };
  });
  const analysis = composition.contextAnalysis;
  // 摘要是本地数据，越界时收进合法范围即可；这里抛错会连本地教学建议一起失效。
  return compositionAdviceBriefSchema.parse({
    version: "composition-advice-brief-v1",
    soundCount: sounds.length,
    eventCount: Math.max(1, Math.min(200, composition.events.length)),
    durationSeconds: clamp(composition.durationSeconds, LEGACY_MIN_COMPOSITION_SECONDS, LONGEST_COMPOSITION_SECONDS),
    pitchBandCounts: analysis?.pitchBandCounts ?? countPitchBands(sounds),
    density: analysis?.density ?? densityFrom(composition.events.length, composition.durationSeconds),
    exactOverlapGroups: Math.min(50, analysis?.exactOverlapGroups ?? 0),
    emotion: composition.emotionIntent.enabled ? composition.emotionIntent.label : null,
    sounds,
  });
}

export function buildLocalCompositionAdvice(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[]): CompositionTeachingAdvice {
  const brief = buildCompositionAdviceBrief(composition, cards, units);
  const leadIndex = brief.sounds.find((sound) => sound.pitch === "high")?.soundIndex ?? brief.sounds[0].soundIndex;
  const roles = brief.sounds.map((sound) => ({
    soundIndex: sound.soundIndex,
    role: sound.soundIndex === leadIndex ? "lead" as const
      : sound.pattern === "repeat" || sound.pattern === "bursts" ? "pulse" as const
        : sound.intensity === "soft" && sound.duration === "long" ? "texture" as const
          : "response" as const,
    reason: sound.soundIndex === leadIndex ? "这个声音的位置比较醒目，可以先被听见。"
      : sound.pattern === "repeat" || sound.pattern === "bursts" ? "它会重复出现，能帮助大家听见节拍。"
        : sound.intensity === "soft" && sound.duration === "long" ? "它比较轻又比较长，适合铺在后面。"
          : "它可以和前面的声音一问一答。",
  }));
  const recommendation = brief.density === "busy" || brief.soundCount >= 4
    ? { value: "not-needed" as const, reason: "儿童声音已经比较丰富，先听基础作品更清楚。" }
    : brief.density === "open" && brief.soundCount <= 2
      ? { value: "helpful" as const, reason: "声音之间留白较多，可以试听一层很轻的背景。" }
      : { value: "uncertain" as const, reason: "基础作品已经成立，是否加背景适合由孩子试听后决定。" };
  const musicDiscovery = discoveryFrom(brief);
  return {
    version: "composition-teaching-advice-v1",
    compositionRevision: composition.revision,
    sourceKind: "local_rules",
    provider: "wanwu-local-rules",
    model: null,
    basedOnInputHash: stableAdviceHash(JSON.stringify(brief)),
    confidence: null,
    roles,
    backgroundRecommendation: recommendation,
    musicDiscovery,
  };
}

export function stableAdviceHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function hasMusicCreationValue(discovery: CompositionTeachingAdvice["musicDiscovery"]) {
  return /音乐|节奏|旋律|记住|重点|起伏|远近|问答|开头|结尾|热闹|安静|呼吸|规律|一句歌/.test(discovery.childText)
    && /听|比较/.test(discovery.tryThis);
}

function countPitchBands(sounds: CompositionAdviceBrief["sounds"]) {
  return { high: sounds.filter((item) => item.pitch === "high").length, mid: sounds.filter((item) => item.pitch === "mid").length, low: sounds.filter((item) => item.pitch === "low").length };
}

function densityFrom(events: number, seconds: number): CompositionAdviceBrief["density"] {
  const value = events / Math.max(1, seconds);
  return value > 1.5 ? "busy" : value < 0.35 ? "open" : "balanced";
}

function discoveryFrom(brief: CompositionAdviceBrief): CompositionTeachingAdvice["musicDiscovery"] {
  const activePitchBands = Object.values(brief.pitchBandCounts).filter((count) => count > 0).length;
  if (brief.exactOverlapGroups > 0) return { concept: "layering", childText: "几个声音一起出现会挤在一起。把它们错开，音乐会像一问一答。", tryThis: "错开一个声音，听听谁像提问、谁像回答。" };
  if (brief.density === "busy") return { concept: "density", childText: "声音挤在一起会很热闹。留一点空，重要的声音会更清楚。", tryThis: "删掉一个声音点，听听哪个声音更清楚。" };
  if (activePitchBands > 1) return { concept: "pitch", childText: "声音有高有低。让高低交替，音乐会像走台阶一样起伏。", tryThis: "把一个声音上下移动，听听音乐的起伏。" };
  if (new Set(brief.sounds.map((sound) => sound.intensity)).size > 1) return { concept: "dynamics", childText: "声音有轻有响。轻响变化会让音乐像靠近又走远。", tryThis: "把一个声音变轻，听听它是不是像走远了。" };
  return { concept: "repetition", childText: "同一个声音重复出现。重复会让耳朵记住这段音乐。", tryThis: "把它隔开重复三次，听听像不像一句歌。" };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}
