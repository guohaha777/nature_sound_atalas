import { afterEach, describe, expect, it, vi } from "vitest";
import { arrangeCompositionV1 } from "@/src/domain/composition";
import { MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { FunMusicPolishGenerator } from "./FunMusicPolishGenerator";

/**
 * 背景音频的裁剪走 Web Audio，node 测试环境没有实现。
 * 这里只替掉解码这一步，裁剪、淡入淡出和 WAV 编码仍然跑真实代码。
 */
function stubAudioDecoding(durationSeconds: number, sampleRate = 8_000, numberOfChannels = 2) {
  const length = Math.round(durationSeconds * sampleRate);
  const decoded = {
    duration: durationSeconds,
    length,
    sampleRate,
    numberOfChannels,
    getChannelData: () => new Float32Array(length).fill(0.5),
  };
  vi.stubGlobal("AudioContext", class {
    async decodeAudioData() { return decoded; }
    async close() {}
  });
  // 只挂上 createObjectURL，不替换 URL 构造器本身，
  // 否则 zod 的 z.string().url() 会连正常地址都判成 Invalid URL。
  const fitted: Blob[] = [];
  Reflect.set(URL, "createObjectURL", (blob: Blob) => {
    fitted.push(blob);
    return `blob:fitted-${fitted.length}`;
  });
  return fitted;
}

describe("FunMusicPolishGenerator", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(URL, "createObjectURL");
  });

  it("stores only the checks that were actually completed", async () => {
    const fitted = stubAudioDecoding(200);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      audioUrl: "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/test.mp3",
      audioId: "audio-test",
      expiresAt: 1_900_000_000,
      requestId: "request-test",
      provider: "aliyun-bailian",
      model: "fun-music-preview",
      promptVersion: "fun-music-prompt-v2",
      generatedDurationSeconds: 200,
      channels: 2,
      sampleRate: 48_000,
      instrumentalModeRequested: true,
    })));
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1);
    const layer = await new FunMusicPolishGenerator().generate(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS);

    expect(layer.defaultGainDb).toBe(-16);
    // 200 秒的模型输出必须真的被裁到作品时长，而不只是记一个较小的数字。
    expect(fitted).toHaveLength(1);
    expect(layer.audioUrl).toBe("blob:fitted-1");
    expect(await wavDurationSeconds(fitted[0])).toBeCloseTo(composition.durationSeconds, 2);
    expect(layer.validation).toMatchObject({
      status: "basic-guarded",
      trustedSource: true,
      generatedDurationSeconds: 200,
      playbackDurationSeconds: composition.durationSeconds,
      gainLimited: true,
      voiceRiskCheck: "provider-request-only",
    });
  });

  it("rejects a generated background that does not cover the whole composition", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      audioUrl: "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/short.mp3",
      audioId: "audio-short",
      expiresAt: 1_900_000_000,
      requestId: "request-short",
      provider: "aliyun-bailian",
      model: "fun-music-preview",
      promptVersion: "fun-music-prompt-v2",
      generatedDurationSeconds: 12,
      channels: 2,
      sampleRate: 48_000,
      instrumentalModeRequested: true,
    })));
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1, 30);

    await expect(new FunMusicPolishGenerator().generate(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS))
      .rejects.toThrow("已拒绝使用这段不完整背景");
  });

  it("marks the locally rendered fallback as having no recorded voice source", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "not configured" }, { status: 503 })));
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1);
    const layer = await new FunMusicPolishGenerator().fallback(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS);
    expect(layer.validation).toMatchObject({
      status: "local-verified",
      format: "local-synthesis",
      generatedDurationSeconds: null,
      voiceRiskCheck: "not-applicable",
    });
    expect(layer.symbolicPlan?.durationSeconds).toBe(composition.durationSeconds);
    expect(layer.sourceKind).toBe("local_fallback");
  });

  it("uses an LLM-written symbolic score when the plan endpoint succeeds", async () => {
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1, 15);
    const plan = {
      version: "symbolic-music-plan-v1",
      bpm: composition.bpm,
      durationSeconds: 15,
      // 段落有变化、留白给原声、结尾收住：符合当前的编排检查
      events: [
        { startSeconds: 0.3, durationSeconds: 2.7, midiNotes: [48, 55, 60], voice: "pad", velocity: 0.12 },
        { startSeconds: 4, durationSeconds: 3.5, midiNotes: [45, 52, 57], voice: "pad", velocity: 0.14 },
        { startSeconds: 8.4, durationSeconds: 0.5, midiNotes: [67], voice: "mallet", velocity: 0.16 },
        { startSeconds: 10.5, durationSeconds: 4.3, midiNotes: [43, 50, 55], voice: "pad", velocity: 0.09 },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ plan, provider: "dashscope.aliyuncs.com", model: "qwen3.7-max" })));
    const layer = await new FunMusicPolishGenerator().fallback(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS);
    expect(layer).toMatchObject({ sourceKind: "symbolic_ai", provider: "dashscope.aliyuncs.com", model: "qwen3.7-max", symbolicPlan: plan });
    expect(layer.fallbackReason).toBeUndefined();
  });

  it("falls back to the deterministic full-length score when an AI symbolic plan is sparse", async () => {
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1, 30);
    const sparsePlan = {
      version: "symbolic-music-plan-v1",
      bpm: composition.bpm,
      durationSeconds: 30,
      events: [{ startSeconds: 0, durationSeconds: 10, midiNotes: [48, 55, 60], voice: "pad", velocity: 0.12 }],
    };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ plan: sparsePlan, provider: "dashscope.aliyuncs.com", model: "qwen3.7-max" })));

    const layer = await new FunMusicPolishGenerator().fallback(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS);

    expect(layer.sourceKind).toBe("local_fallback");
    expect(layer.symbolicPlan?.durationSeconds).toBe(30);
    expect(layer.symbolicPlan).not.toEqual(sparsePlan);
    expect(layer.fallbackReason).toBe("model-rejected");
  });
});

/** 直接从 WAV 头读时长，确认裁剪落到了字节上。 */
async function wavDurationSeconds(blob: Blob): Promise<number> {
  const view = new DataView(await blob.arrayBuffer());
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const dataLength = view.getUint32(40, true);
  return dataLength / (channels * 2) / sampleRate;
}
