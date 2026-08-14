import { z } from "zod";

export const soundProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mode: z.enum(["demo", "local"]),
  demoManifestVersion: z.literal("demo-world-v1"),
  activeCompositionId: z.string().min(1).nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const demoStateSchema = z.object({
  id: z.literal("current-demo"),
  projectId: z.string().min(1),
  currentPath: z.string().startsWith("/"),
  stage: z.enum(["entrance", "capture", "confirm", "birth", "world", "compose", "work"]),
  currentCardId: z.string().min(1),
  selectedSoundUnitIds: z.array(z.string().min(1)),
  completedSteps: z.array(z.string().min(1)),
  updatedAt: z.string().min(1),
});
