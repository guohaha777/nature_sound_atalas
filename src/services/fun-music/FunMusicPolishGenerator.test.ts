import { afterEach, describe, expect, it, vi } from "vitest";
import { arrangeCompositionV1 } from "@/src/domain/composition";
import { MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { FunMusicPolishGenerator } from "./FunMusicPolishGenerator";

describe("FunMusicPolishGenerator", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("stores only the checks that were actually completed", async () => {
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
    expect(layer.validation).toMatchObject({
      status: "basic-guarded",
      trustedSource: true,
      generatedDurationSeconds: 200,
      playbackDurationSeconds: composition.durationSeconds,
      gainLimited: true,
      voiceRiskCheck: "provider-request-only",
    });
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
      events: [{ startSeconds: 0, durationSeconds: 4, midiNotes: [48, 55, 60], voice: "pad", velocity: 0.12 }],
    };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ plan, provider: "dashscope.aliyuncs.com", model: "qwen3.7-max" })));
    const layer = await new FunMusicPolishGenerator().fallback(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS);
    expect(layer).toMatchObject({ sourceKind: "symbolic_ai", provider: "dashscope.aliyuncs.com", model: "qwen3.7-max", symbolicPlan: plan });
  });
});
