/**
 * 混音策略：儿童声音永远是主线，背景是可以关掉的辅助层。
 *
 * 所有响度数字集中在这里，且都是纯函数，便于按听感调整与回归测试。
 * 术语：dB 是相对值，0 表示不改变，负数表示调低。
 */
export const MIX_POLICY_VERSION = "mix-policy-v1";

/** 只有一个声音同时发声时，儿童总线的基准电平。 */
export const CHILD_BUS_BASE_DB = -3;
/** 多个原声叠加时的最低电平，避免过度衰减到听不见。 */
export const CHILD_BUS_FLOOR_DB = -12;
/**
 * 背景总线相对儿童总线的落差：两者一起升降，背景永远在下面。
 * 这是"背景够不够听得见"的**唯一总开关**——嫌轻就把它调小（例如 -4），嫌吵就调大。
 * 下面的声部 trim 是声部之间的平衡，不再承担压低整层的作用。
 *
 * 取值依据：-3 时旋律只比孩子的原声低约 7 dB，已经在抢主角；
 * -9 时配合修好的铺底包络又偏轻。-6 让旋律低约 10 dB、铺底低约 13 dB，
 * 是"听得清楚但不越位"的位置。最终仍以手机外放试听为准。
 */
export const BACKGROUND_OFFSET_DB = -6;
/**
 * 背景比孩子多留的尾巴秒数：作品不以原声戛然而止，而是由背景收尾。
 *
 * 做法是给送进音乐模型的混音尾部补这么多静音——那一段里没有孩子的声音，
 * 模型只会生成背景，天然形成一条可以收尾的尾巴。
 * 短作品少留、长作品多留，但不超过 4 秒，否则听上去像多出一段无关的音乐。
 */
export const MAX_BACKGROUND_TAIL_SECONDS = 4;
/** 背景闪避的深浅范围：轻声少让，响声多让。 */
export const MIN_DUCK_DB = 2;
export const MAX_DUCK_DB = 6;
/** 闪避要快下慢上：压得太慢会糊住原声开头，抬得太快会突兀。 */
export const DUCK_ATTACK_SECONDS = 0.06;
export const DUCK_RELEASE_SECONDS = 0.32;
/** 原声力度的取值范围，用于把响度映射成闪避深度。 */
const QUIETEST_EVENT_DB = -10;
const LOUDEST_EVENT_DB = -1;

/**
 * 同时发声的原声越多，儿童总线越要留出余量，否则叠加后会一直撞限幅器。
 * 按整首作品的最大重叠数一次算好，不随播放实时浮动，避免听感上的抽吸。
 */
export function childBusGainDb(maxSimultaneousSounds: number): number {
  const count = Math.max(1, Math.floor(maxSimultaneousSounds));
  const headroom = 3 * Math.log2(count);
  return round(Math.max(CHILD_BUS_FLOOR_DB, CHILD_BUS_BASE_DB - headroom));
}

/** 能量档位对背景电平的微调幅度：只做 ±2 dB 的倾斜，不决定整层响度。 */
const ENERGY_REFERENCE_GAIN_DB = -15;
const MAX_ENERGY_NUDGE_DB = 2;

/**
 * 背景电平 = 儿童总线 + 固定落差 + 能量档位的小幅倾斜。
 * 这一层自带的建议电平只用来"偏亮一点／偏静一点"，不再当作上限——
 * 之前用 min() 当上限时，背景只可能更轻、永远不可能更响，是垫音听不见的原因之一。
 */
export function backgroundBusGainDb(layerDefaultGainDb: number, maxSimultaneousSounds: number): number {
  const nudge = clampRange(layerDefaultGainDb - ENERGY_REFERENCE_GAIN_DB, -MAX_ENERGY_NUDGE_DB, MAX_ENERGY_NUDGE_DB);
  return round(childBusGainDb(maxSimultaneousSounds) + BACKGROUND_OFFSET_DB + nudge);
}

/**
 * 背景是否确实低于儿童总线。
 *
 * 以前这里写死判断 defaultGainDb <= -16；改了总开关之后那个数字不再成立，
 * 界面上就会显示一个假的"已限幅"。直接比较两条总线，策略怎么调结论都跟着对。
 */
export function isBackgroundGainLimited(layerDefaultGainDb: number, maxSimultaneousSounds: number): boolean {
  return backgroundBusGainDb(layerDefaultGainDb, maxSimultaneousSounds) < childBusGainDb(maxSimultaneousSounds);
}

/**
 * 背景比孩子多留多久。短作品少留、长作品多留，上限见 MAX_BACKGROUND_TAIL_SECONDS。
 * 20 秒作品约 2 秒，45 秒作品约 4 秒。
 */
export function backgroundTailSeconds(durationSeconds: number): number {
  return round(Math.min(MAX_BACKGROUND_TAIL_SECONDS, Math.max(2, durationSeconds * 0.09)));
}

function clampRange(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * 闪避深度随当前正在响的原声强弱变化：
 * 孩子轻声说话时背景只让一点，孩子大声时背景让得更多，保证来源始终可辨认。
 */
export function duckDepthDb(activeEventGainDb: number[]): number {
  if (activeEventGainDb.length === 0) return 0;
  const loudest = Math.max(...activeEventGainDb);
  const ratio = (loudest - QUIETEST_EVENT_DB) / (LOUDEST_EVENT_DB - QUIETEST_EVENT_DB);
  const depth = MIN_DUCK_DB + clamp01(ratio) * (MAX_DUCK_DB - MIN_DUCK_DB);
  // 同时有多个原声时再多让一点，但不超过上限。
  const crowded = activeEventGainDb.length > 1 ? 1 : 0;
  return round(Math.min(MAX_DUCK_DB, depth + crowded));
}

/**
 * 结尾淡出：短作品收得快，长作品收得从容。
 * 系数按 20／30／45 秒三档调过，落在 0.7–1.6 秒之间；耳机试听后可再微调。
 */
export function endingFadeSeconds(durationSeconds: number): number {
  return round(Math.min(1.8, Math.max(0.6, durationSeconds * 0.036)));
}

/**
 * 声部之间的平衡，**围绕 0 分布**：有正有负，整层的响度由 BACKGROUND_OFFSET_DB 决定。
 * 和弦声部一次响好几个音，天然比单音声部响，所以往下；短促的回应往上，才不会被铺底盖住。
 */
const VOICE_TRIM_DB: Record<PlanVoice, number> = {
  pad: -2,
  bass: 0,
  pulse: 0,
  mallet: 1,
  pluck: 1,
};
/** 每多叠一个音往下压一点；以三音和弦为基准，常见写法不会被平白压低。 */
const POLYPHONY_TRIM_DB = 1.5;
const POLYPHONY_REFERENCE_NOTES = 3;

export type PlanVoice = "pad" | "pulse" | "mallet" | "pluck" | "bass";

export function voiceTrimDb(voice: PlanVoice, noteCount = POLYPHONY_REFERENCE_NOTES): number {
  const extraNotes = Math.max(0, Math.floor(noteCount) - POLYPHONY_REFERENCE_NOTES);
  return round(VOICE_TRIM_DB[voice] - extraNotes * POLYPHONY_TRIM_DB);
}

/**
 * 声像：孩子的原声永远居中，背景声部左右稍微散开。
 * 这样即使音区接近，耳朵也能把两者分开——比单纯压低背景更能保住原声的辨认度。
 */
const VOICE_PAN: Record<PlanVoice, number> = {
  pad: -0.22,
  bass: 0,
  pulse: 0.16,
  mallet: 0.3,
  pluck: -0.3,
};

export function voicePan(voice: PlanVoice): number {
  return VOICE_PAN[voice];
}

/** 叠音越多，单个音的力度要相应收一点，让和弦与单音听上去一样重。 */
export function polyphonyVelocity(velocity: number, noteCount: number): number {
  const scale = Math.pow(10, (voiceTrimDb("mallet", noteCount) - voiceTrimDb("mallet", POLYPHONY_REFERENCE_NOTES)) / 20);
  return round(Math.max(0.02, Math.min(1, velocity * scale)));
}

/** 整首作品里同时发声的原声最多有几个。 */
export function maxSimultaneousSounds(intervals: Array<{ start: number; end: number }>): number {
  const edges = intervals.flatMap((interval) => [
    { time: interval.start, delta: 1 },
    { time: interval.end, delta: -1 },
  ]).sort((a, b) => a.time - b.time || a.delta - b.delta);
  let current = 0;
  let peak = 0;
  edges.forEach((edge) => {
    current += edge.delta;
    peak = Math.max(peak, current);
  });
  return Math.max(1, peak);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function round(value: number) {
  return Number(value.toFixed(2));
}

/** 背景的音色底色在音频层的落点。0–1 的抽象参数在这里换算成真实的滤波、混响与包络。 */
export interface BackgroundToneSettings {
  cutoffHz: number;
  reverbWet: number;
  reverbDecaySeconds: number;
  padAttackSeconds: number;
  shortAttackSeconds: number;
  /**
   * 铺底长音进入保持段后的电平比例。
   * 这个值决定"垫在下面的东西听不听得见"：0.35 时长音只剩峰值的三分之一，
   * 再经过背景总线就沉到 −43 dBFS，听感上背景只剩下几个短促的旋律音。
   */
  padSustainLevel: number;
}

/** 亮度对应的滤波范围：最暗只剩温和的中低频，最亮接近不滤波。 */
const DARKEST_CUTOFF_HZ = 900;
const BRIGHTEST_CUTOFF_HZ = 9000;
/** 空间量上限刻意保守：混响多了会糊住留白，也会让孩子的原声更难辨认。 */
const MAX_REVERB_WET = 0.26;

export function backgroundToneSettings(voicing?: {
  brightness: number;
  space: number;
  attackShape: "soft" | "natural" | "sharp";
}): BackgroundToneSettings {
  const brightness = voicing ? clamp01(voicing.brightness) : 0.5;
  const space = voicing ? clamp01(voicing.space) : 0.25;
  const attack = voicing?.attackShape ?? "natural";
  return {
    // 听感上亮度是对数的，所以在频率上按指数插值。
    cutoffHz: Math.round(DARKEST_CUTOFF_HZ * Math.pow(BRIGHTEST_CUTOFF_HZ / DARKEST_CUTOFF_HZ, brightness)),
    reverbWet: round(space * MAX_REVERB_WET),
    reverbDecaySeconds: round(0.9 + space * 1.6),
    // 起音刻意收短：和弦块只有几秒，起音太慢的话大半时间还在爬升。
    padAttackSeconds: round(attack === "soft" ? 1.1 : attack === "sharp" ? 0.35 : 0.7),
    shortAttackSeconds: round(attack === "sharp" ? 0.004 : attack === "soft" ? 0.02 : 0.008),
    padSustainLevel: 0.82,
  };
}

/** 背景音符移调后仍要落在合成器好听的音域内。 */
export function clampMidi(midi: number): number {
  return Math.max(28, Math.min(88, Math.round(midi)));
}

/**
 * 估算电平，用来在改动编排后守住"背景听得见"这条线。
 *
 * 合成器的 velocity 近似就是振幅，所以 20·log10(velocity) 就是它的峰值 dBFS；
 * 再叠上声部平衡与背景总线，即可与儿童总线比较。这不是精确测量，
 * 但足以在写编排时发现"音量对不上"——这次背景整层听不见，就是因为
 * 编排变稀疏后仍沿用为密集地毯调好的力度。
 */
export function estimateBackgroundPeakDb(input: {
  velocity: number;
  voice: PlanVoice;
  noteCount?: number;
  layerDefaultGainDb: number;
  maxSimultaneousSounds: number;
}): number {
  const velocityDb = 20 * Math.log10(Math.max(0.001, input.velocity));
  return round(
    velocityDb
    + voiceTrimDb(input.voice, input.noteCount ?? POLYPHONY_REFERENCE_NOTES)
    + backgroundBusGainDb(input.layerDefaultGainDb, input.maxSimultaneousSounds),
  );
}

/** 孩子原声的峰值估算：素材本身按满刻度计，再叠事件增益与儿童总线。 */
export function estimateChildPeakDb(eventGainDb: number, maxSimultaneousSounds: number): number {
  return round(eventGainDb + childBusGainDb(maxSimultaneousSounds));
}

/**
 * 背景相对原声的可听窗口。
 * 低于下限会被原声完全盖住；高于上限就开始抢主角。
 */
export const AUDIBLE_BACKGROUND_GAP_DB = { min: 10, max: 26 } as const;

