import Dexie, { type EntityTable } from "dexie";
import type { OriginalAudioAsset } from "@/src/domain/audio-asset";
import type { Composition } from "@/src/domain/composition";
import type { DemoState, SoundProject } from "@/src/domain/project";
import type { ConfirmedSoundCard, PaperSoundCard, SoundUnit } from "@/src/domain/sound-card";
import type { CaptureContributorRecord, DemoSnapshot, LibraryItemPreference, PendingCardImage, StoredRecording } from "@/src/features/ports";

interface SnapshotRecord {
  id: string;
  value: DemoSnapshot;
  updatedAt: string;
}

export class WanwuDatabase extends Dexie {
  snapshots!: EntityTable<SnapshotRecord, "id">;
  projects!: EntityTable<SoundProject, "id">;
  paperSoundCards!: EntityTable<PaperSoundCard, "id">;
  soundCards!: EntityTable<ConfirmedSoundCard, "id">;
  audioAssets!: EntityTable<OriginalAudioAsset, "id">;
  soundUnits!: EntityTable<SoundUnit, "id">;
  compositions!: EntityTable<Composition, "id">;
  demoStates!: EntityTable<DemoState, "id">;
  pendingCardImages!: EntityTable<PendingCardImage, "id">;
  captureContributors!: EntityTable<CaptureContributorRecord, "id">;
  recordedAudioAssets!: EntityTable<StoredRecording, "id">;
  libraryItemPreferences!: EntityTable<LibraryItemPreference, "id">;

  constructor(databaseName = "wanwu-sound-spectrum") {
    super(databaseName);
    this.version(1).stores({ snapshots: "id, updatedAt" });
    this.version(2).stores({
      snapshots: "id, updatedAt",
      projects: "id, updatedAt",
      paperSoundCards: "id, projectId, contributorId",
      soundCards: "id, projectId, paperCardId",
      audioAssets: "id, projectId, sourceKey, kind",
      soundUnits: "id, projectId, cardId, originalAudioAssetId",
      compositions: "id, projectId, savedAt, revision",
      demoStates: "id, projectId, updatedAt",
    });
    this.version(3).stores({
      snapshots: "id, updatedAt",
      projects: "id, updatedAt",
      paperSoundCards: "id, projectId, contributorId",
      soundCards: "id, projectId, paperCardId",
      audioAssets: "id, projectId, sourceKey, kind",
      soundUnits: "id, projectId, cardId, originalAudioAssetId",
      compositions: "id, projectId, savedAt, revision",
      demoStates: "id, projectId, updatedAt",
      pendingCardImages: "id, acquisition, createdAt",
    });
    this.version(4).stores({
      snapshots: "id, updatedAt",
      projects: "id, updatedAt",
      paperSoundCards: "id, projectId, contributorId",
      soundCards: "id, projectId, paperCardId",
      audioAssets: "id, projectId, sourceKey, kind",
      soundUnits: "id, projectId, cardId, originalAudioAssetId",
      compositions: "id, projectId, savedAt, revision",
      demoStates: "id, projectId, updatedAt",
      pendingCardImages: "id, acquisition, createdAt",
      captureContributors: "id, name, createdAt",
    });
    this.version(5).stores({
      snapshots: "id, updatedAt",
      projects: "id, updatedAt",
      paperSoundCards: "id, projectId, contributorId",
      soundCards: "id, projectId, paperCardId",
      audioAssets: "id, projectId, sourceKey, kind",
      soundUnits: "id, projectId, cardId, originalAudioAssetId",
      compositions: "id, projectId, savedAt, revision",
      demoStates: "id, projectId, updatedAt",
      pendingCardImages: "id, acquisition, createdAt",
      captureContributors: "id, name, createdAt",
      recordedAudioAssets: "id, name, contributorName, recordedAt, createdAt",
    });
    this.version(6).stores({
      snapshots: "id, updatedAt",
      projects: "id, updatedAt",
      paperSoundCards: "id, projectId, contributorId",
      soundCards: "id, projectId, paperCardId",
      audioAssets: "id, projectId, sourceKey, kind",
      soundUnits: "id, projectId, cardId, originalAudioAssetId",
      compositions: "id, projectId, savedAt, revision",
      demoStates: "id, projectId, updatedAt",
      pendingCardImages: "id, acquisition, createdAt",
      captureContributors: "id, name, createdAt",
      recordedAudioAssets: "id, name, contributorName, recordedAt, createdAt",
      libraryItemPreferences: "id, hidden, updatedAt",
    });
    // v7 是公开审阅环境的一次性数据归零：清除此前测试留下的项目、录音和操作状态。
    // 升级完成后，新产生的数据会继续按正常持久化规则保存，不会在刷新时重复清除。
    this.version(7).stores({
      snapshots: "id, updatedAt",
      projects: "id, updatedAt",
      paperSoundCards: "id, projectId, contributorId",
      soundCards: "id, projectId, paperCardId",
      audioAssets: "id, projectId, sourceKey, kind",
      soundUnits: "id, projectId, cardId, originalAudioAssetId",
      compositions: "id, projectId, savedAt, revision",
      demoStates: "id, projectId, updatedAt",
      pendingCardImages: "id, acquisition, createdAt",
      captureContributors: "id, name, createdAt",
      recordedAudioAssets: "id, name, contributorName, recordedAt, createdAt",
      libraryItemPreferences: "id, hidden, updatedAt",
    }).upgrade(async (transaction) => {
      await Promise.all([
        "snapshots",
        "projects",
        "paperSoundCards",
        "soundCards",
        "audioAssets",
        "soundUnits",
        "compositions",
        "demoStates",
        "pendingCardImages",
        "captureContributors",
        "recordedAudioAssets",
        "libraryItemPreferences",
      ].map((table) => transaction.table(table).clear()));
    });
  }
}
