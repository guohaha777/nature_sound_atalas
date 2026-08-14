import { z } from "zod";
import { symbolicMusicPlanSchema } from "@/src/domain/composition";

export const musicPolishBriefSchema = z.object({
  version: z.literal("music-polish-brief-v3"),
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
  soundEvents: z.array(z.object({
    soundIndex: z.number().int().positive(),
    startRatio: z.number().min(0).max(1),
    durationRatio: z.number().min(0).max(1),
    pitch: z.enum(["high", "mid", "low"]),
    intensity: z.enum(["soft", "medium", "loud"]),
    pattern: z.enum(["once", "repeat", "bursts", "fade-in"]),
    contour: z.enum(["rising", "falling", "flat", "wavy"]),
  })).max(64),
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

export const symbolicMusicPlanApiResponseSchema = z.object({
  plan: symbolicMusicPlanSchema,
  provider: z.string().min(1),
  model: z.string().min(1),
});
