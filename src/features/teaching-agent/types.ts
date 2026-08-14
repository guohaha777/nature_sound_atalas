export const SOUND_CREATION_AGENT_VERSION = "sound-creation-teaching-agent-v1" as const;
export const DEFAULT_RECOGNITION_CONFIDENCE_THRESHOLD = 0.72;

export type TeachingAgentStage =
  | "intake"
  | "recognition"
  | "confirmation"
  | "sound-rendering"
  | "composition-inspection"
  | "arrangement"
  | "polish-decision"
  | "polish-generation"
  | "polish-validation"
  | "archive"
  | "complete"
  | "blocked";

export type TeachingAgentToolName =
  | "read_sound_card"
  | "resolve_audio_source"
  | "render_sound_unit"
  | "inspect_composition"
  | "arrange_composition"
  | "generate_polish"
  | "validate_polish"
  | "archive_composition";

export type AgentStepStatus = "not-started" | "ready" | "failed";
export type PolishChoice = "unknown" | "accepted" | "declined";
export type PolishGenerationStatus = AgentStepStatus | "skipped";
export type PolishValidationStatus = AgentStepStatus | "not-required";

export interface SoundCreationAgentState {
  version: typeof SOUND_CREATION_AGENT_VERSION;
  runId: string;
  stage: TeachingAgentStage;
  goal: {
    kind: "create-sound-composition";
    audience: "primary-lower-grades";
    deviceMode: "shared-teacher-device";
    preserveChildDecisions: true;
    baseWorkIndependentFromAi: true;
  };
  refs: {
    projectId: string;
    currentCardId: string | null;
    compositionId: string | null;
  };
  recognition: {
    status: AgentStepStatus;
    confidence: number | null;
    requiredFieldsComplete: boolean;
    teacherConfirmed: boolean;
  };
  audioSource: {
    status: "unresolved" | "resolved" | "missing";
  };
  soundUnit: {
    status: "pending" | "ready";
  };
  composition: {
    selectedSoundCount: number;
    inspectionStatus: AgentStepStatus;
    arrangementStatus: AgentStepStatus;
    polishChoice: PolishChoice;
    polishGenerationStatus: PolishGenerationStatus;
    polishValidationStatus: PolishValidationStatus;
    archiveStatus: AgentStepStatus;
  };
  lastFailure: AgentFailure | null;
  trace: AgentTraceEntry[];
}

export interface AgentFailure {
  tool: TeachingAgentToolName;
  code: string;
  recoverable: boolean;
  safeMessage: string;
}

export interface AgentTraceEntry {
  id: string;
  at: string;
  stage: TeachingAgentStage;
  kind: "decision" | "tool-call" | "tool-result" | "human-confirmation" | "fallback" | "validation";
  tool: TeachingAgentToolName | null;
  summary: string;
  success: boolean | null;
}

export type TeachingAgentAction =
  | {
      kind: "call-tool";
      stage: TeachingAgentStage;
      tool: TeachingAgentToolName;
      reason: string;
    }
  | {
      kind: "request-teacher-confirmation";
      stage: "confirmation";
      subject: "sound-card" | "audio-source" | "sound-selection";
      reason: string;
      confidence: number | null;
    }
  | {
      kind: "request-polish-choice";
      stage: "polish-decision";
      reason: string;
    }
  | {
      kind: "continue-base-only";
      stage: "archive";
      reason: string;
    }
  | {
      kind: "complete";
      stage: "complete";
      reason: string;
    }
  | {
      kind: "blocked";
      stage: "blocked";
      reason: string;
    };

export function createInitialSoundCreationAgentState(input: {
  runId: string;
  projectId: string;
}): SoundCreationAgentState {
  return {
    version: SOUND_CREATION_AGENT_VERSION,
    runId: input.runId,
    stage: "intake",
    goal: {
      kind: "create-sound-composition",
      audience: "primary-lower-grades",
      deviceMode: "shared-teacher-device",
      preserveChildDecisions: true,
      baseWorkIndependentFromAi: true,
    },
    refs: { projectId: input.projectId, currentCardId: null, compositionId: null },
    recognition: { status: "not-started", confidence: null, requiredFieldsComplete: false, teacherConfirmed: false },
    audioSource: { status: "unresolved" },
    soundUnit: { status: "pending" },
    composition: {
      selectedSoundCount: 0,
      inspectionStatus: "not-started",
      arrangementStatus: "not-started",
      polishChoice: "unknown",
      polishGenerationStatus: "not-started",
      polishValidationStatus: "not-started",
      archiveStatus: "not-started",
    },
    lastFailure: null,
    trace: [],
  };
}
