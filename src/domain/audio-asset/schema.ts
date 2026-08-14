import { z } from "zod";

export const originalAudioAssetSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  kind: z.enum(["demo_original", "local_recording", "sound_library", "licensed_system"]),
  sourceKey: z.string().min(1),
  label: z.string().min(1),
  storageRef: z.string().min(1),
  mimeType: z.string().min(1),
  durationMs: z.number().int().positive(),
  byteLength: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  licenseRef: z.string().min(1),
  createdAt: z.string().min(1),
});
