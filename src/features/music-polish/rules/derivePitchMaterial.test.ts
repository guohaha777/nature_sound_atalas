import { describe, expect, it } from "vitest";
import { arrangeCompositionV1 } from "@/src/domain/composition";
import { MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { buildMusicPolishBrief } from "./buildMusicPolishBrief";
import { derivePitchMaterial, describePitchMaterial } from "./derivePitchMaterial";

function briefFor(unitIds: string[], emotion?: { valence: number; arousal: number }, durationSeconds = 30) {
  const units = MOCK_SOUND_UNITS.map((unit) => ({ ...unit, active: unitIds.includes(unit.id) }));
  const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1, durationSeconds);
  const withEmotion = emotion
    ? { ...composition, emotionIntent: { enabled: true, valence: emotion.valence, arousal: emotion.arousal, label: null, mappingVersion: "emotion-mapping-v1" as const } }
    : composition;
  return buildMusicPolishBrief(withEmotion, MOCK_SOUND_CARDS, units);
}

describe("每首作品的音高材料", () => {
  it("情绪愉悦度决定调式的明暗", () => {
    expect(derivePitchMaterial(briefFor(["sound-cow"], { valence: 0.8, arousal: 0 })).scaleName).toBe("lydian");
    expect(derivePitchMaterial(briefFor(["sound-cow"], { valence: 0.3, arousal: 0 })).scaleName).toBe("major");
    expect(derivePitchMaterial(briefFor(["sound-cow"], { valence: 0, arousal: 0 })).scaleName).toBe("pentatonic");
    expect(derivePitchMaterial(briefFor(["sound-cow"], { valence: -0.3, arousal: 0 })).scaleName).toBe("dorian");
    expect(derivePitchMaterial(briefFor(["sound-cow"], { valence: -0.8, arousal: 0 })).scaleName).toBe("minor");
  });

  it("和声进行里的和弦真的换根音，不是同一个和弦换八度", () => {
    const material = derivePitchMaterial(briefFor(["sound-cow", "sound-rain"]));
    expect(new Set(material.progression).size).toBeGreaterThanOrEqual(3);
  });

  it("不同素材落在不同的调上", () => {
    const tonics = [
      ["sound-cow"],
      ["sound-rain"],
      ["sound-cow", "sound-steps", "sound-rain"],
      ["sound-bell", "sound-springbird"],
    ].map((ids) => derivePitchMaterial(briefFor(ids)).tonicMidi);

    expect(new Set(tonics).size).toBeGreaterThanOrEqual(2);
  });

  it("同样的素材永远得到同一个调，保证可复现", () => {
    expect(derivePitchMaterial(briefFor(["sound-cow", "sound-rain"])))
      .toEqual(derivePitchMaterial(briefFor(["sound-cow", "sound-rain"])));
  });

  it("写进提示词的清单包含主音、可用音和和弦走向", () => {
    const lines = describePitchMaterial(derivePitchMaterial(briefFor(["sound-cow"]))).join("\n");
    expect(lines).toContain("主音");
    expect(lines).toContain("只使用这些音");
    expect(lines).toContain("→");
    expect(lines).toContain("不允许把同一个和弦搬到别的八度");
  });
});
