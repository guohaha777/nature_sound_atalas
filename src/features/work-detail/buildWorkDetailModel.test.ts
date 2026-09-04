import { describe, expect, it } from "vitest";
import { arrangeCompositionV1, attachCompositionContext } from "@/src/domain/composition";
import { buildLocalCompositionAdvice } from "@/src/features/composition-advice";
import { MOCK_ORIGINAL_AUDIO_ASSETS, MOCK_PROJECT, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { buildWorkDetailModel } from "./buildWorkDetailModel";

function savedComposition() {
  const arranged = attachCompositionContext(arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 3), MOCK_SOUND_UNITS, "run-deterministic-arranger");
  return {
    ...arranged,
    events: arranged.events.map((event, index) => index === 0 ? { ...event, startBeat: 28 } : event),
    title: "八月的声音",
    createdAt: "2026-08-11T10:00:00.000Z",
    savedAt: "2026-08-11T10:01:00.000Z",
    teachingAdvice: buildLocalCompositionAdvice(arranged, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS),
  };
}

describe("buildWorkDetailModel", () => {
  it("loads only the saved work whose id matches the route", () => {
    const composition = savedComposition();
    const model = buildWorkDetailModel({ workId: composition.id, composition, projectName: MOCK_PROJECT.name, units: MOCK_SOUND_UNITS, audioAssets: MOCK_ORIGINAL_AUDIO_ASSETS });
    expect(model).toMatchObject({ title: "八月的声音", contributorNames: ["系统"] });
    expect(model?.units).toHaveLength(3);
    expect(model?.audibleDurationSeconds).toBe(composition.durationSeconds);
    expect(model?.musicDiscovery).toMatchObject({ sourceLabel: "本地规则整理" });
    expect(model?.musicDiscovery?.childText).toBeTruthy();
    expect(buildWorkDetailModel({ workId: "missing", composition, projectName: MOCK_PROJECT.name, units: MOCK_SOUND_UNITS, audioAssets: MOCK_ORIGINAL_AUDIO_ASSETS })).toBeNull();
  });

  it("does not present an autosaved draft as an archived work", () => {
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1);
    expect(buildWorkDetailModel({ workId: composition.id, composition, projectName: MOCK_PROJECT.name, units: MOCK_SOUND_UNITS, audioAssets: MOCK_ORIGINAL_AUDIO_ASSETS })).toBeNull();
  });
});

describe("归档记录背景来源", () => {
  it("记下用的是哪种背景，以及为什么没用上模型", () => {
    const units = MOCK_SOUND_UNITS.map((unit, index) => ({ ...unit, active: index < 2 }));
    const base = arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1);
    const composition = {
      ...base,
      savedAt: "2026-08-31T00:00:00.000Z",
      polishEnabled: true,
      polishLayer: {
        id: "local-score-1",
        compositionRevision: base.revision,
        sourceKind: "local_fallback" as const,
        provider: "wanwu-deterministic-score",
        model: null,
        promptVersion: "symbolic-music-plan-v1",
        defaultGainDb: -15,
        basedOnInputHash: "fnv1a-00000000",
        fallbackReason: "model-rejected" as const,
      },
    };

    const model = buildWorkDetailModel({ workId: composition.id, composition, projectName: "测试", units, audioAssets: MOCK_ORIGINAL_AUDIO_ASSETS })!;

    expect(model.background).toEqual({
      label: "系统自带的伴奏",
      note: "AI 写的伴奏没通过编排检查，换成了系统自带的。",
      enabled: true,
      repairs: [],
      toneNote: null,
      expiredNote: null,
    });
  });

  it("记下保存时做过的修补和当时的音色底色，便于回溯", () => {
    const units = MOCK_SOUND_UNITS.map((unit, index) => ({ ...unit, active: index < 2 }));
    const base = arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1);
    const composition = {
      ...base,
      savedAt: "2026-08-31T00:00:00.000Z",
      polishEnabled: true,
      polishLayer: {
        id: "symbolic-ai-1",
        compositionRevision: base.revision,
        sourceKind: "symbolic_ai" as const,
        provider: "dashscope.aliyuncs.com",
        model: "qwen",
        promptVersion: "symbolic-music-plan-v1",
        defaultGainDb: -15,
        basedOnInputHash: "fnv1a-00000000",
        arrangementRepairs: ["补写方案版本号", "把最后的长音延长到结尾"],
        voicing: { version: "background-voicing-v1" as const, brightness: 0.2, space: 0.8, registerShiftSemitones: -5, attackShape: "soft" as const, colorTilt: -0.3 },
      },
      contextAnalysis: {
        version: "composition-context-v1" as const,
        selectedSoundCount: 2,
        eventCount: base.events.length,
        pitchBandCounts: { high: 1, mid: 1, low: 0 },
        density: "balanced" as const,
        exactOverlapGroups: 0,
        status: "ready" as const,
        notice: null,
        decision: "preserve-child-arrangement" as const,
        reason: "保留孩子已经摆好的位置。",
      },
    };

    const model = buildWorkDetailModel({ workId: composition.id, composition, projectName: "测试", units, audioAssets: MOCK_ORIGINAL_AUDIO_ASSETS })!;

    expect(model.background.label).toBe("AI 写的音符伴奏");
    expect(model.background.repairs).toEqual(["补写方案版本号", "把最后的长音延长到结尾"]);
    expect(model.background.toneNote).toContain("偏暗");
    expect(model.background.toneNote).toContain("腾出位置");
    expect(model.agentDecision).toEqual({ label: "保留孩子自己的摆放", reason: "保留孩子已经摆好的位置。" });
  });

  it("临时音频链接过期时说明基础作品照常播放", () => {
    const units = MOCK_SOUND_UNITS.map((unit, index) => ({ ...unit, active: index < 2 }));
    const base = arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1);
    const expiredLayer = {
      id: "live-ai-1",
      compositionRevision: base.revision,
      sourceKind: "live_ai" as const,
      provider: "aliyun-bailian",
      model: "fun-music",
      promptVersion: "fun-music-prompt-v2",
      defaultGainDb: -15,
      basedOnInputHash: "fnv1a-00000000",
      audioUrl: "https://example.com/a.mp3",
      audioAssetId: "audio-1",
      audioExpiresAt: Math.floor(Date.now() / 1000) - 60,
    };
    const composition = { ...base, savedAt: "2026-08-31T00:00:00.000Z", polishEnabled: true, polishLayer: expiredLayer };

    const model = buildWorkDetailModel({ workId: composition.id, composition, projectName: "测试", units, audioAssets: MOCK_ORIGINAL_AUDIO_ASSETS })!;

    expect(model.background.expiredNote).toContain("孩子的原声和编排");
    expect(model.background.label).toBe("AI 生成的背景音乐");
  });

  it("没有背景时如实说明", () => {
    const units = MOCK_SOUND_UNITS.map((unit, index) => ({ ...unit, active: index < 2 }));
    const composition = { ...arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1), savedAt: "2026-08-31T00:00:00.000Z", polishLayer: null };
    const model = buildWorkDetailModel({ workId: composition.id, composition, projectName: "测试", units, audioAssets: MOCK_ORIGINAL_AUDIO_ASSETS })!;

    expect(model.background).toMatchObject({ label: "只有孩子的声音", note: null, repairs: [], expiredNote: null });
  });
});

