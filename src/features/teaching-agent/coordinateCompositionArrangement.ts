import type { Composition } from "@/src/domain/composition";
import { attachCompositionContext } from "@/src/domain/composition";
import type { ConfirmedSoundCard, SoundUnit } from "@/src/domain/sound-card";
import { selectWorldSoundUnits } from "@/src/features/sound-world";

/**
 * 根据当前创作状态选择下一步：没有编排时运行规则编排；已有儿童摆放时保留它，
 * 只为新增声音补初始位置。这里不调用联网 AI。
 */
export function coordinateCompositionArrangement(input: {
  composition: Composition | null;
  cards: ConfirmedSoundCard[];
  units: SoundUnit[];
  requestedIds: string[];
}): { composition: Composition; units: SoundUnit[] } {
  const before = new Set(input.composition?.soundUnitIds ?? []);
  const hasNewSound = input.requestedIds.some((id) => !before.has(id));
  const decision = !input.composition
    ? "run-deterministic-arranger" as const
    : hasNewSound
      ? "preserve-and-extend" as const
      : "preserve-child-arrangement" as const;
  const result = selectWorldSoundUnits(input.composition, input.cards, input.units, input.requestedIds);
  return {
    units: result.units,
    composition: attachCompositionContext(result.composition, result.units, decision),
  };
}
