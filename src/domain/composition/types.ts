import type { CompositionDurationSeconds } from "./durationOptions";

export interface CompositionEvent {
  id: string;
  soundUnitId: string;
  audioAssetId: string;
  sourceKey: string;
  startBeat: number;
  durationBeats: number;
  gainDb: number;
  semitoneShift: number;
  /** 非破坏性试听参数；缺省值兼容已有作品事件。 */
  filterMotion?: "up" | "down" | "none" | "lfo";
  contourSemitoneDelta?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  loop?: boolean;
  /** 派生片段在原始文件中的起点；原始音频本身不修改。 */
  sourceOffsetSeconds?: number;
  /** 仅限制作品副本的可听长度；缺省时继续播放完整原声。 */
  clipDurationSeconds?: number;
  /** 可编辑胶囊的原声选区契约；旧事件缺省时按完整原声迁移。 */
  sourceClipVersion?: "source-clip-v1";
  sourceClipOrigin?: "full-source" | "user";
  /** 原声时间轴上的选区长度；与编排片段的播放长度分开保存。 */
  sourceSelectionDurationSeconds?: number;
  /** Phase 01 为保证自然声贯穿而补充的事件，可在重新规划时安全替换。 */
  generatedBy?: "natural-sound-continuity-v1" | "deterministic-arranger-v2";
  arrangementRole?: "lead-natural" | "rhythmic-anchor" | "texture" | "response" | "accent";
  section?: "opening" | "development" | "peak" | "ending";
}

export interface CompositionDurationRecommendation {
  version: "duration-recommendation-v1";
  seconds: CompositionDurationSeconds;
  selectedSoundCount: number;
  totalSourceSeconds: number;
  durationSpreadSeconds: number;
  reason: string;
}

export interface NaturalSoundContinuityPlan {
  version: "natural-sound-continuity-v1";
  coverageRatio: number;
  maxSilentGapSeconds: number;
  openingCovered: boolean;
  middleCovered: boolean;
  endingCovered: boolean;
  generatedEventCount: number;
}

/** 当前 MVP 的情绪只作用于整首作品，不用于心理判断。 */
export interface EmotionIntent {
  enabled: boolean;
  valence: number;
  arousal: number;
  label: "bright" | "content" | "tense" | "blue" | null;
  mappingVersion: "emotion-mapping-v1";
}

export interface SymbolicMusicPlan {
  version: "symbolic-music-plan-v1";
  bpm: number;
  durationSeconds: number;
  events: Array<{
    startSeconds: number;
    durationSeconds: number;
    midiNotes: number[];
    voice: "pad" | "pulse" | "mallet" | "pluck" | "bass";
    velocity: number;
  }>;
}

export interface AIPolishLayer {
  id: string;
  compositionRevision: number;
  sourceKind: "live_ai" | "symbolic_ai" | "cached_demo_ai" | "local_fallback";
  provider: string;
  model: string | null;
  promptVersion: string | null;
  defaultGainDb: number;
  basedOnInputHash: string;
  direction?: { energy: number; pulse: number; tension: number; space: number; energyBand: "quiet" | "balanced" | "driving" };
  /** Preview API 返回的临时音频；正式归档前必须转存到自有对象存储。 */
  audioUrl?: string;
  audioAssetId?: string;
  audioExpiresAt?: number;
  symbolicPlan?: SymbolicMusicPlan;
  /** 使用系统内置伴奏时的原因；界面据此说明这次为什么没有用上模型。 */
  fallbackReason?: "not-configured" | "not-connected" | "model-rejected" | "quota-used";
  /** 程序为了让模型方案能播放而做的确定性修补；修补率高说明提示词需要调整。 */
  arrangementRepairs?: string[];
  /**
   * 背景的音色底色，由成曲前的数据推导：亮度、空间、音区、起音、明暗。
   * 随作品归档，保证重放时听到的是同一套音色。
   */
  voicing?: {
    version: "background-voicing-v1";
    brightness: number;
    space: number;
    registerShiftSemitones: number;
    attackShape: "soft" | "natural" | "sharp";
    colorTilt: number;
  };
  /** 对背景层实际完成的基础保护；不能替代音频内容检测。 */
  validation?: {
    version: "background-validation-v1";
    status: "basic-guarded" | "local-verified";
    format: "mp3" | "local-synthesis";
    trustedSource: boolean;
    instrumentalModeRequested: boolean;
    generatedDurationSeconds: number | null;
    playbackDurationSeconds: number;
    gainLimited: boolean;
    /** reviewed-offline：素材入库前由人工试听确认，不是每次运行时自动判定。 */
    voiceRiskCheck: "provider-request-only" | "reviewed-offline" | "not-applicable";
  };
}

export interface CompositionContextAnalysis {
  version: "composition-context-v1";
  selectedSoundCount: number;
  eventCount: number;
  pitchBandCounts: { high: number; mid: number; low: number };
  density: "open" | "balanced" | "busy";
  exactOverlapGroups: number;
  overDenseWindows?: number;
  longestSilentGapSeconds?: number;
  pitchImbalance?: boolean;
  status: "ready" | "review";
  notice: string | null;
  decision: "run-deterministic-arranger" | "preserve-child-arrangement" | "preserve-and-extend";
  reason: string;
}

export interface CompositionTeachingAdvice {
  version: "composition-teaching-advice-v1";
  compositionRevision: number;
  sourceKind: "live_ai" | "local_rules";
  provider: string;
  model: string | null;
  basedOnInputHash: string;
  confidence: number | null;
  roles: Array<{
    soundIndex: number;
    role: "lead" | "response" | "texture" | "pulse";
    reason: string;
  }>;
  backgroundRecommendation: {
    value: "helpful" | "not-needed" | "uncertain";
    reason: string;
  };
  musicDiscovery: {
    concept: "pitch" | "layering" | "density" | "dynamics" | "repetition";
    childText: string;
    tryThis: string;
  };
}

export interface Composition {
  id: string;
  projectId: string;
  /** 作品第一次归档时冻结；旧版数据可在读取时使用项目名回退。 */
  title?: string;
  createdAt?: string;
  soundUnitIds: string[];
  events: CompositionEvent[];
  polishLayer: AIPolishLayer | null;
  polishEnabled: boolean;
  bpm: number;
  durationSeconds: number;
  /** "user" 表示时长是用户显式选定的，自动规则不再为放下长原声而改动它。 */
  durationOrigin?: "auto" | "user";
  durationRecommendation?: CompositionDurationRecommendation;
  naturalSoundContinuity?: NaturalSoundContinuityPlan;
  emotionIntent: EmotionIntent;
  seed: string;
  arrangerVersion: "arranger-v1" | "arranger-v2";
  /** 后台作品检查结果；正常时不增加页面操作，异常时仅给出可忽略的试听建议。 */
  contextAnalysis?: CompositionContextAnalysis;
  /** AI 或本地规则给出的教学建议；只解释作品，不修改编排。 */
  teachingAdvice?: CompositionTeachingAdvice;
  revision: number;
  savedAt?: string;
}
