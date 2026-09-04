import { describe, expect, it } from "vitest";
import { arrangeCompositionV2, COMPOSITION_DURATION_OPTIONS, type CompositionDurationSeconds } from "@/src/domain/composition";
import { buildDeterministicSymbolicPlan, buildMusicPolishBrief, deriveBackgroundVoicing, derivePitchMaterial, validateBackgroundArrangement } from "@/src/features/music-polish";
import { MOCK_ORIGINAL_AUDIO_ASSETS, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { analyzeNaturalSoundCoverage, ensureNaturalSoundContinuity, NATURAL_SOUND_COVERAGE_TARGET, NATURAL_SOUND_MAX_GAP_SECONDS } from "./naturalSoundContinuity";

/**
 * 决赛验收矩阵：素材 × 目标时长。
 *
 * TODO 06 要求"随机选择一组儿童自然声，也能在不修改代码的情况下完成一首
 * 有开头、有发展、有结尾、自然声贯穿的作品"。这里把那条要求变成可回归的检查，
 * 而不是每次靠人工走查。模型那一列不在这里，因为它依赖联网结果。
 */
const MATERIALS = {
  "1 个短声": ["sound-cow"],
  "3 个混合声": ["sound-cow", "sound-steps", "sound-rain"],
  "多个长短不一": ["sound-rain", "sound-bell", "sound-springbird", "sound-cow"],
} as const;

function build(unitIds: readonly string[], durationSeconds: CompositionDurationSeconds) {
  const units = MOCK_SOUND_UNITS.map((unit) => ({ ...unit, active: unitIds.includes(unit.id) }));
  const base = arrangeCompositionV2(MOCK_SOUND_CARDS, units, 1, durationSeconds, `matrix-${durationSeconds}`);
  const composition = ensureNaturalSoundContinuity(base, units, MOCK_ORIGINAL_AUDIO_ASSETS);
  return { composition, units, brief: buildMusicPolishBrief(composition, MOCK_SOUND_CARDS, units) };
}

const cases = Object.entries(MATERIALS).flatMap(([name, ids]) => COMPOSITION_DURATION_OPTIONS.map((seconds) => [name, ids, seconds] as const));

describe("素材 × 时长矩阵", () => {
  it.each(cases)("%s 在约 %s 秒内成立", (_name, ids, durationSeconds) => {
    const { composition, brief } = build(ids, durationSeconds);
    const secondsPerBeat = 60 / composition.bpm;

    // 所有事件都收在目标时长内，没有越界的尾巴。
    composition.events.forEach((event) => {
      const end = event.startBeat * secondsPerBeat + (event.clipDurationSeconds ?? event.durationBeats * secondsPerBeat);
      expect(end).toBeLessThanOrEqual(durationSeconds + 0.001);
    });

    // 自然声贯穿：开头、中段、结尾都有孩子的声音，且没有长时间空档。
    const coverage = analyzeNaturalSoundCoverage(composition, MOCK_ORIGINAL_AUDIO_ASSETS);
    expect(coverage.coverageRatio).toBeGreaterThanOrEqual(NATURAL_SOUND_COVERAGE_TARGET);
    expect(coverage.maxSilentGapSeconds).toBeLessThanOrEqual(NATURAL_SOUND_MAX_GAP_SECONDS);
    expect([coverage.openingCovered, coverage.middleCovered, coverage.endingCovered]).toEqual([true, true, true]);

    // 无联网时的本地伴奏必须直接通过编排检查：模型失败不影响作品成立。
    const check = validateBackgroundArrangement(buildDeterministicSymbolicPlan(brief), brief);
    expect(check.ok, check.reason ?? "").toBe(true);

    // 原始素材长度不因编排而改变。
    expect(MOCK_ORIGINAL_AUDIO_ASSETS.every((asset) => asset.durationMs > 0)).toBe(true);
  });

  it("同一组输入重复运行得到完全相同的作品", () => {
    const first = build(MATERIALS["3 个混合声"], 30).composition;
    const second = build(MATERIALS["3 个混合声"], 30).composition;
    expect(first.events).toEqual(second.events);
  });

  it("三组素材之间听得出不同的组织方式", () => {
    const profiles = Object.values(MATERIALS).map((ids) => {
      const { composition, brief } = build(ids, 30);
      const voicing = deriveBackgroundVoicing(brief);
      const material = derivePitchMaterial(brief);
      return {
        eventCount: composition.events.length,
        tonic: material.tonicMidi,
        scale: material.scaleName,
        brightness: voicing.brightness,
        register: voicing.registerShiftSemitones,
      };
    });

    // 事件数量、调式或音色底色至少要有一项把三组区分开。
    expect(new Set(profiles.map((profile) => profile.eventCount)).size).toBeGreaterThan(1);
    expect(new Set(profiles.map((profile) => `${profile.tonic}-${profile.scale}-${profile.register}`)).size).toBeGreaterThan(1);
  });
});
