import { describe, expect, it } from "vitest";
import { MOCK_ORIGINAL_AUDIO_ASSETS, MOCK_PAPER_SOUND_CARDS, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { buildSoundBirthPreview, resolveSoundBirth } from "./buildSoundBirthModel";

describe("sound birth model", () => {
  it("resolves the bound SoundUnit, immutable asset and paper-card sequence", () => {
    const result = resolveSoundBirth("rain", MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, MOCK_ORIGINAL_AUDIO_ASSETS, MOCK_PAPER_SOUND_CARDS, { followPaperSequence: true });
    expect(result).toMatchObject({ status: "ready", sequenceIndex: 0, sequenceTotal: 3, nextCardId: "cow" });
    if (result.status !== "ready") throw new Error("expected ready sound birth");
    expect(result.asset.id).toBe(result.unit.originalAudioAssetId);
    expect(result.explanation).toContain("树梢间的风");
  });

  it("treats a sound-library selection as one independent birth", () => {
    const result = resolveSoundBirth("rain", MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, MOCK_ORIGINAL_AUDIO_ASSETS, MOCK_PAPER_SOUND_CARDS);
    expect(result).toMatchObject({ status: "ready", sequenceIndex: 0, sequenceTotal: 1, nextCardId: null });
  });

  it("classifies a paper-card SoundUnit as history even when it references a system asset", () => {
    const card = { ...MOCK_SOUND_CARDS[0], id: "paper-local", paperCardId: "paper-local-group" };
    const unit = { ...MOCK_SOUND_UNITS[0], id: "unit-paper-local", cardId: card.id, inputMode: "paper_card" as const };
    const result = resolveSoundBirth(card.id, [card], [unit], MOCK_ORIGINAL_AUDIO_ASSETS, []);

    expect(result).toMatchObject({ status: "ready", sourceTitle: "历史声音 · 纸卡加入", sourceBadge: "用户声音" });
  });

  it("rejects an unbound paper-card draft instead of playing its placeholder", () => {
    const card = { ...MOCK_SOUND_CARDS[0], id: "draft", confirmedAt: "paper-draft", sourceSelectionRequired: true };
    expect(resolveSoundBirth("draft", [card], [], MOCK_ORIGINAL_AUDIO_ASSETS, [])).toEqual({ status: "unconfirmed" });
  });

  it("creates a deterministic derived preview without creating or mutating an audio asset", () => {
    const card = { ...MOCK_SOUND_CARDS[1], pitch: "high" as const, contour: "wavy" as const, pattern: "bursts" as const };
    const unit = { ...MOCK_SOUND_UNITS[1], parameters: { ...MOCK_SOUND_UNITS[1].parameters, pitch: "high" as const, contour: "wavy" as const, pattern: "bursts" as const } };
    const asset = MOCK_ORIGINAL_AUDIO_ASSETS[0];
    const before = structuredClone(asset);
    const first = buildSoundBirthPreview(card, unit, asset);
    const second = buildSoundBirthPreview(card, unit, asset);
    expect(first).toEqual(second);
    expect(first.events).toHaveLength(4);
    expect(first.events[0]).toMatchObject({ audioAssetId: asset.id, semitoneShift: 3, filterMotion: "lfo" });
    expect(asset).toEqual(before);
  });

  it("keeps an original preview unprocessed", () => {
    const preview = buildSoundBirthPreview(MOCK_SOUND_CARDS[1], MOCK_SOUND_UNITS[1], MOCK_ORIGINAL_AUDIO_ASSETS[0], { fullOriginal: true });
    expect(preview.events).toHaveLength(1);
    expect(preview.events[0]).toMatchObject({ gainDb: 0, semitoneShift: 0, filterMotion: "none", loop: false });
  });

  it("never shortens the complete source for a six-field preview", () => {
    const card = { ...MOCK_SOUND_CARDS[1], duration: "short" as const, pattern: "once" as const };
    const unit = { ...MOCK_SOUND_UNITS[1], parameters: { ...MOCK_SOUND_UNITS[1].parameters, duration: "short" as const, pattern: "once" as const } };
    const asset = { ...MOCK_ORIGINAL_AUDIO_ASSETS[0], durationMs: 12_000 };
    const preview = buildSoundBirthPreview(card, unit, asset);
    const naturalSeconds = asset.durationMs / 1000 / Math.pow(2, preview.events[0].semitoneShift / 12);
    expect(preview.events[0].durationBeats * (60 / preview.bpm)).toBeGreaterThanOrEqual(naturalSeconds);
    expect(preview.durationSeconds).toBeGreaterThan(naturalSeconds);
  });
});
