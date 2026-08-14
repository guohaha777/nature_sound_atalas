import { describe, expect, it } from "vitest";
import { appendAgentDecision, appendAgentToolResult } from "./trace";

describe("agent trace", () => {
  it("records decisions and safe tool summaries without raw payloads", () => {
    const trace = appendAgentDecision([], {
      id: "trace-1",
      at: "2026-08-14T00:00:00.000Z",
      action: { kind: "call-tool", stage: "recognition", tool: "read_sound_card", reason: "读取声音卡。" },
    });
    const withResult = appendAgentToolResult(trace, {
      id: "trace-2",
      at: "2026-08-14T00:00:01.000Z",
      stage: "recognition",
      tool: "read_sound_card",
      safeSummary: "返回两个候选，等待置信度判断。",
      success: true,
    });
    expect(withResult).toHaveLength(2);
    expect(withResult[0]).toMatchObject({ kind: "tool-call", tool: "read_sound_card", success: null });
    expect(withResult[1]).toMatchObject({ kind: "tool-result", tool: "read_sound_card", success: true });
    expect(JSON.stringify(withResult)).not.toContain("imageData");
  });
});
