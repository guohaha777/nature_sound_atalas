import { z } from "zod";

/**
 * tools/prerender_backgrounds.py 写出的素材清单。
 * 字段名与脚本保持一致；脚本改了这里必须跟着改，否则素材会被整批判为不可用。
 */
export const prerenderedClipSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  emotion: z.enum(["bright", "content", "tense", "blue"]),
  density: z.enum(["quiet", "balanced", "driving"]),
  durationSeconds: z.number().positive(),
  variant: z.number().int().positive(),
  /** ffprobe 实测时长，用来在取用前就排掉泡坏的素材。 */
  actualDurationSeconds: z.number().positive(),
  seed: z.number().int().nonnegative(),
});

export const prerenderedManifestSchema = z.object({
  version: z.literal("prerendered-backgrounds-v1"),
  provider: z.string().min(1),
  model: z.string().min(1),
  lmModel: z.string().nullable(),
  license: z.string().min(1),
  /** 素材是提前泡好的，界面必须按这个来源标注，不能显示成实时模型结果。 */
  sourceKind: z.literal("cached_demo_ai"),
  instrumentalOnly: z.literal(true),
  targetLufs: z.number(),
  fadeInSeconds: z.number().nonnegative(),
  fadeOutSeconds: z.number().nonnegative(),
  generatedAt: z.string().min(1),
  clips: z.array(prerenderedClipSchema),
});

export type PrerenderedClip = z.infer<typeof prerenderedClipSchema>;
export type PrerenderedManifest = z.infer<typeof prerenderedManifestSchema>;
