import { describe, expect, it } from "vitest";
import { arrangeCompositionV2, attachCompositionContext } from "@/src/domain/composition";
import { MOCK_ORIGINAL_AUDIO_ASSETS, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { normalizeEditableSourceClips } from "@/src/features/sound-world";
import { buildMusicPolishBrief } from "./buildMusicPolishBrief";
import { buildDeterministicSymbolicPlan } from "./buildDeterministicSymbolicPlan";
import { MAX_BACKGROUND_LED_RATIO, MAX_COMBINED_SILENCE_SECONDS, NO_ONSET_TAIL_SECONDS, validateBackgroundArrangement } from "./validateBackgroundArrangement";
import type { MusicPolishBrief } from "../contracts";

function briefFor(options: { unitIds: string[]; durationSeconds?: number; valence?: number; arousal?: number }): MusicPolishBrief {
  const units = MOCK_SOUND_UNITS.map((unit) => ({ ...unit, active: options.unitIds.includes(unit.id) }));
  const base = normalizeEditableSourceClips(
    arrangeCompositionV2(MOCK_SOUND_CARDS, units, 1, options.durationSeconds ?? 30, "plan-test"),
    MOCK_ORIGINAL_AUDIO_ASSETS,
  );
  const composition = attachCompositionContext({
    ...base,
    emotionIntent: options.valence === undefined && options.arousal === undefined
      ? base.emotionIntent
      : { enabled: true, valence: options.valence ?? 0, arousal: options.arousal ?? 0, label: null, mappingVersion: "emotion-mapping-v1" as const },
  }, units, "run-deterministic-arranger");
  return buildMusicPolishBrief(composition, MOCK_SOUND_CARDS, units);
}

describe("本地伴奏方案遵循编排原则", () => {
  const brief = briefFor({ unitIds: ["sound-rain", "sound-cow", "sound-steps"] });

  it("通过与提示词同一套编排检查", () => {
    const check = validateBackgroundArrangement(buildDeterministicSymbolicPlan(brief), brief);
    expect(check.ok).toBe(true);
    expect(check.reason).toBeNull();
  });

  it("以孩子的原声为主：背景领奏时间远低于三成", () => {
    const { signals } = validateBackgroundArrangement(buildDeterministicSymbolicPlan(brief), brief);
    expect(signals.backgroundLedRatio).toBeLessThanOrEqual(MAX_BACKGROUND_LED_RATIO);
    expect(signals.sectionChanges).toBeGreaterThan(0);
    expect(signals.endingFadesOut).toBe(true);
  });

  it("每个段落都有伴奏，段落之间的和声会变化", () => {
    const plan = buildDeterministicSymbolicPlan(brief);
    const pads = plan.events.filter((event) => event.voice === "pad");
    brief.sections.forEach((section) => {
      expect(plan.events.some((event) => event.startSeconds < section.endSeconds && event.startSeconds + event.durationSeconds > section.startSeconds)).toBe(true);
    });
    expect(new Set(pads.map((pad) => pad.midiNotes.join(","))).size).toBeGreaterThan(1);
  });

  it("结尾落回主音的长音，且最后一段时间不再有新起音", () => {
    const plan = buildDeterministicSymbolicPlan(brief);
    const lastOnset = Math.max(...plan.events.map((event) => event.startSeconds));
    const lastEnd = Math.max(...plan.events.map((event) => event.startSeconds + event.durationSeconds));
    const ending = plan.events.filter((event) => event.voice === "pad").at(-1)!;

    expect(lastOnset).toBeLessThanOrEqual(brief.durationSeconds - NO_ONSET_TAIL_SECONDS);
    expect(lastEnd).toBeGreaterThan(brief.durationSeconds - 3);
    expect(lastEnd).toBeLessThanOrEqual(brief.durationSeconds);
    expect(ending.velocity).toBeLessThan(Math.max(...plan.events.map((event) => event.velocity)));
  });

  it("孩子的声音正在响时不加入新的短音符", () => {
    const plan = buildDeterministicSymbolicPlan(brief);
    const shortVoices = plan.events.filter((event) => event.voice !== "pad");
    const collisions = shortVoices.filter((event) => brief.soundEvents.some((child) => (
      event.startSeconds >= child.startSeconds && event.startSeconds <= child.endSeconds - 0.15
    )));
    expect(collisions).toEqual([]);
  });

  it("不会从头铺到尾，给孩子的原声留出位置", () => {
    const plan = buildDeterministicSymbolicPlan(brief);
    const sounding = plan.events.reduce((sum, event) => sum + event.durationSeconds, 0);
    expect(sounding).toBeLessThan(brief.durationSeconds * 2.2);
  });
});

describe("不同变量要产生听得出的差别", () => {
  it("情绪明暗改变和弦色彩", () => {
    const bright = buildDeterministicSymbolicPlan(briefFor({ unitIds: ["sound-rain", "sound-cow"], valence: 0.8, arousal: 0.1 }));
    const blue = buildDeterministicSymbolicPlan(briefFor({ unitIds: ["sound-rain", "sound-cow"], valence: -0.8, arousal: 0.1 }));
    const chordOf = (plan: typeof bright) => plan.events.find((event) => event.voice === "pad")!.midiNotes.map((note, index, all) => note - all[0]);

    expect(chordOf(bright)).not.toEqual(chordOf(blue));
  });

  it("情绪的激动程度改变律动密度", () => {
    const calm = buildDeterministicSymbolicPlan(briefFor({ unitIds: ["sound-rain", "sound-cow"], valence: 0, arousal: -0.8 }));
    const excited = buildDeterministicSymbolicPlan(briefFor({ unitIds: ["sound-rain", "sound-cow"], valence: 0, arousal: 0.8 }));

    expect(excited.events.filter((event) => event.voice === "bass").length)
      .toBeGreaterThan(calm.events.filter((event) => event.voice === "bass").length);
  });

  it("换一组声音会得到不同的伴奏", () => {
    const first = buildDeterministicSymbolicPlan(briefFor({ unitIds: ["sound-rain", "sound-cow"] }));
    const second = buildDeterministicSymbolicPlan(briefFor({ unitIds: ["sound-bell", "sound-springbird", "sound-steps"] }));

    expect(JSON.stringify(first.events)).not.toBe(JSON.stringify(second.events));
  });

  it("同一份输入结果稳定，便于复现", () => {
    const brief = briefFor({ unitIds: ["sound-rain", "sound-cow"] });
    expect(buildDeterministicSymbolicPlan(brief)).toEqual(buildDeterministicSymbolicPlan(brief));
  });
});

describe("只保留真正会毁掉作品的硬规则", () => {
  const brief = briefFor({ unitIds: ["sound-rain", "sound-cow"] });
  const good = buildDeterministicSymbolicPlan(brief);

  it("挡住空方案", () => {
    expect(validateBackgroundArrangement({ ...good, events: [] }, brief).ok).toBe(false);
    expect(validateBackgroundArrangement(null, brief).ok).toBe(false);
  });

  it("挡住既没有伴奏也没有原声的死气", () => {
    const withHole = { ...good, events: good.events.filter((event) => event.startSeconds < 2 || event.startSeconds > brief.durationSeconds - 4) };
    const check = validateBackgroundArrangement(withHole, brief);

    if (check.signals.longestCombinedSilenceSeconds > MAX_COMBINED_SILENCE_SECONDS) {
      expect(check.ok).toBe(false);
      expect(check.reason).toContain("既没有伴奏也没有孩子的声音");
    }
  });

  it("孩子的声音稀疏时，旋律一路铺满就是抢主角，要挡住", () => {
    // 只有一个很短的声音：这时背景一路大声唱，孩子就成了配角。
    const sparseBrief = briefFor({ unitIds: ["sound-cow"] });
    const loudCarpet = {
      version: "symbolic-music-plan-v1" as const,
      bpm: sparseBrief.bpm,
      durationSeconds: sparseBrief.durationSeconds,
      // 旋律声部一路唱到底：这才是"背景抢了主角"。
      events: [{ startSeconds: 0, durationSeconds: sparseBrief.durationSeconds - 0.2, midiNotes: [60], voice: "mallet" as const, velocity: 0.4 }],
    };
    const check = validateBackgroundArrangement(loudCarpet, sparseBrief);

    expect(check.ok).toBe(false);
    expect(check.reason).toContain("背景抢了主角");
    expect(check.signals.backgroundLedRatio).toBeGreaterThan(MAX_BACKGROUND_LED_RATIO);
  });

  it("孩子的声音密集时，同样的旋律被原声盖过，占比自然更低", () => {
    const denseBrief = briefFor({ unitIds: ["sound-rain", "sound-cow", "sound-steps"] });
    const bedding = {
      version: "symbolic-music-plan-v1" as const,
      bpm: denseBrief.bpm,
      durationSeconds: denseBrief.durationSeconds,
      events: [{ startSeconds: 0, durationSeconds: denseBrief.durationSeconds - 0.2, midiNotes: [60], voice: "mallet" as const, velocity: 0.4 }],
    };

    expect(validateBackgroundArrangement(bedding, denseBrief).signals.backgroundLedRatio)
      .toBeLessThan(validateBackgroundArrangement(bedding, briefFor({ unitIds: ["sound-cow"] })).signals.backgroundLedRatio);
  });

  it("长音托底不算抢主角，哪怕铺满整首", () => {
    const bed = {
      ...good,
      events: [{ startSeconds: 0, durationSeconds: brief.durationSeconds - 0.2, midiNotes: [48, 52, 55], voice: "pad" as const, velocity: 0.4 }],
    };
    expect(validateBackgroundArrangement(bed, brief).ok).toBe(true);
  });

  it("结尾问题交给修补，不再作为拒绝理由", () => {
    const abrupt = { ...good, events: [...good.events, { startSeconds: brief.durationSeconds - 0.3, durationSeconds: 0.2, midiNotes: [60], voice: "pluck" as const, velocity: 0.15 }] };
    expect(validateBackgroundArrangement(abrupt, brief).ok).toBe(true);
  });
});
