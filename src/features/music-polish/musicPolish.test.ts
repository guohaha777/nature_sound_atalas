import { describe, expect, it } from "vitest";
import { arrangeCompositionV1 } from "@/src/domain/composition";
import { MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { buildFunMusicPromptV2, buildMusicIdeaPrompt } from "@/src/prompts";
import { buildMusicPolishBrief, deriveMusicPolishDirection, musicPolishBriefSchema } from ".";

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

  it("只向模型要音乐想法，把段落与音高材料交代清楚", () => {
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1);
    const brief = buildMusicPolishBrief(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS);
    const prompt = buildMusicIdeaPrompt(brief);

    expect(prompt).toContain("music-idea-v1");
    expect(prompt).toContain("不要写完整的音符表");
    expect(prompt).toContain("主音");
    brief.sections.forEach((section) => expect(prompt).toContain(`${section.startSeconds}–${section.endSeconds} 秒`));
    // 动机的质量要求是这次改动的重点，必须写进提示词。
    expect(prompt).toContain("至少有一次跳进");
    expect(prompt).toContain("经得起重复");
  });

  it("情绪坐标不同，给模型的指令也不同", () => {
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1);
    const base = buildMusicPolishBrief(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS);
    const bright = buildMusicIdeaPrompt({ ...base, emotionCoordinates: { enabled: true, valence: 0.8, arousal: 0.7 } });
    const blue = buildMusicIdeaPrompt({ ...base, emotionCoordinates: { enabled: true, valence: -0.8, arousal: -0.7 } });

    expect(bright).toContain("向上的跳进");
    expect(bright).toContain("bassPulse 用 steady");
    expect(blue).toContain("向下的级进");
    expect(blue).toContain("bassPulse 用 none 或 slow");
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
