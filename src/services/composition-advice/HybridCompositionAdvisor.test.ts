import { afterEach, describe, expect, it, vi } from "vitest";
import { arrangeCompositionV1, attachCompositionContext } from "@/src/domain/composition";
import { MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { HybridCompositionAdvisor } from "./HybridCompositionAdvisor";

describe("HybridCompositionAdvisor", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("records a valid online model result as live AI", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      confidence: 0.91,
      roles: MOCK_SOUND_UNITS.filter((unit) => unit.active).map((_, index) => ({ soundIndex: index + 1, role: index === 0 ? "lead" : "response", reason: "它和别的声音一问一答。" })),
      backgroundRecommendation: { value: "helpful", reason: "声音之间还有空位，可以试听轻背景。" },
      musicDiscovery: { concept: "repetition", childText: "重复的声音会被耳朵记住。", tryThis: "复制一个声音，再听一遍。" },
      provider: "dashscope.aliyuncs.com",
      model: "qwen3.7-plus",
    })));
    const composition = attachCompositionContext(arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1), MOCK_SOUND_UNITS, "run-deterministic-arranger");
    const advice = await new HybridCompositionAdvisor().advise(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS);
    expect(advice).toMatchObject({ sourceKind: "live_ai", provider: "dashscope.aliyuncs.com", model: "qwen3.7-plus" });
  });

  it("still produces child-safe local advice when the online model is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "unavailable" }, { status: 503 })));
    const composition = attachCompositionContext(arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 1), MOCK_SOUND_UNITS, "run-deterministic-arranger");
    const advisor = new HybridCompositionAdvisor();
    await expect(advisor.advise(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS)).rejects.toThrow();
    expect(advisor.fallback(composition, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS)).toMatchObject({ sourceKind: "local_rules" });
  });
});
