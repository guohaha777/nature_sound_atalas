import { afterEach, describe, expect, it } from "vitest";
import { admitRequest, isRateLimitEnabled, type RateLimitPolicy } from "./rateLimit";

const policy: RateLimitPolicy = {
  scope: "test-scope",
  perClientLimit: 2,
  dailyLimit: 10,
  maxConcurrency: 5,
  messages: { perClient: "次数较多", daily: "额度用完", concurrency: "任务较多" },
};

afterEach(() => {
  delete process.env.AI_RATE_LIMIT;
});

function request() {
  return new Request("https://example.test/api", { headers: { "x-forwarded-for": "203.0.113.7" } });
}

describe("联网模型接口限额", () => {
  it("本地开发默认关闭，便于连续验证", () => {
    expect(isRateLimitEnabled()).toBe(false);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const admission = admitRequest(request(), { ...policy, scope: "always-open" });
      expect(admission.ok).toBe(true);
      if (admission.ok) admission.release();
    }
  });

  it("显式打开后按单访客次数拦截", () => {
    process.env.AI_RATE_LIMIT = "on";
    expect(isRateLimitEnabled()).toBe(true);
    const first = admitRequest(request(), { ...policy, scope: "per-client" });
    const second = admitRequest(request(), { ...policy, scope: "per-client" });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok) first.release();
    if (second.ok) second.release();

    const third = admitRequest(request(), { ...policy, scope: "per-client" });
    expect(third.ok).toBe(false);
    if (!third.ok) {
      expect(third.message).toBe("次数较多");
      expect(third.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("关闭开关后立刻恢复放行", () => {
    process.env.AI_RATE_LIMIT = "off";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(admitRequest(request(), { ...policy, scope: "per-client" }).ok).toBe(true);
    }
  });
});
