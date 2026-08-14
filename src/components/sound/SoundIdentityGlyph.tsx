import type { ReactNode } from "react";
import type { OriginalAudioAsset } from "@/src/domain/audio-asset";
import type { SoundUnit } from "@/src/domain/sound-card";

export function isUserAddedSound(unit: SoundUnit, asset?: OriginalAudioAsset) {
  return asset?.kind === "local_recording" || unit.inputMode === "recording" || unit.inputMode === "paper_card";
}

/** 用户自行录制或加入的原始音频统一使用星标，系统素材保留既有声音图形。 */
export function SoundIdentityGlyph({ userAdded, children }: { userAdded: boolean; children: ReactNode }) {
  return userAdded ? <span className="sound-identity-star" aria-hidden="true">🌟</span> : children;
}
