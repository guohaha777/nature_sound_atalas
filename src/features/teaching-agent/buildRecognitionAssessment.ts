import type { ConfirmedSoundCard } from "@/src/domain/sound-card";

export interface RecognitionAssessment {
  methodLabel: string;
  confidenceLabel: string;
  reason: string;
  needsTeacherReview: boolean;
  teacherConfirmed: boolean;
  scoreLabel: string | null;
}

export function buildRecognitionAssessment(card: ConfirmedSoundCard): RecognitionAssessment {
  const recognition = card.recognition;
  if (!recognition) {
    return {
      methodLabel: "人工选择",
      confidenceLabel: "无需识别",
      reason: "这段声音由老师或孩子直接选择，不使用纸卡识别结果。",
      needsTeacherReview: false,
      teacherConfirmed: true,
      scoreLabel: null,
    };
  }

  return {
    methodLabel: recognition.method === "remote_ai" ? `AI 识别 · ${recognition.provider}` : "本地模板读取",
    confidenceLabel: recognition.confidence === "high" ? "读取较清楚" : "需要老师复核",
    reason: recognition.reason,
    needsTeacherReview: recognition.confidence === "review",
    teacherConfirmed: recognition.teacherConfirmed,
    scoreLabel: recognition.score === null ? null : `${Math.round(recognition.score * 100)}%`,
  };
}
