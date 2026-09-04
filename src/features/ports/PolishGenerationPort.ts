import type { AIPolishLayer, Composition } from "@/src/domain/composition";
import type { ConfirmedSoundCard, SoundUnit } from "@/src/domain/sound-card";

/**
 * attempt 是"这是第几次尝试"。
 * 编曲的种子必须固定（同一输入可复现是产品承诺），但背景不同：
 * "重新生成"的语义就是再试一个。所以随机源从这里进来，不动 composition.seed。
 */
export interface PolishGenerationPort {
  generate(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[], attempt?: number): Promise<AIPolishLayer>;
  fallback(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[], attempt?: number): AIPolishLayer | Promise<AIPolishLayer>;
}
