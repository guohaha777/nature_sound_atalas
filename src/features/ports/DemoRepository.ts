import type { OriginalAudioAsset } from "@/src/domain/audio-asset";
import type { Composition } from "@/src/domain/composition";
import type { DemoState, SoundProject } from "@/src/domain/project";
import type { ConfirmedSoundCard, PaperSoundCard, SoundUnit } from "@/src/domain/sound-card";

export interface DemoSnapshot {
  project: SoundProject;
  paperCards: PaperSoundCard[];
  cards: ConfirmedSoundCard[];
  audioAssets: OriginalAudioAsset[];
  units: SoundUnit[];
  composition: Composition | null;
  archivedCompositions: Composition[];
  currentCardId: string;
  currentPath: string;
  completedSteps: string[];
}

export type StoredDemoState = DemoState;
export type RepositoryStatus = "persistent" | "recovered" | "memory-fallback";

export interface DemoRepository {
  initialize(seed: DemoSnapshot): Promise<DemoSnapshot>;
  load(): Promise<DemoSnapshot | null>;
  save(snapshot: DemoSnapshot): Promise<void>;
  clear(): Promise<void>;
  getStatus(): RepositoryStatus;
}
