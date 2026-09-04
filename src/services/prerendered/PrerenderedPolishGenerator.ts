import { fitBackgroundAudio } from "@/src/audio/editing/fitBackgroundAudio";
import { isBackgroundGainLimited } from "@/src/audio/mixing";
import { maxOverlappingEvents } from "@/src/audio/mixing/maxOverlappingEvents";
import type { AIPolishLayer, Composition } from "@/src/domain/composition";
import type { ConfirmedSoundCard, SoundUnit } from "@/src/domain/sound-card";
import {
  buildDeterministicSymbolicPlan, buildMusicPolishBrief,
  deriveBackgroundVoicing, deriveMusicPolishDirection,
} from "@/src/features/music-polish";
import type { PolishGenerationPort } from "@/src/features/ports";
import { prerenderedManifestSchema, type PrerenderedManifest } from "./contracts";
import { selectPrerenderedClip } from "./selectPrerenderedClip";

const MANIFEST_URL = "/backgrounds/manifest.json";

/**
 * 用提前泡好的 ACE-Step 素材做背景层。
 *
 * 与 FunMusicPolishGenerator 的区别只在素材从哪来：这里读本地素材库，
 * 不联网、不排队、不会过期，因此现场断网也能出背景。
 * 代价是素材是预先生成的——sourceKind 固定为 cached_demo_ai，
 * 界面必须如实标成"预渲染背景"，不能显示成实时模型结果。
 */
export class PrerenderedPolishGenerator implements PolishGenerationPort {
  /** 清单只读一次；同一次课堂里反复生成不该反复打网络。 */
  private manifestPromise: Promise<PrerenderedManifest> | null = null;

  async generate(composition: Composition, cards: ConfirmedSoundCard[], units: SoundUnit[]): Promise<AIPolishLayer> {
    const brief = buildMusicPolishBrief(composition, cards, units);
    const direction = deriveMusicPolishDirection(brief);
    const manifest = await this.loadManifest();
    const clip = selectPrerenderedClip(manifest.clips, {
      emotion: brief.emotion,
      density: direction.energyBand,
      durationSeconds: composition.durationSeconds,
      seed: composition.seed,
    });
    if (!clip) {
      throw new Error(
        `素材库里没有「${brief.emotion ?? "默认"}／${direction.energyBand}／${composition.durationSeconds}秒」`
        + "这一组背景，请先补泡这一组，或改用本地音符背景。",
      );
    }

    const response = await fetch(clip.url);
    if (!response.ok) throw new Error(`取回预渲染背景失败（${response.status}），请改用本地音符背景。`);
    // 素材泡出来时已经对齐过时长，这里再走一次是防止清单与实际文件不一致；
    // 校验成本很低，而现场放出一段长度不对的背景代价很高。
    const fitted = await fitBackgroundAudio(await response.blob(), {
      targetDurationSeconds: composition.durationSeconds,
      fadeInSeconds: manifest.fadeInSeconds,
      fadeOutSeconds: manifest.fadeOutSeconds,
    });

    const defaultGainDb = -16;
    return {
      id: `prerendered-${clip.id}`,
      compositionRevision: composition.revision,
      sourceKind: manifest.sourceKind,
      provider: manifest.provider,
      model: manifest.model,
      promptVersion: manifest.version,
      defaultGainDb,
      basedOnInputHash: stableHash(JSON.stringify(brief)),
      direction,
      voicing: deriveBackgroundVoicing(brief),
      audioUrl: URL.createObjectURL(fitted.blob),
      audioAssetId: clip.id,
      validation: {
        version: "background-validation-v1",
        status: "local-verified",
        format: "mp3",
        trustedSource: true,
        // 素材是用 instrumental-only 的约束泡的，见 tools/prerender_backgrounds.py。
        instrumentalModeRequested: true,
        generatedDurationSeconds: clip.actualDurationSeconds,
        playbackDurationSeconds: fitted.durationSeconds,
        gainLimited: isBackgroundGainLimited(defaultGainDb, maxOverlappingEvents(composition)),
        // 素材在入库前由人试听过，不是每次运行时自动判定的。
        voiceRiskCheck: "reviewed-offline",
      },
    };
  }

  /** 素材库也不可用时的最后一层：纯本地推导，不联网。 */
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
      fallbackReason: "not-configured",
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

  private loadManifest(): Promise<PrerenderedManifest> {
    // 失败不缓存：老师补泡素材后刷新页面就该能用上，不必重启。
    this.manifestPromise ??= fetchManifest().catch((error: unknown) => {
      this.manifestPromise = null;
      throw error;
    });
    return this.manifestPromise;
  }
}

async function fetchManifest(): Promise<PrerenderedManifest> {
  const response = await fetch(MANIFEST_URL);
  if (!response.ok) throw new Error("这台设备还没有预渲染背景素材库。");
  const parsed = prerenderedManifestSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error("背景素材清单格式不正确，已停止使用预渲染背景。");
  return parsed.data;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
