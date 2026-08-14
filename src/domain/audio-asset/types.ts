export type OriginalAudioKind = "demo_original" | "local_recording" | "sound_library" | "licensed_system";

/** 原始音频只保存不可变引用；裁剪、移调、增益等均写入派生事件。 */
export interface OriginalAudioAsset {
  id: string;
  projectId: string;
  kind: OriginalAudioKind;
  sourceKey: string;
  label: string;
  storageRef: string;
  mimeType: string;
  durationMs: number;
  byteLength: number;
  sha256: string;
  licenseRef: string;
  createdAt: string;
}
