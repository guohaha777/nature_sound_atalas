import { z } from "zod";

export const emotionIntentSchema = z.object({
  enabled: z.boolean(),
  valence: z.number().min(-1).max(1),
  arousal: z.number().min(-1).max(1),
  label: z.enum(["bright", "content", "tense", "blue"]).nullable(),
  mappingVersion: z.literal("emotion-mapping-v1"),
});

export const symbolicMusicPlanSchema = z.object({
  version: z.literal("symbolic-music-plan-v1"),
  bpm: z.number().min(48).max(132),
  durationSeconds: z.number().min(15).max(30),
  events: z.array(z.object({
    startSeconds: z.number().min(0).max(30),
    durationSeconds: z.number().min(0.08).max(10),
    midiNotes: z.array(z.number().int().min(36).max(84)).min(1).max(4),
    voice: z.enum(["pad", "pulse", "mallet", "pluck", "bass"]),
    velocity: z.number().min(0.04).max(0.5),
  })).min(1).max(96),
}).superRefine((plan, context) => {
  plan.events.forEach((event, index) => {
    if (event.startSeconds + event.durationSeconds > plan.durationSeconds + 0.001) {
      context.addIssue({ code: "custom", path: ["events", index, "durationSeconds"], message: "音符事件超出作品时长。" });
    }
  });
});

export const compositionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1).optional(),
  createdAt: z.string().min(1).optional(),
  soundUnitIds: z.array(z.string().min(1)).min(1),
  events: z.array(z.object({
    id: z.string().min(1),
    soundUnitId: z.string().min(1),
    audioAssetId: z.string().min(1),
    sourceKey: z.string().min(1),
    startBeat: z.number().nonnegative(),
    durationBeats: z.number().positive(),
    gainDb: z.number(),
    semitoneShift: z.number(),
    filterMotion: z.enum(["up", "down", "none", "lfo"]).optional(),
    contourSemitoneDelta: z.number().optional(),
    fadeInSeconds: z.number().nonnegative().optional(),
    loop: z.boolean().optional(),
  })),
  polishLayer: z.object({
    id: z.string().min(1),
    compositionRevision: z.number().int().positive(),
    sourceKind: z.enum(["live_ai", "symbolic_ai", "cached_demo_ai", "local_fallback"]),
    provider: z.string().min(1),
    model: z.string().nullable(),
    promptVersion: z.string().nullable(),
    defaultGainDb: z.number(),
    basedOnInputHash: z.string(),
    direction: z.object({
      energy: z.number().min(0).max(1),
      pulse: z.number().min(0).max(1),
      tension: z.number().min(0).max(1),
      space: z.number().min(0).max(1),
      energyBand: z.enum(["quiet", "balanced", "driving"]),
    }).optional(),
    audioUrl: z.string().url().optional(),
    audioAssetId: z.string().min(1).optional(),
    audioExpiresAt: z.number().int().positive().optional(),
    symbolicPlan: symbolicMusicPlanSchema.optional(),
    validation: z.object({
      version: z.literal("background-validation-v1"),
      status: z.enum(["basic-guarded", "local-verified"]),
      format: z.enum(["mp3", "local-synthesis"]),
      trustedSource: z.boolean(),
      instrumentalModeRequested: z.boolean(),
      generatedDurationSeconds: z.number().positive().nullable(),
      playbackDurationSeconds: z.number().positive(),
      gainLimited: z.boolean(),
      voiceRiskCheck: z.enum(["provider-request-only", "not-applicable"]),
    }).optional(),
  }).nullable(),
  polishEnabled: z.boolean(),
  bpm: z.number().positive(),
  durationSeconds: z.number().positive(),
  emotionIntent: emotionIntentSchema,
  seed: z.string().min(1),
  arrangerVersion: z.literal("arranger-v1"),
  contextAnalysis: z.object({
    version: z.literal("composition-context-v1"),
    selectedSoundCount: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
    pitchBandCounts: z.object({ high: z.number().int().nonnegative(), mid: z.number().int().nonnegative(), low: z.number().int().nonnegative() }),
    density: z.enum(["open", "balanced", "busy"]),
    exactOverlapGroups: z.number().int().nonnegative(),
    status: z.enum(["ready", "review"]),
    notice: z.string().min(1).nullable(),
    decision: z.enum(["run-deterministic-arranger", "preserve-child-arrangement", "preserve-and-extend"]),
    reason: z.string().min(1),
  }).optional(),
  teachingAdvice: z.object({
    version: z.literal("composition-teaching-advice-v1"),
    compositionRevision: z.number().int().positive(),
    sourceKind: z.enum(["live_ai", "local_rules"]),
    provider: z.string().min(1),
    model: z.string().min(1).nullable(),
    basedOnInputHash: z.string().min(1),
    confidence: z.number().min(0).max(1).nullable(),
    roles: z.array(z.object({
      soundIndex: z.number().int().positive(),
      role: z.enum(["lead", "response", "texture", "pulse"]),
      reason: z.string().min(1).max(100),
    })).max(20),
    backgroundRecommendation: z.object({
      value: z.enum(["helpful", "not-needed", "uncertain"]),
      reason: z.string().min(1).max(160),
    }),
    musicDiscovery: z.object({
      concept: z.enum(["pitch", "layering", "density", "dynamics", "repetition"]),
      childText: z.string().min(1).max(120),
      tryThis: z.string().min(1).max(120),
    }),
  }).optional(),
  revision: z.number().int().positive(),
  savedAt: z.string().optional(),
});
