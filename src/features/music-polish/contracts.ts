import { z } from "zod";
import { symbolicMusicPlanSchema } from "@/src/domain/composition";

/**
 * 作品段落：由代码按目标时长切好并给出真实秒数，
 * 让伴奏能对齐时间线，而不是凭比例猜。
 */
export const musicSectionSchema = z.object({
  name: z.enum(["intro", "development", "peak", "ending"]),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().positive(),
  /** 本段里孩子的声音有几次出现。 */
  childEventCount: z.number().int().nonnegative(),
});

export const musicPolishBriefSchema = z.object({
  version: z.literal("music-polish-brief-v4"),
  bpm: z.number().positive(),
  durationSeconds: z.number().positive(),
  soundCount: z.number().int().positive(),
  eventCount: z.number().int().positive(),
  pitchProfile: z.object({ high: z.number().int().nonnegative(), mid: z.number().int().nonnegative(), low: z.number().int().nonnegative() }),
  intensityProfile: z.object({ soft: z.number().int().nonnegative(), medium: z.number().int().nonnegative(), loud: z.number().int().nonnegative() }),
  patternProfile: z.object({ once: z.number().int().nonnegative(), repeat: z.number().int().nonnegative(), bursts: z.number().int().nonnegative(), fadeIn: z.number().int().nonnegative() }),
  emotion: z.enum(["bright", "content", "tense", "blue"]).nullable(),
  emotionCoordinates: z.object({ valence: z.number().min(-1).max(1), arousal: z.number().min(-1).max(1), enabled: z.boolean() }),
  eventPositions: z.array(z.number().min(0).max(1)).max(128),
  sections: z.array(musicSectionSchema).min(1).max(8),
  soundEvents: z.array(z.object({
    soundIndex: z.number().int().positive(),
    /** 绝对秒数：伴奏据此让位与回应。 */
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().positive(),
    startRatio: z.number().min(0).max(1),
    durationRatio: z.number().min(0).max(1),
    pitch: z.enum(["high", "mid", "low"]),
    intensity: z.enum(["soft", "medium", "loud"]),
    pattern: z.enum(["once", "repeat", "bursts", "fade-in"]),
    contour: z.enum(["rising", "falling", "flat", "wavy"]),
  })).max(64),
  /** 孩子声音之间的空白：伴奏可以在这里展开动机。 */
  quietWindows: z.array(z.object({
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().positive(),
  })).max(32),
  /** 孩子声音最密集的一段：伴奏在这里要退让。 */
  busiestWindow: z.object({
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().positive(),
  }).nullable(),
});

export type MusicPolishBrief = z.infer<typeof musicPolishBriefSchema>;

export const musicPolishDirectionSchema = z.object({
  energy: z.number().min(0).max(1),
  pulse: z.number().min(0).max(1),
  tension: z.number().min(0).max(1),
  space: z.number().min(0).max(1),
  energyBand: z.enum(["quiet", "balanced", "driving"]),
});

export type MusicPolishDirection = z.infer<typeof musicPolishDirectionSchema>;

export const funMusicGenerationResponseSchema = z.object({
  audioUrl: z.string().url(),
  audioId: z.string().min(1),
  expiresAt: z.number().int().positive(),
  requestId: z.string().min(1),
  provider: z.literal("aliyun-bailian"),
  model: z.literal("fun-music-preview"),
  promptVersion: z.literal("fun-music-prompt-v2"),
  generatedDurationSeconds: z.number().positive(),
  channels: z.number().int().positive().max(8),
  sampleRate: z.number().int().positive(),
  instrumentalModeRequested: z.literal(true),
});

export type FunMusicGenerationResponse = z.infer<typeof funMusicGenerationResponseSchema>;

/**
 * 模型现在只写"音乐想法"，不再直接写整份事件表。
 *
 * 换这个结构的原因：让模型一次写出几十个事件时，它会退化成每隔几秒放一个和弦的地毯——
 * 既没有记忆点，也听不出情绪差别。改成模型只提供动机与段落性格，
 * 由程序做重复、变形与密度控制，反而更接近真实的编曲分工，也正是 PRD 写的
 * "模型负责创作方向，程序负责校验与执行"。
 */
export const musicIdeaSchema = z.object({
  version: z.literal("music-idea-v1"),
  /** 动机的音级，相对主音；可以为负表示往下走。 */
  motifDegrees: z.array(z.number().int().min(-7).max(14)).min(2).max(6),
  /** 动机每个音的时值（拍），与 motifDegrees 一一对应。 */
  motifBeats: z.array(z.number().min(0.25).max(4)).min(2).max(6),
  /** 四个段落各自的性格。 */
  sections: z.array(z.object({
    name: z.enum(["intro", "development", "peak", "ending"]),
    density: z.enum(["sparse", "medium", "busy"]),
    register: z.enum(["low", "mid", "high"]),
    voice: z.enum(["mallet", "pluck", "pulse"]),
  })).min(1).max(4),
  bassPulse: z.enum(["none", "slow", "steady"]),
  padSustain: z.boolean(),
}).refine((idea) => idea.motifDegrees.length === idea.motifBeats.length, {
  message: "动机的音级与时值数量必须一致",
  path: ["motifBeats"],
});

export type MusicIdea = z.infer<typeof musicIdeaSchema>;

export const symbolicMusicPlanApiResponseSchema = z.object({
  plan: symbolicMusicPlanSchema,
  provider: z.string().min(1),
  model: z.string().min(1),
  /** 程序为了让方案能播放而做的确定性修补；修补率过高说明提示词要调整。 */
  repairs: z.array(z.string().min(1)).max(12).default([]),
});
