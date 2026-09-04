import { describe, expect, it } from "vitest";
import { arrangeCompositionV1 } from "@/src/domain/composition";
import { MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { buildMusicPolishBrief } from "./buildMusicPolishBrief";
import { repairSymbolicMusicPlan } from "./repairBackgroundArrangement";
import { NO_ONSET_TAIL_SECONDS, validateBackgroundArrangement } from "./validateBackgroundArrangement";

const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1, 30);
const brief = buildMusicPolishBrief(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS);

const wellFormed = {
  version: "symbolic-music-plan-v1",
  bpm: composition.bpm,
  durationSeconds: 30,
  events: [
    { startSeconds: 0.5, durationSeconds: 8, midiNotes: [48, 52, 55], voice: "pad", velocity: 0.12 },
    { startSeconds: 10, durationSeconds: 9, midiNotes: [50, 53, 57], voice: "pad", velocity: 0.14 },
    { startSeconds: 22, durationSeconds: 7.8, midiNotes: [48, 52, 55], voice: "pad", velocity: 0.1 },
  ],
};

describe("格式问题一律修补，不丢音乐", () => {
  it("漏写版本号、时长写错都只是修补，不作废", () => {
    const { plan, repairs } = repairSymbolicMusicPlan({ ...wellFormed, version: undefined, durationSeconds: 28.4 }, brief);

    expect(plan?.version).toBe("symbolic-music-plan-v1");
    expect(plan?.durationSeconds).toBe(30);
    expect(plan?.events).toHaveLength(3);
    expect(repairs).toContain("补写方案版本号");
    expect(repairs).toContain("把时长对齐到作品长度");
  });

  it("越界的音高、力度和长度收进范围而不是整份丢掉", () => {
    const { plan, repairs } = repairSymbolicMusicPlan({
      ...wellFormed,
      events: [
        { startSeconds: 0.5, durationSeconds: 100, midiNotes: [200, 48], voice: "pad", velocity: 9 },
        ...wellFormed.events.slice(1),
      ],
    }, brief);

    const patched = plan!.events[0];
    expect(patched.midiNotes.every((note) => note >= 36 && note <= 84)).toBe(true);
    expect(patched.velocity).toBeLessThanOrEqual(0.5);
    expect(patched.startSeconds + patched.durationSeconds).toBeLessThanOrEqual(30);
    expect(repairs.some((repair) => repair.includes("收进范围"))).toBe(true);
  });

  it("不认识的声部退回长音，而不是让整首失败", () => {
    const { plan } = repairSymbolicMusicPlan({
      ...wellFormed,
      events: [{ ...wellFormed.events[0], voice: "violin" }, ...wellFormed.events.slice(1)],
    }, brief);

    expect(plan!.events[0].voice).toBe("pad");
  });

  it("完全不是音符方案时才判定不可用", () => {
    expect(repairSymbolicMusicPlan({ hello: "world" }, brief).plan).toBeNull();
    expect(repairSymbolicMusicPlan({ ...wellFormed, events: [] }, brief).plan).toBeNull();
  });

  it("已经合规的方案不做多余改动", () => {
    const { plan, repairs } = repairSymbolicMusicPlan(wellFormed, brief);

    expect(plan!.events.map((event) => event.startSeconds)).toEqual([0.5, 10, 22]);
    expect(plan!.events.map((event) => event.midiNotes)).toEqual(wellFormed.events.map((event) => event.midiNotes));
    expect(repairs).toEqual([]);
  });
});

describe("结尾修补", () => {
  it("去掉结尾新起的音，并把最后的长音延长到末尾", () => {
    const abrupt = {
      ...wellFormed,
      events: [
        ...wellFormed.events.slice(0, 2),
        { startSeconds: 22, durationSeconds: 3, midiNotes: [48, 52, 55], voice: "pad", velocity: 0.1 },
        { startSeconds: 29.5, durationSeconds: 0.4, midiNotes: [72], voice: "pluck", velocity: 0.2 },
      ],
    };
    const { plan, repairs } = repairSymbolicMusicPlan(abrupt, brief);
    const lastOnset = Math.max(...plan!.events.map((event) => event.startSeconds));
    const lastEnd = Math.max(...plan!.events.map((event) => event.startSeconds + event.durationSeconds));

    expect(lastOnset).toBeLessThanOrEqual(30 - NO_ONSET_TAIL_SECONDS);
    expect(lastEnd).toBeGreaterThan(29);
    expect(lastEnd).toBeLessThanOrEqual(30);
    expect(repairs).toContain("删除结尾处新起的 1 个音");
    expect(repairs).toContain("把最后的长音延长到结尾");
    expect(validateBackgroundArrangement(plan, brief).ok).toBe(true);
  });
});

describe("死气修补", () => {
  // 孩子的声音只在开头出现，中段全靠伴奏：这时伴奏一停就是真的静场。
  const sparseBrief = {
    ...brief,
    soundEvents: brief.soundEvents.slice(0, 1).map((event) => ({ ...event, startSeconds: 0, endSeconds: 2 })),
  };

  it("留白放错位置时补上长音，而不是丢掉整份编排", () => {
    const withHole = {
      ...wellFormed,
      events: [
        { startSeconds: 0, durationSeconds: 6, midiNotes: [48, 52, 55], voice: "pad", velocity: 0.12 },
        { startSeconds: 20, durationSeconds: 9.5, midiNotes: [50, 53, 57], voice: "pad", velocity: 0.12 },
      ],
    };
    const { plan, repairs } = repairSymbolicMusicPlan(withHole, sparseBrief);
    const check = validateBackgroundArrangement(plan, sparseBrief);

    expect(plan).not.toBeNull();
    expect(repairs.some((repair) => repair.includes("空白"))).toBe(true);
    expect(check.ok).toBe(true);
  });

  it("补不上时才交给校验拒绝", () => {
    const onlyShortNotes = {
      ...wellFormed,
      events: [{ startSeconds: 29, durationSeconds: 0.3, midiNotes: [60], voice: "pluck", velocity: 0.2 }],
    };
    const { plan } = repairSymbolicMusicPlan(onlyShortNotes, sparseBrief);
    expect(validateBackgroundArrangement(plan, sparseBrief).ok).toBe(false);
  });
});

