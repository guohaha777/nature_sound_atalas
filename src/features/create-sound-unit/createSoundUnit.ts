import { originalAudioAssetSchema, type OriginalAudioAsset } from "@/src/domain/audio-asset";
import { confirmedSoundCardSchema, soundUnitSchema, type ConfirmedSoundCard, type SoundInputMode, type SoundProvenance, type SoundUnit } from "@/src/domain/sound-card";

export interface CreateSoundUnitInput {
  id: string;
  card: ConfirmedSoundCard;
  audioAsset: OriginalAudioAsset;
  inputMode: SoundInputMode;
  provenance: Omit<SoundProvenance, "originalAudioAssetId">;
  contributionLabel: string;
  createdAt: string;
}

/** 拍卡、录音和声音库三条链路在这里汇合为同一种 SoundUnit。 */
export function createSoundUnit(input: CreateSoundUnitInput): SoundUnit {
  const card = confirmedSoundCardSchema.parse(input.card);
  const audioAsset = originalAudioAssetSchema.parse(input.audioAsset);
  if (card.projectId !== audioAsset.projectId) throw new Error("Sound card and audio asset must belong to the same project");

  return soundUnitSchema.parse({
    id: input.id,
    projectId: card.projectId,
    cardId: card.id,
    originalAudioAssetId: audioAsset.id,
    inputMode: input.inputMode,
    parameters: {
      pitch: card.pitch,
      duration: card.duration,
      contour: card.contour,
      intensity: card.intensity,
      pattern: card.pattern,
    },
    provenance: { ...input.provenance, originalAudioAssetId: audioAsset.id },
    contributionLabel: input.contributionLabel,
    active: true,
    mappingVersion: "music-mapping-v1",
    createdAt: input.createdAt,
  });
}
