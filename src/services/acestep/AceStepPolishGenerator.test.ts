import { afterEach, describe, expect, it, vi } from "vitest";
import { arrangeCompositionV1 } from "@/src/domain/composition";
import { MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { AceStepPolishGenerator } from "./AceStepPolishGenerator";

// 编排渲染要用 Web Audio，node 测试环境没有实现。
// 这里只替掉渲染那一步，其余（提示词、请求组装、裁剪、标注）都跑真实代码。
const renderChildrenMix = vi.hoisted(() => vi.fn());
vi.mock("@/src/audio/editing/renderChildrenMix", () => ({ renderChildrenMix }));

/** 与 FunMusic 那份测试同样的做法：只替掉解码，裁剪和 WAV 编码仍是真实实现。 */
function stubAudioDecoding(durationSeconds: number, sampleRate = 8_000, numberOfChannels = 2) {
  const length = Math.round(durationSeconds * sampleRate);
  vi.stubGlobal("AudioContext", class {
    async decodeAudioData() {
      return { duration: durationSeconds, length, sampleRate, numberOfChannels, getChannelData: () => new Float32Array(length).fill(0.5) };
    }
    async close() {}
  });
  const fitted: Blob[] = [];
  Reflect.set(URL, "createObjectURL", (blob: Blob) => {
    fitted.push(blob);
    return `blob:fitted-${fitted.length}`;
  });
  return fitted;
}

function stubRenderedMix(durationSeconds: number) {
  renderChildrenMix.mockResolvedValue({
    blob: new Blob([new Uint8Array(16)], { type: "audio/wav" }),
    mimeType: "audio/wav",
    durationSeconds,
    arrangementDurationSeconds: durationSeconds - 4,
    tailSeconds: 4,
    sampleRate: 44_100,
    eventCount: 3,
  });
}

const plan = { composition: arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1), assets: {} };

describe("AceStepPolishGenerator", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    renderChildrenMix.mockReset();
    Reflect.deleteProperty(URL, "createObjectURL");
  });

  it("sends the rendered arrangement so the model hears the children's sounds", async () => {
    stubAudioDecoding(30);
    stubRenderedMix(24);
    const fetchMock = vi.fn(async () => new Response(new Uint8Array(16), {
      headers: { "X-Polish-Provider": "ace-step-local", "X-Polish-Model": "acestep-v15-base" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const composition = plan.composition;
    const layer = await new AceStepPolishGenerator(() => plan)
      .generate(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/music/lego");
    const form = init.body as FormData;
    // 三样输入缺一不可：混音让背景跟得上编排，两段文字让它压得住。
    expect(form.get("audio")).toBeInstanceOf(File);
    expect(String(form.get("prompt"))).toContain("absolutely no vocals");
    expect(String(form.get("globalCaption"))).toContain("arranged by young children");

    // 来源要如实标注成实时模型结果，不能和预渲染素材混为一谈。
    expect(layer.sourceKind).toBe("live_ai");
    expect(layer.provider).toBe("ace-step-local");
    expect(layer.model).toBe("acestep-v15-base");
    expect(layer.audioUrl).toBe("blob:fitted-1");
  });

  it("surfaces the server's message so the interface can offer Plan B", async () => {
    stubRenderedMix(24);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "本地音乐模型没有启动，将使用本地音符背景。" }, { status: 503 })));

    await expect(new AceStepPolishGenerator(() => plan).generate(plan.composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS))
      .rejects.toThrow("本地音乐模型没有启动");
  });

  it("falls back to a local symbolic plan without touching the model or the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const layer = new AceStepPolishGenerator(() => plan).fallback(plan.composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(renderChildrenMix).not.toHaveBeenCalled();
    expect(layer.sourceKind).toBe("local_fallback");
    expect(layer.symbolicPlan).toBeDefined();
    expect(layer.audioUrl).toBeUndefined();
  });
});
