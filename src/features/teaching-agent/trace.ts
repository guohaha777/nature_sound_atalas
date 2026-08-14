import type { AgentTraceEntry, TeachingAgentAction, TeachingAgentToolName } from "./types";

export function appendAgentDecision(
  trace: AgentTraceEntry[],
  input: { id: string; at: string; action: TeachingAgentAction },
): AgentTraceEntry[] {
  return [...trace, {
    id: input.id,
    at: input.at,
    stage: input.action.stage,
    kind: decisionKind(input.action),
    tool: input.action.kind === "call-tool" ? input.action.tool : null,
    summary: input.action.reason,
    success: null,
  }];
}

export function appendAgentToolResult(
  trace: AgentTraceEntry[],
  input: {
    id: string;
    at: string;
    stage: AgentTraceEntry["stage"];
    tool: TeachingAgentToolName;
    safeSummary: string;
    success: boolean;
  },
): AgentTraceEntry[] {
  return [...trace, {
    id: input.id,
    at: input.at,
    stage: input.stage,
    kind: input.tool === "validate_polish" ? "validation" : "tool-result",
    tool: input.tool,
    summary: input.safeSummary,
    success: input.success,
  }];
}

function decisionKind(action: TeachingAgentAction): AgentTraceEntry["kind"] {
  if (action.kind === "call-tool") return "tool-call";
  if (action.kind === "request-teacher-confirmation" || action.kind === "request-polish-choice") return "human-confirmation";
  if (action.kind === "continue-base-only") return "fallback";
  return "decision";
}
