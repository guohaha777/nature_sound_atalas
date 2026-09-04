export type PitchChoice = "high" | "mid" | "low";
export type DurationChoice = "short" | "medium" | "long";
export type ContourChoice = "rising" | "falling" | "flat" | "wavy";
export type IntensityChoice = "soft" | "medium" | "loud";
export type PatternChoice = "once" | "repeat" | "bursts" | "fade-in";
export type SoundInputMode = "paper_card" | "recording" | "sound_library" | "demo";
export type ArchiveScope = "personal" | "classroom";
export type SoundCardRecognitionMethod = "local_template" | "remote_ai";
export type SoundCardRecognitionConfidence = "high" | "review";

export interface SoundCardRecognition {
  /** 当前本地模板读取不伪造精确分数；只有外部识别服务真实返回时才记录 0—1 分数。 */
  method: SoundCardRecognitionMethod;
  provider: string;
  model: string | null;
  confidence: SoundCardRecognitionConfidence;
  score: number | null;
  reason: string;
  teacherConfirmed: boolean;
  confirmedAt: string | null;
}

export interface SoundProvenance {
  contributorId: string;
  contributorName: string;
  originalCardAssetId: string | null;
  originalAudioAssetId: string;
  recordedAt: string;
  place: string;
  archiveScopes: ArchiveScope[];
}

export interface ConfirmedSoundCard {
  id: string;
  projectId: string;
  paperCardId: string;
  entryIndex: 0 | 1 | 2;
  /** 用户在纸质声卡条目中写下的声音名字；与绑定的原声音源名称分开保存。 */
  displayName?: string;
  source: {
    label: string;
    normalizedKey: string;
    decisionSource: "demo" | "ai_suggested" | "human_confirmed";
  };
  pitch: PitchChoice;
  duration: DurationChoice;
  contour: ContourChoice;
  intensity: IntensityChoice;
  pattern: PatternChoice;
  templateVersion: "sound-card-v1";
  confirmedAt: string;
  /** 未绑定真实原声的纸质声卡草稿必须保持锁定，刷新后也不能把占位素材当成确认结果。 */
  sourceSelectionRequired?: boolean;
  /** 纸卡读取依据与人工复核结果；可选以兼容既有作品快照。 */
  recognition?: SoundCardRecognition;
}

/** 一张纸质声卡最多容纳三个声音条目；每个条目仍独立确认声音配方。 */
export interface PaperSoundCard {
  id: string;
  projectId: string;
  contributorId: string;
  entryIds: string[];
  maxEntries: 3;
  imageAssetId: string | null;
  templateVersion: "paper-sound-card-v1";
  createdAt: string;
}

export interface SoundUnit {
  id: string;
  projectId: string;
  cardId: string;
  originalAudioAssetId: string;
  inputMode: SoundInputMode;
  parameters: Pick<ConfirmedSoundCard, "pitch" | "duration" | "contour" | "intensity" | "pattern">;
  provenance: SoundProvenance;
  contributionLabel: string;
  active: boolean;
  mappingVersion: "music-mapping-v1";
  createdAt: string;
}

export const FIELD_LABELS = {
  pitch: { high: "高", mid: "中", low: "低" },
  duration: { short: "短短的", medium: "刚刚好", long: "长长的" },
  contour: { rising: "往上走", falling: "往下落", flat: "稳稳的", wavy: "有起伏" },
  intensity: { soft: "轻轻的", medium: "刚刚好", loud: "响亮的" },
  pattern: { once: "出现一次", repeat: "重复出现", bursts: "一阵一阵", "fade-in": "慢慢出现" },
} as const;

/** 声音是怎么进来的；界面上不应直接显示 SoundInputMode 的英文枚举值。 */
export const INPUT_MODE_LABELS: Record<SoundInputMode, string> = {
  paper_card: "纸质声卡",
  recording: "现场录音",
  sound_library: "声音库",
  demo: "示例声音",
};
