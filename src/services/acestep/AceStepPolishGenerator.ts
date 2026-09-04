import { fitBackgroundAudio } from "@/src/audio/editing/fitBackgroundAudio";
import { renderChildrenMix } from "@/src/audio/editing/renderChildrenMix";
import { isBackgroundGainLimited, maxOverlappingEvents } from "@/src/audio/mixing";
import type { PlaybackPlan } from "@/src/audio/ports/CompositionPlayer";
import type { AIPolishLayer, Composition } from "@/src/domain/composition";
import type { ConfirmedSoundCard, SoundUnit } from "@/src/domain/sound-card";
import { buildMusicPolishBrief, deriveBackgroundVoicing, deriveMusicPolishDirection } from "@/src/features/music-polish";
import type { PolishGenerationPort } from "@/src/features/ports";
import { requestSymbolicPlanLayer } from "@/src/services/symbolic-plan";
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

  async generate(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[], attempt = 0): Promise<AIPolishLayer> {
    const brief = buildMusicPolishBrief(composition, cards, units);
    const direction = deriveMusicPolishDirection(brief);
    // 离线渲染在页面被切到后台时会被浏览器挂起，永远不 resolve——进度条会一直转，
    // 只能刷新页面才能恢复。加一道超时把死等变成一次普通失败，
    // 后面的失败对话框和降级链路照常，孩子回到这一页重试即可。
    const mix = await withTimeout(
      renderChildrenMix(this.resolvePlan(composition)),
      RENDER_TIMEOUT_MS,
      "编排渲染超时，可能是页面切到了后台。回到这一页重试，或直接使用 Plan B。",
    );
    const captions = buildLegoCaptions(brief, direction);

    const form = new FormData();
    form.append("audio", new File([mix.blob], "arrangement.wav", { type: mix.mimeType }));
    form.append("prompt", captions.local);
    form.append("globalCaption", captions.global);
    // composition.seed 是常量，只用它会让每次"重新生成"拿回一模一样的音频。
    const seed = hashSeed(`${composition.seed}:${attempt}`);
    form.append("seed", String(seed));

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
      id: `ace-step-${composition.revision}-${seed}`,
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
      audioAssetId: `ace-step-${composition.revision}-${seed}`,
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

  /**
   * ACE-Step 不可用时走 Plan B：语言模型给动机，代码把它发展成音符伴奏。
   * 这一层刻意不自己实现——音频模型可以换，Plan B 始终是同一条链路。
   */
  fallback(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[], attempt = 0): Promise<AIPolishLayer> {
    return requestSymbolicPlanLayer(composition, cards, units, attempt);
  }
}

/** 一段 20—45 秒的编排通常一两秒就渲染完；给到 30 秒纯粹是为了兜住异常。 */
const RENDER_TIMEOUT_MS = 30_000;

function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([work, guard]).finally(() => clearTimeout(timer)) as Promise<T>;
}

function stableHash(value: string) {
  return `fnv1a-${hashSeed(value).toString(16).padStart(8, "0")}`;
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}
