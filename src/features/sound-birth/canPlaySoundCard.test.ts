import { describe, expect, it } from "vitest";
import { MOCK_ORIGINAL_AUDIO_ASSETS, MOCK_SOUND_CARDS } from "@/src/mocks/mockData";
import { canPlaySoundCard } from "./canPlaySoundCard";

describe("canPlaySoundCard", () => {
  it("allows the confirmation page to audition a newly bound draft source", () => {
    const boundDraft = { ...MOCK_SOUND_CARDS[0], confirmedAt: "paper-draft", sourceSelectionRequired: false };
    expect(canPlaySoundCard(boundDraft, MOCK_ORIGINAL_AUDIO_ASSETS[0], true)).toBe(true);
    expect(canPlaySoundCard(boundDraft, MOCK_ORIGINAL_AUDIO_ASSETS[0], false)).toBe(false);
  });

  it("never plays an unbound placeholder", () => {
    const unboundDraft = { ...MOCK_SOUND_CARDS[0], confirmedAt: "paper-draft", sourceSelectionRequired: true };
    expect(canPlaySoundCard(unboundDraft, MOCK_ORIGINAL_AUDIO_ASSETS[0], true)).toBe(false);
  });
});
