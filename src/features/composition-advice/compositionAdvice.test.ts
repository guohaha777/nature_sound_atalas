import { describe, expect, it } from "vitest";
import { arrangeCompositionV1, attachCompositionContext } from "@/src/domain/composition";
import { MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { buildCompositionAdviceBrief, buildCompositionAdvicePrompt, buildLocalCompositionAdvice, compositionAdviceResultSchema, hasMusicCreationValue } from "./compositionAdvice";

describe("composition advice", () => {
  it("builds an anonymous brief without names, places, labels, photos, or audio", () => {
    const composition = attachCompositionContext(arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1), MOCK_SOUND_UNITS, "run-deterministic-arranger");
    const brief = buildCompositionAdviceBrief(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS);
    const serialized = JSON.stringify(brief);
    expect(brief.sounds).toHaveLength(composition.soundUnitIds.length);
    expect(serialized).not.toContain(MOCK_SOUND_CARDS[0].owner);
    expect(serialized).not.toContain(MOCK_SOUND_CARDS[0].place);
    expect(serialized).not.toContain(MOCK_SOUND_CARDS[0].source.label);
    expect(serialized).not.toContain("audio-");
  });

  it("keeps background optional when the child sounds are already rich", () => {
    const units = [...MOCK_SOUND_UNITS, { ...MOCK_SOUND_UNITS[0], id: "unit-extra-rich", active: true }];
    const composition = attachCompositionContext(arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1), units, "run-deterministic-arranger");
    const advice = buildLocalCompositionAdvice(composition, MOCK_SOUND_CARDS, units);
    expect(advice).toMatchObject({ sourceKind: "local_rules", backgroundRecommendation: { value: "not-needed" } });
    expect(advice.roles).toHaveLength(composition.soundUnitIds.length);
  });

  it("rejects advice outside the child-safe structured vocabulary", () => {
    expect(compositionAdviceResultSchema.safeParse({
      confidence: 0.9,
      roles: [{ soundIndex: 1, role: "composer", reason: "不允许的角色" }],
      backgroundRecommendation: { value: "helpful", reason: "可以试听。" },
      musicDiscovery: { concept: "therapy", childText: "错误", tryThis: "错误" },
    }).success).toBe(false);
  });

  it("asks the model for short lower-primary language and one practical action", () => {
    const composition = attachCompositionContext(arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1), MOCK_SOUND_UNITS, "run-deterministic-arranger");
    const prompt = buildCompositionAdvicePrompt(buildCompositionAdviceBrief(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS));
    expect(prompt).toContain("小学低年级儿童");
    expect(prompt).toContain("这对音乐创作有什么用");
    expect(prompt).toContain("孩子要听出或比较什么变化");
    expect(prompt).toContain("不要使用音域、声部、织体、密度、动态、层次");
    expect(prompt).toContain('"role":"lead"');
    expect(prompt).toContain("字段名和枚举值必须使用下面的英文");
  });

  it("keeps local discoveries short and free of specialist wording", () => {
    const composition = attachCompositionContext(arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1), MOCK_SOUND_UNITS, "run-deterministic-arranger");
    const discovery = buildLocalCompositionAdvice(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS).musicDiscovery;
    expect(discovery.childText.length).toBeLessThanOrEqual(60);
    expect(discovery.tryThis.length).toBeLessThanOrEqual(60);
    expect(`${discovery.childText}${discovery.tryThis}`).not.toMatch(/音域|声部|织体|密度|动态|层次|动机|和声/);
    expect(hasMusicCreationValue(discovery)).toBe(true);
  });

  it("rejects a friendly metaphor that does not explain a music-making use", () => {
    expect(hasMusicCreationValue({ concept: "repetition", childText: "有的声音重复出现，像是在排队。", tryThis: "再听一次。" })).toBe(false);
    expect(hasMusicCreationValue({ concept: "repetition", childText: "同一个声音重复出现。重复会让耳朵记住这段音乐。", tryThis: "把它隔开重复三次，听听像不像一句歌。" })).toBe(true);
  });
});
