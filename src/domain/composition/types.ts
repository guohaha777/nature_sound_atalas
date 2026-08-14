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
  loop?: boolean;
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
    voiceRiskCheck: "provider-request-only" | "not-applicable";
  };
}

export interface CompositionContextAnalysis {
  version: "composition-context-v1";
  selectedSoundCount: number;
  eventCount: number;
  pitchBandCounts: { high: number; mid: number; low: number };
  density: "open" | "balanced" | "busy";
  exactOverlapGroups: number;
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
  emotionIntent: EmotionIntent;
  seed: string;
  arrangerVersion: "arranger-v1";
  /** 后台作品检查结果；正常时不增加页面操作，异常时仅给出可忽略的试听建议。 */
  contextAnalysis?: CompositionContextAnalysis;
  /** AI 或本地规则给出的教学建议；只解释作品，不修改编排。 */
  teachingAdvice?: CompositionTeachingAdvice;
  revision: number;
  savedAt?: string;
}
