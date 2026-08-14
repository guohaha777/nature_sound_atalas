import type { LibraryItemPreference, PendingCaptureRepository, PendingCardImage, StoredRecording } from "@/src/features/ports";
import { WanwuDatabase } from "../db/WanwuDatabase";

export class DexiePendingCaptureRepository implements PendingCaptureRepository {
  constructor(private readonly db: WanwuDatabase) {}

  loadCardImage(): Promise<PendingCardImage | null> {
    return this.db.pendingCardImages.get("current-card-image").then((image) => image ?? null);
  }

  async saveCardImage(image: PendingCardImage): Promise<void> {
    await this.db.pendingCardImages.put(image);
  }

  async clearCardImage(): Promise<void> {
    await this.db.pendingCardImages.delete("current-card-image");
  }

  async loadContributorNames(): Promise<string[]> {
    return (await this.db.captureContributors.orderBy("createdAt").toArray()).map((record) => record.name);
  }

  async saveContributorName(name: string): Promise<void> {
    const normalized = name.trim();
    if (!normalized) return;
    await this.db.captureContributors.put({ id: `contributor-${encodeURIComponent(normalized)}`, name: normalized, createdAt: new Date().toISOString() });
  }

  loadRecordings(): Promise<StoredRecording[]> {
    return this.db.recordedAudioAssets.orderBy("createdAt").reverse().toArray();
  }

  async saveRecording(recording: StoredRecording): Promise<void> {
    await this.db.recordedAudioAssets.put(recording);
  }

  async deleteRecording(id: string): Promise<void> {
    await this.db.recordedAudioAssets.delete(id);
  }

  loadLibraryItemPreferences(): Promise<LibraryItemPreference[]> {
    return this.db.libraryItemPreferences.toArray();
  }

  async saveLibraryItemPreference(preference: LibraryItemPreference): Promise<void> {
    await this.db.libraryItemPreferences.put(preference);
  }

  async clearAll(): Promise<void> {
    await this.db.transaction(
      "rw",
      [this.db.pendingCardImages, this.db.captureContributors, this.db.recordedAudioAssets, this.db.libraryItemPreferences],
      async () => {
        await Promise.all([
          this.db.pendingCardImages.clear(),
          this.db.captureContributors.clear(),
          this.db.recordedAudioAssets.clear(),
          this.db.libraryItemPreferences.clear(),
        ]);
      },
    );
  }
}
