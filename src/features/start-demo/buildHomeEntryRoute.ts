import type { HomeEntranceId, HomeEntrySource } from "@/src/mocks/homePageMockData";

export function buildHomeEntryRoute(entry: HomeEntranceId, source: HomeEntrySource): string {
  if (entry === "diary") {
    const capture = source === "upload" ? "upload" : "camera";
    return `/cards?entry=diary&capture=${capture}`;
  }

  const recordSource = source === "library" ? "library" : "record";
  return `/cards?entry=record&source=${recordSource}`;
}
