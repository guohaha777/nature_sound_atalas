import type { CompositionDurationSeconds } from "@/src/domain/composition";
import type { TeachingAgentToolName } from "./types";

export interface TeachingAgentToolInputMap {
  read_sound_card: { projectId: string; cardAssetId: string };
  resolve_audio_source: { projectId: string; cardId: string };
  render_sound_unit: { projectId: string; cardId: string; audioAssetId: string };
  inspect_composition: { projectId: string; soundUnitIds: string[] };
  arrange_composition: { projectId: string; soundUnitIds: string[]; durationSeconds: CompositionDurationSeconds };
  generate_polish: { projectId: string; compositionId: string; revision: number };
  validate_polish: { projectId: string; compositionId: string; polishLayerId: string };
  archive_composition: { projectId: string; compositionId: string; agentRunId: string };
}

export interface TeachingAgentToolOutputMap {
  read_sound_card: { candidateLabels: string[]; confidence: number | null; requiredFieldsComplete: boolean };
  resolve_audio_source: { audioAssetId: string; sourceKind: "history" | "system" | "local-recording" };
  render_sound_unit: { soundUnitId: string; mappingVersion: "music-mapping-v1" };
  inspect_composition: {
    soundCount: number;
    hasBlockingConflict: boolean;
    backgroundRecommendation: "helpful" | "not-needed" | "uncertain";
    safeReason: string;
  };
  arrange_composition: { compositionId: string; revision: number; arrangerVersion: "arranger-v1" | "arranger-v2" };
  generate_polish: { polishLayerId: string; sourceKind: "live_ai" | "symbolic_ai" | "cached_demo_ai" | "local_fallback" };
  validate_polish: {
    accepted: boolean;
    checks: Array<{ key: "format" | "duration" | "gain" | "foreground-space" | "vocal-risk"; passed: boolean }>;
  };
  archive_composition: { compositionId: string; savedAt: string };
}

export interface TeachingAgentToolset {
  execute<TTool extends TeachingAgentToolName>(
    tool: TTool,
    input: TeachingAgentToolInputMap[TTool],
  ): Promise<TeachingAgentToolOutputMap[TTool]>;
}
