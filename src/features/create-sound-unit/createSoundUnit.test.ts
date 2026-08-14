import { describe, expect, it } from "vitest";
import { MOCK_ORIGINAL_AUDIO_ASSETS, MOCK_SOUND_CARDS } from "@/src/mocks/mockData";
import { createSoundUnit } from "./createSoundUnit";

describe("createSoundUnit", () => {
  it.each(["paper_card", "recording", "sound_library"] as const)("normalizes %s input to the same SoundUnit contract", (inputMode) => {
    const unit = createSoundUnit({
      id: `unit-${inputMode}`,
      card: MOCK_SOUND_CARDS[1],
      audioAsset: MOCK_ORIGINAL_AUDIO_ASSETS[0],
      inputMode,
      provenance: {
        contributorId: "child-xiaoyu",
        contributorName: "小雨",
        originalCardAssetId: inputMode === "paper_card" ? "card-image-1" : null,
        recordedAt: "2026.08.04",
        place: "村口山路",
        archiveScopes: ["personal", "classroom"],
      },
      contributionLabel: "小雨的声音",
      createdAt: "2026-08-04T09:00:00.000Z",
    });
    expect(unit).toMatchObject({ inputMode, originalAudioAssetId: "audio-cow", mappingVersion: "music-mapping-v1" });
  });
});
