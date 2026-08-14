import { z } from "zod";

export const confirmedSoundCardSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  paperCardId: z.string().min(1),
  entryIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  displayName: z.string().min(1).optional(),
  source: z.object({
    label: z.string().min(1),
    normalizedKey: z.string().min(1),
    decisionSource: z.enum(["demo", "ai_suggested", "human_confirmed"]),
  }),
  pitch: z.enum(["high", "mid", "low"]),
  duration: z.enum(["short", "medium", "long"]),
  contour: z.enum(["rising", "falling", "flat", "wavy"]),
  intensity: z.enum(["soft", "medium", "loud"]),
  pattern: z.enum(["once", "repeat", "bursts", "fade-in"]),
  templateVersion: z.literal("sound-card-v1"),
  confirmedAt: z.string().min(1),
  sourceSelectionRequired: z.boolean().optional(),
  recognition: z.object({
    method: z.enum(["local_template", "remote_ai"]),
    provider: z.string().min(1),
    model: z.string().min(1).nullable(),
    confidence: z.enum(["high", "review"]),
    score: z.number().min(0).max(1).nullable(),
    reason: z.string().min(1),
    teacherConfirmed: z.boolean(),
    confirmedAt: z.string().min(1).nullable(),
  }).optional(),
});

export const paperSoundCardSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  contributorId: z.string().min(1),
  entryIds: z.array(z.string().min(1)).max(3),
  maxEntries: z.literal(3),
  imageAssetId: z.string().min(1).nullable(),
  templateVersion: z.literal("paper-sound-card-v1"),
  createdAt: z.string().min(1),
});

export const soundUnitSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  cardId: z.string().min(1),
  originalAudioAssetId: z.string().min(1),
  inputMode: z.enum(["paper_card", "recording", "sound_library", "demo"]),
  parameters: z.object({
    pitch: z.enum(["high", "mid", "low"]),
    duration: z.enum(["short", "medium", "long"]),
    contour: z.enum(["rising", "falling", "flat", "wavy"]),
    intensity: z.enum(["soft", "medium", "loud"]),
    pattern: z.enum(["once", "repeat", "bursts", "fade-in"]),
  }),
  provenance: z.object({
    contributorId: z.string().min(1),
    contributorName: z.string().min(1),
    originalCardAssetId: z.string().min(1).nullable(),
    originalAudioAssetId: z.string().min(1),
    recordedAt: z.string().min(1),
    place: z.string().min(1),
    archiveScopes: z.array(z.enum(["personal", "classroom"])).min(1),
  }),
  contributionLabel: z.string().min(1),
  active: z.boolean(),
  mappingVersion: z.literal("music-mapping-v1"),
  createdAt: z.string().min(1),
});
