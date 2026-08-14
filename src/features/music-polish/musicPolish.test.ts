import { describe, expect, it } from "vitest";
import { arrangeCompositionV1 } from "@/src/domain/composition";
import { MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { buildFunMusicPromptV2, buildMusicPolishBrief, buildSymbolicMusicPlanPrompt, deriveMusicPolishDirection, musicPolishBriefSchema } from ".";

describe("music polish prompt pipeline", () => {
  it("builds a valid anonymous brief from the composition", () => {
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1);
    const brief = buildMusicPolishBrief(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS);
    expect(musicPolishBriefSchema.parse(brief)).toEqual(brief);
    expect(brief.soundCount).toBe(MOCK_SOUND_UNITS.filter((unit) => unit.active).length);
    expect(brief.soundEvents.length).toBe(composition.events.length);
    expect(brief.soundEvents[0]).not.toHaveProperty("name");
  });

  it("keeps personal names and places out of the model prompt", () => {
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1);
    const prompt = buildFunMusicPromptV2(buildMusicPolishBrief(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS));
    for (const card of MOCK_SOUND_CARDS) {
      expect(prompt).not.toContain(card.owner);
      expect(prompt).not.toContain(card.place);
    }
    expect(prompt).toContain("纯音乐背景垫音");
    expect(prompt).toContain("不要主旋律");
    expect(prompt).toContain(`${composition.durationSeconds} 秒`);
  });

  it("is deterministic for the same composition", () => {
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1);
    const brief = buildMusicPolishBrief(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS);
    expect(buildFunMusicPromptV2(brief)).toBe(buildFunMusicPromptV2(brief));
  });

  it("asks the symbolic planner for structure and per-event responses", () => {
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1);
    const prompt = buildSymbolicMusicPlanPrompt(buildMusicPolishBrief(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS));
    expect(prompt).toContain("开头建立空间");
    expect(prompt).toContain("留白处可以增加短动机");
    expect(prompt).toContain("mallet");
  });

  it("creates a stronger direction for loud repeating sounds than soft fade-ins", () => {
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1);
    const base = buildMusicPolishBrief(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS);
    const quiet = { ...base, intensityProfile: { soft: 3, medium: 0, loud: 0 }, patternProfile: { once: 0, repeat: 0, bursts: 0, fadeIn: 3 }, emotionCoordinates: { enabled: true, valence: 0, arousal: -0.8 } };
    const driving = { ...base, intensityProfile: { soft: 0, medium: 0, loud: 3 }, patternProfile: { once: 0, repeat: 2, bursts: 1, fadeIn: 0 }, emotionCoordinates: { enabled: true, valence: 0, arousal: 0.8 } };
    expect(deriveMusicPolishDirection(driving).energy).toBeGreaterThan(deriveMusicPolishDirection(quiet).energy);
    expect(deriveMusicPolishDirection(driving).pulse).toBeGreaterThan(deriveMusicPolishDirection(quiet).pulse);
  });
});
