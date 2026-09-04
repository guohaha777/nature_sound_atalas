/**
 * 联网模型接口的演示保护限额。
 * 本地开发默认关闭，便于连续验证；线上部署默认开启，保留单访客与单实例的额度保护。
 * 需要临时改变时设置环境变量 AI_RATE_LIMIT=on / off。
 */
export interface RateLimitPolicy {
  /** 状态桶名称，不同接口互不影响。 */
  scope: string;
  perClientLimit: number;
  dailyLimit: number;
  maxConcurrency: number;
  /** 开启后同一访客同时只允许一个进行中的请求（长耗时的音频生成用）。 */
  singleFlightPerClient?: boolean;
  windowMs?: number;
  messages: {
    perClient: string;
    daily: string;
    concurrency: string;
    inFlight?: string;
  };
}

export type RateLimitAdmission =
  | { ok: true; release(): void }
  | { ok: false; message: string; retryAfterSeconds: number };

interface RateLimitState {
  day: string;
  dailyCount: number;
  attempts: Map<string, number[]>;
  activeClients: Set<string>;
  activeTotal: number;
}

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const ALWAYS_ADMITTED: RateLimitAdmission = { ok: true, release: () => {} };

export function isRateLimitEnabled(): boolean {
  const setting = process.env.AI_RATE_LIMIT?.trim().toLowerCase();
  if (setting === "off" || setting === "false" || setting === "0") return false;
  if (setting === "on" || setting === "true" || setting === "1") return true;
  return process.env.NODE_ENV === "production";
}

export function admitRequest(request: Request, policy: RateLimitPolicy): RateLimitAdmission {
  if (!isRateLimitEnabled()) return ALWAYS_ADMITTED;

  const windowMs = policy.windowMs ?? DEFAULT_WINDOW_MS;
  const state = rateLimitState(policy.scope);
  const client = clientIdentifier(request);
  const now = Date.now();
  const recent = (state.attempts.get(client) ?? []).filter((time) => now - time < windowMs);
  state.attempts.set(client, recent);

  if (policy.singleFlightPerClient && state.activeClients.has(client)) {
    return { ok: false, message: policy.messages.inFlight ?? policy.messages.concurrency, retryAfterSeconds: 15 };
  }
  if (state.activeTotal >= policy.maxConcurrency) {
    return { ok: false, message: policy.messages.concurrency, retryAfterSeconds: 30 };
  }
  if (recent.length >= policy.perClientLimit) {
    return { ok: false, message: policy.messages.perClient, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000)) };
  }
  if (state.dailyCount >= policy.dailyLimit) {
    return { ok: false, message: policy.messages.daily, retryAfterSeconds: 3600 };
  }

  recent.push(now);
  state.dailyCount += 1;
  state.activeClients.add(client);
  state.activeTotal += 1;
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      state.activeClients.delete(client);
      state.activeTotal = Math.max(0, state.activeTotal - 1);
    },
  };
}

export function clientIdentifier(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown-client";
}

function rateLimitState(scope: string): RateLimitState {
  const globalScope = globalThis as typeof globalThis & { __wanwuRateLimitStates?: Map<string, RateLimitState> };
  const states = globalScope.__wanwuRateLimitStates ??= new Map<string, RateLimitState>();
  const day = new Date().toISOString().slice(0, 10);
  const current = states.get(scope);
  if (current && current.day === day) return current;
  const fresh: RateLimitState = { day, dailyCount: 0, attempts: new Map(), activeClients: new Set(), activeTotal: 0 };
  states.set(scope, fresh);
  return fresh;
}
