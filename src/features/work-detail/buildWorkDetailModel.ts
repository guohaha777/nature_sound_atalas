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
  };
}
