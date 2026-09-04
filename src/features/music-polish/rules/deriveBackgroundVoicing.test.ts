import { describe, expect, it } from "vitest";
import { arrangeCompositionV1 } from "@/src/domain/composition";
import { MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { buildMusicPolishBrief } from "./buildMusicPolishBrief";
import { deriveBackgroundVoicing, type BackgroundVoicing } from "./deriveBackgroundVoicing";

function briefFor(unitIds: string[], options?: { emotion?: { valence: number; arousal: number }; durationSeconds?: number }) {
  const units = MOCK_SOUND_UNITS.map((unit) => ({ ...unit, active: unitIds.includes(unit.id) }));
  const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1, options?.durationSeconds ?? 30);
  const withEmotion = options?.emotion
    ? { ...composition, emotionIntent: { enabled: true, valence: options.emotion.valence, arousal: options.emotion.arousal, label: null, mappingVersion: "emotion-mapping-v1" as const } }
    : composition;
  return buildMusicPolishBrief(withEmotion, MOCK_SOUND_CARDS, units);
}

/** 两份音色底色之间有几项明显不同。 */
function differences(a: BackgroundVoicing, b: BackgroundVoicing): string[] {
  const changed: string[] = [];
  if (Math.abs(a.brightness - b.brightness) >= 0.08) changed.push("brightness");
  if (Math.abs(a.space - b.space) >= 0.08) changed.push("space");
  if (Math.abs(a.registerShiftSemitones - b.registerShiftSemitones) >= 2) changed.push("register");
  if (a.attackShape !== b.attackShape) changed.push("attack");
  if (Math.abs(a.colorTilt - b.colorTilt) >= 0.15) changed.push("color");
  return changed;
}

describe("音色底色由孩子的选择驱动", () => {
  it("孩子选“响”的素材比“轻”的更亮", () => {
    const loud = deriveBackgroundVoicing(briefFor(["sound-bell", "sound-steps"]));
    const soft = deriveBackgroundVoicing(briefFor(["sound-rain"]));
    expect(loud.brightness).toBeGreaterThan(soft.brightness);
  });

  it("孩子的声音偏高时背景往低走，偏低时往上让", () => {
    const highMaterial = deriveBackgroundVoicing(briefFor(["sound-rain", "sound-springbird"]));
    const lowMaterial = deriveBackgroundVoicing(briefFor(["sound-cow"]));
    expect(highMaterial.registerShiftSemitones).toBeLessThan(lowMaterial.registerShiftSemitones);
    expect(highMaterial.registerShiftSemitones).toBeLessThanOrEqual(0);
  });

  it("密集的作品保持干，留白多的作品才给空间", () => {
    const dense = deriveBackgroundVoicing(briefFor(["sound-cow", "sound-steps", "sound-bell", "sound-springbird"], { durationSeconds: 20 }));
    const sparse = deriveBackgroundVoicing(briefFor(["sound-rain"], { durationSeconds: 45 }));
    expect(sparse.space).toBeGreaterThan(dense.space);
  });

  it("情绪的愉悦度决定明暗", () => {
    const bright = deriveBackgroundVoicing(briefFor(["sound-cow"], { emotion: { valence: 0.8, arousal: 0.5 } }));
    const blue = deriveBackgroundVoicing(briefFor(["sound-cow"], { emotion: { valence: -0.8, arousal: -0.5 } }));
    expect(bright.colorTilt).toBeGreaterThan(blue.colorTilt);
  });

  it("同样的输入永远得到同样的底色，保证归档能重放、孩子能复现", () => {
    const first = deriveBackgroundVoicing(briefFor(["sound-cow", "sound-rain"]));
    const second = deriveBackgroundVoicing(briefFor(["sound-cow", "sound-rain"]));
    expect(first).toEqual(second);
  });
});

describe("不同组合必须听得出差别", () => {
  // 对应 TODO 的验收项：至少三组测试素材能听出不同的组织方式。
  const samples = {
    单个短声: briefFor(["sound-cow"]),
    混合三声: briefFor(["sound-cow", "sound-steps", "sound-rain"]),
    长短不一: briefFor(["sound-rain", "sound-bell", "sound-springbird"], { durationSeconds: 45 }),
  };

  it("三组素材两两之间至少有两项明显不同", () => {
    const voicings = Object.entries(samples).map(([name, brief]) => [name, deriveBackgroundVoicing(brief)] as const);
    const pairs = voicings.flatMap(([nameA, a], index) => voicings.slice(index + 1).map(([nameB, b]) => ({ pair: `${nameA} / ${nameB}`, changed: differences(a, b) })));

    pairs.forEach(({ pair, changed }) => {
      expect(changed.length, `${pair} 只有 ${changed.length} 项不同：${changed.join("、") || "完全相同"}`).toBeGreaterThanOrEqual(2);
    });
  });

  it("同一批素材换一个情绪，底色也要跟着变", () => {
    const calm = deriveBackgroundVoicing(briefFor(["sound-cow", "sound-steps"], { emotion: { valence: 0.6, arousal: -0.7 } }));
    const excited = deriveBackgroundVoicing(briefFor(["sound-cow", "sound-steps"], { emotion: { valence: 0.6, arousal: 0.8 } }));
    expect(differences(calm, excited).length).toBeGreaterThanOrEqual(1);
  });
});
