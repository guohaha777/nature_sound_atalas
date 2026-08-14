import { describe, expect, it } from "vitest";
import { originalAudioAssetSchema } from "./audio-asset";
import { arrangeCompositionV1, compositionSchema, emotionIntentSchema } from "./composition";
import { paperSoundCardSchema, soundUnitSchema } from "./sound-card";
import { MOCK_ORIGINAL_AUDIO_ASSETS, MOCK_PAPER_SOUND_CARDS, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";

describe("public base contracts", () => {
  it("allows at most three sound entries on one paper card", () => {
    expect(paperSoundCardSchema.parse(MOCK_PAPER_SOUND_CARDS[0]).entryIds).toHaveLength(3);
    expect(() => paperSoundCardSchema.parse({ ...MOCK_PAPER_SOUND_CARDS[0], entryIds: ["a", "b", "c", "d"] })).toThrow();
  });

  it("keeps all five original demo audio assets traceable", () => {
    expect(MOCK_ORIGINAL_AUDIO_ASSETS.map((asset) => originalAudioAssetSchema.parse(asset))).toHaveLength(5);
    expect(new Set(MOCK_ORIGINAL_AUDIO_ASSETS.map((asset) => asset.sha256)).size).toBe(5);
  });

  it("uses one optional emotion intent for the composition", () => {
    expect(emotionIntentSchema.parse({ enabled: true, valence: 0.7, arousal: 0.8, label: "bright", mappingVersion: "emotion-mapping-v1" })).toMatchObject({ label: "bright" });
  });

  it("arranges SoundUnits with immutable audio asset references", () => {
    MOCK_SOUND_UNITS.forEach((unit) => soundUnitSchema.parse(unit));
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1);
    expect(() => compositionSchema.parse(composition)).not.toThrow();
    expect(composition.events.every((event) => event.audioAssetId.startsWith("audio-"))).toBe(true);
    expect(arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1)).toEqual(composition);
  });
});
