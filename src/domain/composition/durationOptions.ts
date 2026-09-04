/**
 * 作品目标时长档位：全项目唯一来源。
 * 想调整档位（增删或改秒数）只改这个数组，推荐规则、界面按钮、校验上限和默认值都会跟着走。
 */
export const COMPOSITION_DURATION_OPTIONS = [20, 30, 45] as const;

export type CompositionDurationSeconds = (typeof COMPOSITION_DURATION_OPTIONS)[number];

export const SHORTEST_COMPOSITION_SECONDS: CompositionDurationSeconds = COMPOSITION_DURATION_OPTIONS[0];
export const LONGEST_COMPOSITION_SECONDS: CompositionDurationSeconds = COMPOSITION_DURATION_OPTIONS[COMPOSITION_DURATION_OPTIONS.length - 1];
/** 没有推荐结果时使用的中间档位。 */
export const DEFAULT_COMPOSITION_DURATION_SECONDS: CompositionDurationSeconds = COMPOSITION_DURATION_OPTIONS[Math.floor(COMPOSITION_DURATION_OPTIONS.length / 2)];
/**
 * 早期版本使用过 15／24／30 秒。归档作品仍要能读出来，
 * 所以只有“新生成的值”受当前档位约束，存储层的校验保持向下兼容。
 */
export const LEGACY_MIN_COMPOSITION_SECONDS = 15;

export function isCompositionDurationSeconds(value: number): value is CompositionDurationSeconds {
  return (COMPOSITION_DURATION_OPTIONS as readonly number[]).includes(value);
}

/** 能完整放下这段声音的最短档位；没有档位放得下时返回 null。 */
export function smallestDurationOptionFor(seconds: number): CompositionDurationSeconds | null {
  return COMPOSITION_DURATION_OPTIONS.find((option) => option + 0.001 >= seconds) ?? null;
}

/** 读取旧档案时把历史档位（如 24 秒）映射到最接近的当前档位。 */
export function nearestDurationOption(seconds: number): CompositionDurationSeconds {
  return COMPOSITION_DURATION_OPTIONS.reduce((closest, option) => (
    Math.abs(option - seconds) < Math.abs(closest - seconds) ? option : closest
  ), DEFAULT_COMPOSITION_DURATION_SECONDS);
}
