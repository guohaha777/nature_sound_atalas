import type { Composition } from "@/src/domain/composition";

export interface PlaybackAudioAsset {
  id: string;
  url: string;
  sourceKey: string;
}

export interface PlaybackPlan {
  composition: Composition;
  assets: Record<string, PlaybackAudioAsset>;
}

export interface PlaybackState {
  status: "idle" | "loading" | "ready" | "playing" | "paused" | "ended" | "error";
  currentTime: number;
  duration: number;
  activeSoundUnitIds: string[];
  activeCompositionEventIds: string[];
  polishEnabled: boolean;
  errorMessage: string | null;
}

export interface CompositionPlayer {
  unlock(): Promise<void>;
  load(plan: PlaybackPlan): Promise<void>;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  stop(): void;
  setPolishEnabled(enabled: boolean): void;
  subscribe(listener: (state: PlaybackState) => void): () => void;
  dispose(): void;
}
