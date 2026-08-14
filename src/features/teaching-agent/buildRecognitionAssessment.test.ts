import { describe, expect, it } from "vitest";
import type { ConfirmedSoundCard } from "@/src/domain/sound-card";
import { buildRecognitionAssessment } from "./buildRecognitionAssessment";

const baseCard: ConfirmedSoundCard = {
  id: "card-1",
  projectId: "project-1",
  paperCardId: "paper-1",
  entryIndex: 0,
  source: { label: "风", normalizedKey: "wind", decisionSource: "human_confirmed" },
  pitch: "high",
  duration: "long",
  contour: "wavy",
  intensity: "soft",
  pattern: "once",
  templateVersion: "sound-card-v1",
  confirmedAt: "paper-draft",
};

describe("buildRecognitionAssessment", () => {
  it("does not invent a percentage for the local template reader", () => {
    const result = buildRecognitionAssessment({
      ...baseCard,
      recognition: {
        method: "local_template",
        provider: "paper-sound-card-v1",
        model: null,
        confidence: "high",
        score: null,
        reason: "固定区域圈选清楚。",
        teacherConfirmed: false,
        confirmedAt: null,
      },
    });
    expect(result).toMatchObject({ confidenceLabel: "读取较清楚", scoreLabel: null, needsTeacherReview: false });
  });

  it("marks an uncertain result for review without adding a separate confirmation step", () => {
    const result = buildRecognitionAssessment({
      ...baseCard,
      recognition: {
        method: "local_template",
        provider: "paper-sound-card-v1",
        model: null,
        confidence: "review",
        score: null,
        reason: "部分圈选接近，需要逐项核对。",
        teacherConfirmed: false,
        confirmedAt: null,
      },
    });
    expect(result).toMatchObject({ needsTeacherReview: true, teacherConfirmed: false });
  });

  it("shows a real score returned by a remote recognition provider", () => {
    const result = buildRecognitionAssessment({
      ...baseCard,
      recognition: {
        method: "remote_ai",
        provider: "configured-provider",
        model: "configured-model",
        confidence: "review",
        score: 0.61,
        reason: "来源文字模糊。",
        teacherConfirmed: true,
        confirmedAt: "2026-08-14T00:00:00.000Z",
      },
    });
    expect(result).toMatchObject({ methodLabel: "AI 识别 · configured-provider", scoreLabel: "61%", teacherConfirmed: true });
  });
});
