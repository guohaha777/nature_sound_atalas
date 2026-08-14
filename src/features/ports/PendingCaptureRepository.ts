export type CardImageAcquisition = "camera" | "upload";

export interface PendingCardImage {
  id: "current-card-image";
  acquisition: CardImageAcquisition;
  blob: Blob;
  fileName: string;
  mimeType: string;
  size: number;
  lastModified: number;
  createdAt: string;
}

export interface PendingCaptureRepository {
  loadCardImage(): Promise<PendingCardImage | null>;
  saveCardImage(image: PendingCardImage): Promise<void>;
  clearCardImage(): Promise<void>;
  loadContributorNames(): Promise<string[]>;
  saveContributorName(name: string): Promise<void>;
  loadRecordings(): Promise<StoredRecording[]>;
  saveRecording(recording: StoredRecording): Promise<void>;
  deleteRecording(id: string): Promise<void>;
  loadLibraryItemPreferences(): Promise<LibraryItemPreference[]>;
  saveLibraryItemPreference(preference: LibraryItemPreference): Promise<void>;
  clearAll(): Promise<void>;
}

export interface CaptureContributorRecord {
  id: string;
  name: string;
  createdAt: string;
}

export interface StoredRecording {
  id: string;
  name: string;
  contributorName: string;
  place: string;
  recordedAt: string;
  mimeType: string;
  blob: Blob;
  durationMs: number;
  createdAt: string;
}

export interface LibraryItemPreference {
  id: string;
  name: string | null;
  hidden: boolean;
  updatedAt: string;
}
