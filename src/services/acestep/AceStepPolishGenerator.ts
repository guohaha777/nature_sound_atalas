import { fitBackgroundAudio } from "@/src/audio/editing/fitBackgroundAudio";
import { renderChildrenMix } from "@/src/audio/editing/renderChildrenMix";
import { isBackgroundGainLimited, maxOverlappingEvents } from "@/src/audio/mixing";
import type { PlaybackPlan } from "@/src/audio/ports/CompositionPlayer";
import type { AIPolishLayer, Composition } from "@/src/domain/composition";
import type { ConfirmedSoundCard, SoundUnit } from "@/src/domain/sound-card";
import {
  buildDeterministicSymbolicPlan, buildMusicPolishBrief,
  deriveBackgroundVoicing, deriveMusicPolishDirection,
} from "@/src/features/music-polish";
import type { PolishGenerationPort } from "@/src/features/ports";
import { buildLegoCaptions } from "./buildLegoCaptions";

/**
 * 用本机 ACE-Step 的 lego 任务生成背景层。
 *
 * 与之前所有做法的根本区别：模型这次**听得到**孩子编排好的原声。
 * 先把编排离线渲染成一段混音，连同两段提示词一起送给模型：
 *   - src_audio     决定背景跟得上什么（调性、律动、留白位置）
 *   - global_caption 全曲语境
 *   - prompt         这一条轨道的约束（纯器乐、无人声、不抢戏）
 * 所以改编排，背景就会跟着变，而不是从固定素材里挑一条。
 */
export class AceStepPolishGenerator implements PolishGenerationPort {
  /** 需要拿到音频资产才能渲染编排，所以比其它实现多依赖一个播放计划。 */
  constructor(private readonly resolvePlan: (composition: Composition) => PlaybackPlan) {}

  async generate(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[]): Promise<AIPolishLayer> {
    const brief = buildMusicPolishBrief(composition, cards, units);
    const direction = deriveMusicPolishDirection(brief);
    const mix = await renderChildrenMix(this.resolvePlan(composition));
    const captions = buildLegoCaptions(brief, direction);

    const form = new FormData();
    form.append("audio", new File([mix.blob], "arrangement.wav", { type: mix.mimeType }));
    form.append("prompt", captions.local);
    form.append("globalCaption", captions.global);
    form.append("seed", String(hashSeed(composition.seed)));

    const response = await fetch("/api/music/lego", { method: "POST", body: form });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(payload?.message ?? "本地音乐模型生成失败。");
    }

    // lego 的输出长度锁定到输入，所以这里本来就等于"作品时长 + 尾巴"。
    // 仍然走一次裁剪：既补上淡入淡出，也挡住长度对不上的意外。
    const fitted = await fitBackgroundAudio(await response.blob(), {
      targetDurationSeconds: mix.durationSeconds,
    });

    const defaultGainDb = -15;
    return {
      id: `ace-step-${composition.revision}-${hashSeed(composition.seed)}`,
      compositionRevision: composition.revision,
      sourceKind: "live_ai",
      provider: response.headers.get("X-Polish-Provider") ?? "ace-step-local",
      model: response.headers.get("X-Polish-Model") ?? "acestep-v15-base",
      promptVersion: captions.version,
      defaultGainDb,
      basedOnInputHash: stableHash(JSON.stringify(brief)),
      direction,
      voicing: deriveBackgroundVoicing(brief),
      audioUrl: URL.createObjectURL(fitted.blob),
      audioAssetId: `ace-step-${composition.revision}`,
      validation: {
        version: "background-validation-v1",
        status: "basic-guarded",
        format: "mp3",
        trustedSource: true,
        instrumentalModeRequested: true,
        generatedDurationSeconds: fitted.sourceDurationSeconds,
        playbackDurationSeconds: fitted.durationSeconds,
        gainLimited: isBackgroundGainLimited(defaultGainDb, maxOverlappingEvents(composition)),
        voiceRiskCheck: "provider-request-only",
      },
    };
  }

  /** 模型不可用时的最后一层：纯本地推导，不联网、不依赖模型服务。 */
  fallback(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[]): AIPolishLayer {
    const brief = buildMusicPolishBrief(composition, cards, units);
    const direction = deriveMusicPolishDirection(brief);
    const defaultGainDb = direction.energyBand === "driving" ? -13 : direction.energyBand === "balanced" ? -15 : -17;
    return {
      id: `local-score-${composition.revision}`,
      compositionRevision: composition.revision,
      sourceKind: "local_fallback",
      provider: "wanwu-deterministic-score",
      model: null,
      promptVersion: "symbolic-music-plan-v1",
      fallbackReason: "not-connected",
      defaultGainDb,
      basedOnInputHash: `fallback:${stableHash(JSON.stringify(brief))}`,
      direction,
      voicing: deriveBackgroundVoicing(brief),
      symbolicPlan: buildDeterministicSymbolicPlan(brief),
      validation: {
        version: "background-validation-v1",
        status: "local-verified",
        format: "local-synthesis",
        trustedSource: true,
        instrumentalModeRequested: true,
        generatedDurationSeconds: null,
        playbackDurationSeconds: composition.durationSeconds,
        gainLimited: isBackgroundGainLimited(defaultGainDb, maxOverlappingEvents(composition)),
        voiceRiskCheck: "not-applicable",
      },
    };
  }
}

function stableHash(value: string) {
  return `fnv1a-${hashSeed(value).toString(16).padStart(8, "0")}`;
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}
