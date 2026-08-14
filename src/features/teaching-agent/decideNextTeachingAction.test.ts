import { describe, expect, it } from "vitest";
import { decideNextTeachingAction } from "./decideNextTeachingAction";
import { createInitialSoundCreationAgentState, type SoundCreationAgentState } from "./types";

function readyForComposition(): SoundCreationAgentState {
  const state = createInitialSoundCreationAgentState({ runId: "run-test", projectId: "project-test" });
  return {
    ...state,
    recognition: { status: "ready", confidence: 0.94, requiredFieldsComplete: true, teacherConfirmed: false },
    audioSource: { status: "resolved" },
    soundUnit: { status: "ready" },
    composition: { ...state.composition, selectedSoundCount: 3 },
  };
}

describe("decideNextTeachingAction", () => {
  it("starts by reading the sound card", () => {
    const state = createInitialSoundCreationAgentState({ runId: "run-1", projectId: "project-1" });
    expect(decideNextTeachingAction(state)).toMatchObject({ kind: "call-tool", tool: "read_sound_card" });
  });

  it("pauses for the teacher when recognition confidence is low", () => {
    const state = createInitialSoundCreationAgentState({ runId: "run-2", projectId: "project-2" });
    state.recognition = { status: "ready", confidence: 0.41, requiredFieldsComplete: true, teacherConfirmed: false };
    expect(decideNextTeachingAction(state)).toEqual(expect.objectContaining({
      kind: "request-teacher-confirmation",
      subject: "sound-card",
      confidence: 0.41,
    }));
  });

  it("uses composition context before arranging the base work", () => {
    const state = readyForComposition();
    expect(decideNextTeachingAction(state)).toMatchObject({ kind: "call-tool", tool: "inspect_composition" });
    state.composition.inspectionStatus = "ready";
    expect(decideNextTeachingAction(state)).toMatchObject({ kind: "call-tool", tool: "arrange_composition" });
  });

  it("automatically tries the music model after the base work is ready", () => {
    const state = readyForComposition();
    state.composition.inspectionStatus = "ready";
    state.composition.arrangementStatus = "ready";
    expect(decideNextTeachingAction(state)).toMatchObject({ kind: "call-tool", tool: "generate_polish" });
  });

  it("offers retry, Plan B, or child sounds when the music model fails", () => {
    const state = readyForComposition();
    state.composition.inspectionStatus = "ready";
    state.composition.arrangementStatus = "ready";
    state.composition.polishChoice = "unknown";
    state.composition.polishGenerationStatus = "failed";
    state.lastFailure = {
      tool: "generate_polish",
      code: "provider-unavailable",
      recoverable: true,
      safeMessage: "背景生成服务暂不可用。",
    };
    expect(decideNextTeachingAction(state)).toMatchObject({ kind: "request-polish-choice", stage: "polish-decision" });
  });

  it("archives directly when the teacher declines AI polish", () => {
    const state = readyForComposition();
    state.composition.inspectionStatus = "ready";
    state.composition.arrangementStatus = "ready";
    state.composition.polishChoice = "declined";
    expect(decideNextTeachingAction(state)).toMatchObject({ kind: "call-tool", tool: "archive_composition" });
  });

  it("archives after a generated background passes validation", () => {
    const state = readyForComposition();
    state.composition.inspectionStatus = "ready";
    state.composition.arrangementStatus = "ready";
    state.composition.polishChoice = "accepted";
    state.composition.polishGenerationStatus = "ready";
    state.composition.polishValidationStatus = "ready";
    expect(decideNextTeachingAction(state)).toMatchObject({ kind: "call-tool", tool: "archive_composition" });
  });
});
