import { describe, expect, it } from "vitest";
import {
  backgroundBusGainDb,
  BACKGROUND_OFFSET_DB,
  childBusGainDb,
  CHILD_BUS_BASE_DB,
  CHILD_BUS_FLOOR_DB,
  duckDepthDb,
  endingFadeSeconds,
  MAX_DUCK_DB,
  maxSimultaneousSounds,
  MIN_DUCK_DB,
  polyphonyVelocity,
  voicePan,
  voiceTrimDb,
  backgroundToneSettings,
  clampMidi,
} from "./mixPolicy";

describe("儿童声总线", () => {
  it("单个声音使用基准电平", () => {
    expect(childBusGainDb(1)).toBe(CHILD_BUS_BASE_DB);
  });

  it("同时发声越多留出越多余量", () => {
    expect(childBusGainDb(2)).toBeLessThan(childBusGainDb(1));
    expect(childBusGainDb(4)).toBeLessThan(childBusGainDb(2));
    expect(childBusGainDb(2)).toBe(-6);
  });

  it("不会一路衰减到听不见", () => {
    expect(childBusGainDb(64)).toBe(CHILD_BUS_FLOOR_DB);
  });
});

describe("背景总线", () => {
  it("永远低于儿童总线一个固定落差", () => {
    expect(backgroundBusGainDb(-15, 1)).toBe(childBusGainDb(1) + BACKGROUND_OFFSET_DB);
  });

  it("能量档位只做小幅倾斜，不决定整层响度", () => {
    const quiet = backgroundBusGainDb(-17, 1);
    const driving = backgroundBusGainDb(-13, 1);
    expect(driving - quiet).toBeLessThanOrEqual(4);
    expect(driving).toBeGreaterThan(quiet);
  });

  it("背景与儿童总线的落差保持在能听见的范围内", () => {
    // 落差按听感定为几 dB：再大背景就听不清（-9 时代的问题），
    // 再小孩子的原声就不再是主线。上下界都要守住。
    const gap = childBusGainDb(2) - backgroundBusGainDb(-15, 2);
    expect(gap).toBeGreaterThanOrEqual(2);
    expect(gap).toBeLessThanOrEqual(8);
  });

  it("无论哪个能量档，背景都严格低于儿童总线", () => {
    // PRD 要求背景不能压过儿童原声；能量档的 ±2dB 倾斜不能把这条突破。
    ([-17, -15, -13] as const).forEach((layerGainDb) => {
      [1, 2, 4].forEach((overlap) => {
        expect(backgroundBusGainDb(layerGainDb, overlap)).toBeLessThan(childBusGainDb(overlap));
      });
    });
  });

  it("作品越密集，背景跟着一起压低", () => {
    expect(backgroundBusGainDb(0, 4)).toBeLessThan(backgroundBusGainDb(0, 1));
  });

  it("声部平衡围绕 0 分布，不把整层平白压低", () => {
    const trims = (["pad", "pulse", "mallet", "pluck", "bass"] as const).map((voice) => voiceTrimDb(voice));
    const mean = trims.reduce((sum, value) => sum + value, 0) / trims.length;
    expect(Math.abs(mean)).toBeLessThanOrEqual(0.5);
  });
});

describe("闪避深度随原声强弱变化", () => {
  it("没有原声在响时不闪避", () => {
    expect(duckDepthDb([])).toBe(0);
  });

  it("孩子越响，背景让得越多", () => {
    expect(duckDepthDb([-10])).toBeLessThan(duckDepthDb([-1]));
    expect(duckDepthDb([-10])).toBeGreaterThanOrEqual(MIN_DUCK_DB);
    expect(duckDepthDb([-1])).toBeLessThanOrEqual(MAX_DUCK_DB);
  });

  it("多个原声同时出现时再多让一点", () => {
    expect(duckDepthDb([-5, -5])).toBeGreaterThan(duckDepthDb([-5]));
  });

  it("再密集也不超过上限", () => {
    expect(duckDepthDb([-1, -1, -1, -1])).toBeLessThanOrEqual(MAX_DUCK_DB);
  });
});

describe("同时发声数", () => {
  it("数出真正的最大重叠", () => {
    expect(maxSimultaneousSounds([
      { start: 0, end: 5 },
      { start: 1, end: 2 },
      { start: 1.5, end: 4 },
      { start: 8, end: 9 },
    ])).toBe(3);
  });

  it("首尾相接不算重叠", () => {
    expect(maxSimultaneousSounds([{ start: 0, end: 2 }, { start: 2, end: 4 }])).toBe(1);
  });

  it("没有声音时按一个算", () => {
    expect(maxSimultaneousSounds([])).toBe(1);
  });
});

describe("结尾淡出", () => {
  it("长作品收得比短作品从容", () => {
    expect(endingFadeSeconds(45)).toBeGreaterThan(endingFadeSeconds(20));
  });

  it("三档时长都拿到不同且合理的淡出", () => {
    expect(endingFadeSeconds(20)).toBeLessThan(endingFadeSeconds(30));
    expect(endingFadeSeconds(30)).toBeLessThan(endingFadeSeconds(45));
    expect(endingFadeSeconds(20)).toBeGreaterThanOrEqual(0.6);
    expect(endingFadeSeconds(45)).toBeLessThanOrEqual(1.8);
  });
});

describe("声部平衡", () => {
  it("和弦声部比单音声部低，避免长和弦盖住短回应", () => {
    expect(voiceTrimDb("pad")).toBeLessThan(voiceTrimDb("mallet"));
    expect(voiceTrimDb("bass")).toBeLessThan(voiceTrimDb("pluck"));
  });

  it("超过三个音才继续往下压", () => {
    expect(voiceTrimDb("pad", 3)).toBe(voiceTrimDb("pad", 1));
    expect(voiceTrimDb("pad", 5)).toBeLessThan(voiceTrimDb("pad", 3));
  });

  it("以三音和弦为基准：常见写法不被压低，更厚的和弦才收", () => {
    expect(polyphonyVelocity(0.3, 3)).toBe(0.3);
    expect(polyphonyVelocity(0.3, 1)).toBe(0.3);
    expect(polyphonyVelocity(0.3, 5)).toBeLessThan(0.3);
  });

  it("再怎么压也保留可听的下限", () => {
    expect(polyphonyVelocity(0.05, 8)).toBeGreaterThanOrEqual(0.02);
  });
});

describe("声像", () => {
  it("背景声部左右散开，不全挤在中间", () => {
    const pans = (["pad", "pulse", "mallet", "pluck"] as const).map(voicePan);
    expect(new Set(pans).size).toBeGreaterThan(1);
    expect(pans.some((pan) => pan < 0)).toBe(true);
    expect(pans.some((pan) => pan > 0)).toBe(true);
  });

  it("低音留在中间，避免低频偏向一侧", () => {
    expect(voicePan("bass")).toBe(0);
  });

  it("所有声像都在合法范围内", () => {
    (["pad", "pulse", "mallet", "pluck", "bass"] as const).forEach((voice) => {
      expect(Math.abs(voicePan(voice))).toBeLessThanOrEqual(1);
    });
  });
});

describe("音色底色落到音频参数", () => {
  const soft = { brightness: 0.15, space: 0.8, attackShape: "soft" as const };
  const bright = { brightness: 0.9, space: 0.1, attackShape: "sharp" as const };

  it("越亮滤波开得越大", () => {
    expect(backgroundToneSettings(bright).cutoffHz).toBeGreaterThan(backgroundToneSettings(soft).cutoffHz * 3);
  });

  it("空间量越大混响越多、余韵越长", () => {
    expect(backgroundToneSettings(soft).reverbWet).toBeGreaterThan(backgroundToneSettings(bright).reverbWet);
    expect(backgroundToneSettings(soft).reverbDecaySeconds).toBeGreaterThan(backgroundToneSettings(bright).reverbDecaySeconds);
  });

  it("混响始终克制，不会糊住留白", () => {
    expect(backgroundToneSettings({ brightness: 1, space: 1, attackShape: "natural" }).reverbWet).toBeLessThanOrEqual(0.26);
  });

  it("起音形态影响铺底与短音的进入速度", () => {
    expect(backgroundToneSettings(soft).padAttackSeconds).toBeGreaterThan(backgroundToneSettings(bright).padAttackSeconds);
    expect(backgroundToneSettings(bright).shortAttackSeconds).toBeLessThan(backgroundToneSettings(soft).shortAttackSeconds);
  });

  it("没有底色时退回中性设置，旧作品仍可播放", () => {
    const neutral = backgroundToneSettings();
    expect(neutral.cutoffHz).toBeGreaterThan(900);
    expect(neutral.cutoffHz).toBeLessThan(9000);
    expect(neutral.reverbWet).toBeGreaterThan(0);
  });

  it("移调后的音高仍落在合成器好听的音域内", () => {
    expect(clampMidi(20)).toBe(28);
    expect(clampMidi(120)).toBe(88);
    expect(clampMidi(60)).toBe(60);
  });
});

