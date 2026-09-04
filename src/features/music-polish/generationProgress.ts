/**
 * 背景生成的等待提示。模型不会回报真实进度，这里用"已等待时间"推出一个
 * 只增不减、永远不会自己走到 100% 的进度，配合分阶段文案说明系统正在做什么。
 */
export interface GenerationProgress {
  /** 0–95：留出最后一段，等真正拿到结果再补满。 */
  percent: number;
  message: string;
  /** 等得比预期久时补一句解释，避免老师以为卡住了。 */
  hint: string | null;
}

export const GENERATION_STAGE_MESSAGES = [
  "正在把孩子的声音铺成一张地图…",
  "数一数高音几个、低音几个…",
  "给每段留白挑一个不抢戏的和弦…",
  "试了一版，太吵了，重新调轻一点…",
  "把结尾收住，别让曲子突然断掉…",
  "最后检查一遍：绝不能盖过孩子的声音…",
] as const;

const MAX_AUTOMATIC_PERCENT = 95;
const LONG_WAIT_RATIO = 1.15;

export function readGenerationProgress(elapsedMs: number, expectedSeconds: number): GenerationProgress {
  const expectedMs = Math.max(1_000, expectedSeconds * 1000);
  const elapsed = Math.max(0, elapsedMs);
  const ratio = elapsed / expectedMs;
  // 指数逼近：开头走得快，越接近预期时间越慢，永远到不了 100%。
  const percent = Math.min(MAX_AUTOMATIC_PERCENT, Math.round(MAX_AUTOMATIC_PERCENT * (1 - Math.exp(-1.9 * ratio))));
  const stageIndex = Math.min(GENERATION_STAGE_MESSAGES.length - 1, Math.floor(ratio * GENERATION_STAGE_MESSAGES.length));
  return {
    percent,
    message: GENERATION_STAGE_MESSAGES[stageIndex],
    hint: ratio > LONG_WAIT_RATIO ? "这首曲子长一些，音符也更多，再等一小会儿就好。" : null,
  };
}

/** 作品越长，模型要写的音符越多；用它给出这次大概要等多久。 */
export function expectedGenerationSeconds(compositionDurationSeconds: number): number {
  return Math.round(12 + compositionDurationSeconds * 0.42);
}
