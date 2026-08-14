export type ProjectStage = "entrance" | "capture" | "confirm" | "birth" | "world" | "compose" | "work";

export interface SoundProject {
  id: string;
  name: string;
  mode: "demo" | "local";
  demoManifestVersion: "demo-world-v1";
  activeCompositionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DemoState {
  id: "current-demo";
  projectId: string;
  currentPath: string;
  stage: ProjectStage;
  currentCardId: string;
  selectedSoundUnitIds: string[];
  completedSteps: string[];
  updatedAt: string;
}
