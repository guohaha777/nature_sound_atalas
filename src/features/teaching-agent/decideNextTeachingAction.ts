import {
  DEFAULT_RECOGNITION_CONFIDENCE_THRESHOLD,
  type SoundCreationAgentState,
  type TeachingAgentAction,
} from "./types";

export function decideNextTeachingAction(
  state: SoundCreationAgentState,
  confidenceThreshold = DEFAULT_RECOGNITION_CONFIDENCE_THRESHOLD,
): TeachingAgentAction {
  if (state.composition.archiveStatus === "ready") {
    return { kind: "complete", stage: "complete", reason: "作品、来源和执行记录均已归档。" };
  }

  if (state.lastFailure) {
    if (state.lastFailure.tool === "read_sound_card" && state.lastFailure.recoverable) {
      return {
        kind: "request-teacher-confirmation",
        stage: "confirmation",
        subject: "sound-card",
        reason: "声音卡识别没有得到可靠结果，需要老师确认后继续。",
        confidence: state.recognition.confidence,
      };
    }
    if ((state.lastFailure.tool === "generate_polish" || state.lastFailure.tool === "validate_polish") && state.lastFailure.recoverable) {
      return state.composition.polishChoice === "unknown"
        ? {
            kind: "request-polish-choice",
            stage: "polish-decision",
            reason: "音乐模型未成功；请老师和儿童选择重试、使用智能音符方案或只听儿童声音。",
          }
        : {
            kind: "continue-base-only",
            stage: "archive",
            reason: "已选择的背景方案仍未成功，保留儿童原声和基础作品继续完成。",
          };
    }
    return { kind: "blocked", stage: "blocked", reason: state.lastFailure.safeMessage };
  }

  if (state.recognition.status === "not-started") {
    return { kind: "call-tool", stage: "recognition", tool: "read_sound_card", reason: "需要先读取声音卡的来源与六字段。" };
  }

  const recognitionNeedsConfirmation = state.recognition.status === "failed"
    || state.recognition.confidence === null
    || state.recognition.confidence < confidenceThreshold
    || !state.recognition.requiredFieldsComplete;
  if (recognitionNeedsConfirmation && !state.recognition.teacherConfirmed) {
    return {
      kind: "request-teacher-confirmation",
      stage: "confirmation",
      subject: "sound-card",
      reason: "识别置信度不足或字段不完整，不能替儿童作出决定。",
      confidence: state.recognition.confidence,
    };
  }

  if (state.audioSource.status === "missing") {
    return {
      kind: "request-teacher-confirmation",
      stage: "confirmation",
      subject: "audio-source",
      reason: "没有找到对应原声，需要老师选择系统声音、历史声音或重新录制。",
      confidence: null,
    };
  }

  if (state.audioSource.status === "unresolved") {
    return { kind: "call-tool", stage: "sound-rendering", tool: "resolve_audio_source", reason: "需要为已确认声音卡绑定可追溯的不可变原声。" };
  }

  if (state.soundUnit.status === "pending") {
    return { kind: "call-tool", stage: "sound-rendering", tool: "render_sound_unit", reason: "按儿童确认的六字段生成非破坏性声音单元。" };
  }

  if (state.composition.selectedSoundCount < 1) {
    return {
      kind: "request-teacher-confirmation",
      stage: "confirmation",
      subject: "sound-selection",
      reason: "当前作品还没有选入声音，需要老师根据儿童决定确认素材。",
      confidence: null,
    };
  }

  if (state.composition.inspectionStatus === "not-started") {
    return { kind: "call-tool", stage: "composition-inspection", tool: "inspect_composition", reason: "需要检查当前声音角色、音域、密度和潜在冲突。" };
  }

  if (state.composition.inspectionStatus === "failed") {
    return { kind: "blocked", stage: "blocked", reason: "基础作品上下文无法验证，不能继续生成。" };
  }

  if (state.composition.arrangementStatus === "not-started") {
    return { kind: "call-tool", stage: "arrangement", tool: "arrange_composition", reason: "上下文已确认，可以调用确定性编排生成基础作品。" };
  }

  if (state.composition.arrangementStatus === "failed") {
    return { kind: "blocked", stage: "blocked", reason: "确定性基础作品没有生成成功，AI不能替代这一层。" };
  }

  if (state.composition.polishChoice === "declined" || state.composition.polishGenerationStatus === "skipped") {
    return { kind: "call-tool", stage: "archive", tool: "archive_composition", reason: "不添加AI背景，归档完整基础作品。" };
  }

  if (state.composition.polishGenerationStatus === "not-started") {
    return { kind: "call-tool", stage: "polish-generation", tool: "generate_polish", reason: "基础作品已经成立，先自动尝试音乐模型；成功则继续，失败再请求人工选择。" };
  }

  if (state.composition.polishGenerationStatus === "failed") {
    return state.composition.polishChoice === "accepted"
      ? { kind: "continue-base-only", stage: "archive", reason: "已选择的背景方案仍未成功，保留儿童原声和基础作品继续完成。" }
      : { kind: "request-polish-choice", stage: "polish-decision", reason: "音乐模型没有成功，需要选择重试、智能音符方案或只听儿童声音。" };
  }

  if (state.composition.polishValidationStatus === "not-started") {
    return { kind: "call-tool", stage: "polish-validation", tool: "validate_polish", reason: "生成结果必须先验证，不能直接覆盖或压住儿童原声。" };
  }

  if (state.composition.polishValidationStatus === "failed") {
    return { kind: "continue-base-only", stage: "archive", reason: "背景没有通过安全校验，拒绝该背景并保留基础作品。" };
  }

  return { kind: "call-tool", stage: "archive", tool: "archive_composition", reason: "基础作品和可选背景均已完成，可以归档。" };
}
