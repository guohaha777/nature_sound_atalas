import type { OriginalAudioAsset } from "@/src/domain/audio-asset";
import type { Composition } from "@/src/domain/composition";
import type { SoundUnit } from "@/src/domain/sound-card";
import { buildCompositionPlaybackTimeline } from "@/src/features/composition-playback";
import { compositionBeatLength } from "@/src/features/composition-duration";

export interface WorkDetailModel {
  composition: Composition;
  title: string;
  units: SoundUnit[];
  contributorNames: string[];
  audibleDurationSeconds: number;
  musicDiscovery: {
    childText: string;
    tryThis: string;
    sourceLabel: string;
  } | null;
  /** 保存时这首作品用的是哪种背景，以及为什么没用上模型。归档后不再重新调用模型。 */
  background: {
    label: string;
    note: string | null;
    enabled: boolean;
    /** 保存时程序为了让模型方案能播放而做的确定性修补。 */
    repairs: string[];
    /** 这首作品当时用的音色底色，说明它为什么听起来是这个样子。 */
    toneNote: string | null;
    /** 模型返回的临时音频链接已过期时的说明；基础作品不受影响。 */
    expiredNote: string | null;
  };
  /** 保存那一刻 Agent 对编排做过什么决定。 */
  agentDecision: { label: string; reason: string } | null;
}

export function buildWorkDetailModel(input: {
  workId: string;
  composition: Composition | null;
  projectName: string;
  units: SoundUnit[];
  audioAssets: OriginalAudioAsset[];
}): WorkDetailModel | null {
  const { composition } = input;
  if (!composition || composition.id !== input.workId || !composition.savedAt) return null;

  const included = input.units.filter((unit) => composition.soundUnitIds.includes(unit.id));
  const timeline = buildCompositionPlaybackTimeline(composition, input.audioAssets, compositionBeatLength(composition));
  const teachingAdvice = composition.teachingAdvice?.compositionRevision === composition.revision ? composition.teachingAdvice : null;

  return {
    composition,
    title: composition.title ?? input.projectName,
    units: included,
    contributorNames: Array.from(new Set(included.map((unit) => unit.provenance.contributorName))),
    audibleDurationSeconds: timeline.audibleDurationSeconds,
    musicDiscovery: teachingAdvice ? {
      childText: teachingAdvice.musicDiscovery.childText,
      tryThis: teachingAdvice.musicDiscovery.tryThis,
      sourceLabel: teachingAdvice.sourceKind === "live_ai" ? `千问 ${teachingAdvice.model ?? "模型"} 整理` : "本地规则整理",
    } : null,
    background: describeBackground(composition),
    agentDecision: describeDecision(composition),
  };
}

const DECISION_LABELS: Record<NonNullable<Composition["contextAnalysis"]>["decision"], string> = {
  "run-deterministic-arranger": "按规则自动编排",
  "preserve-child-arrangement": "保留孩子自己的摆放",
  "preserve-and-extend": "保留孩子的摆放，只为新加入的声音补位置",
};

function describeDecision(composition: Composition): WorkDetailModel["agentDecision"] {
  const analysis = composition.contextAnalysis;
  if (!analysis) return null;
  return { label: DECISION_LABELS[analysis.decision], reason: analysis.reason };
}

/** 把音色底色翻成一句老师能读懂的话。 */
function describeTone(layer: NonNullable<Composition["polishLayer"]>): string | null {
  const voicing = layer.voicing;
  if (!voicing) return null;
  const brightness = voicing.brightness >= 0.62 ? "明亮" : voicing.brightness <= 0.38 ? "偏暗" : "中性";
  const space = voicing.space >= 0.6 ? "空间感较大" : voicing.space <= 0.3 ? "干净紧凑" : "空间适中";
  const register = voicing.registerShiftSemitones <= -2
    ? "背景让到更低的音区，给孩子的声音腾出位置"
    : voicing.registerShiftSemitones >= 2
      ? "背景抬到更高的音区，避开孩子声音所在的位置"
      : "背景与孩子的声音音区相近";
  return `${brightness}、${space}；${register}。`;
}

const BACKGROUND_FALLBACK_NOTES: Record<NonNullable<Composition["polishLayer"]>["fallbackReason"] & string, string> = {
  "not-connected": "保存时没叫到 AI，用的是系统自带的伴奏。",
  "not-configured": "这台设备还没开通 AI 背景，用的是系统自带的伴奏。",
  "model-rejected": "AI 写的伴奏没通过编排检查，换成了系统自带的。",
  "quota-used": "当天的 AI 次数已用完，用的是系统自带的伴奏。",
};

/** 归档展示的是保存那一刻的事实，不会因为今天联不联得上模型而改变。 */
function describeBackground(composition: Composition): WorkDetailModel["background"] {
  const layer = composition.polishLayer;
  if (!layer) return { label: "只有孩子的声音", note: null, enabled: false, repairs: [], toneNote: null, expiredNote: null };
  const label = layer.sourceKind === "live_ai"
    ? "AI 生成的背景音乐"
    : layer.sourceKind === "symbolic_ai"
      ? "AI 写的音符伴奏"
      : layer.sourceKind === "cached_demo_ai"
        ? "示例背景"
        : "系统自带的伴奏";
  const expired = Boolean(layer.audioExpiresAt && layer.audioExpiresAt * 1000 <= Date.now());
  return {
    label,
    note: layer.sourceKind === "local_fallback" ? BACKGROUND_FALLBACK_NOTES[layer.fallbackReason ?? "not-connected"] : null,
    enabled: composition.polishEnabled,
    repairs: layer.arrangementRepairs ?? [],
    toneNote: describeTone(layer),
    // 临时链接过期只影响这一层背景；孩子的原声和编排都保存在本机，照常播放。
    expiredNote: expired
      ? "这段 AI 背景音频的临时链接已经过期，现在播放的是孩子的原声和编排。想要背景可以回到成曲页重新生成。"
      : null,
  };
}
