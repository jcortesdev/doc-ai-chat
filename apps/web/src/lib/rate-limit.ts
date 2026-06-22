import { Ratelimit } from '@upstash/ratelimit';
import type { Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Token-bucket rate limiting on the hot paths (M4 task 1, ADR-007). Upstash Redis
// gives atomic sub-5ms counters shared across serverless instances — a per-process
// Map would not survive cold starts or coordinate across lambdas. This is the
// burst limiter; the per-tier daily quota (task 2) and the budget kill switch
// (task 3) are separate layers. Fail-open by design: if Redis is unreachable the
// request is allowed, so an Upstash outage never takes down chat.

export type RateScope = 'chat' | 'pdf';

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  // Epoch ms at which the bucket refills enough for the next request.
  reset: number;
  // True when the limiter was bypassed (no Redis configured, or Redis errored).
  failedOpen?: boolean;
};

type ScopeConfig = {
  max: number;
  refill: number;
  window: Duration;
};

// Burst = `max`; sustained = `refill` tokens per `window`. Defaults are tuneable
// via env so the limits can be lowered to exercise the 429 path without a code
// change. Exact prod values live in _private/RUNTIME_CONFIG.md.
const DEFAULTS: Record<RateScope, ScopeConfig> = {
  chat: { max: 10, refill: 10, window: '60 s' },
  pdf: { max: 30, refill: 30, window: '60 s' },
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envWindow(name: string, fallback: Duration): Duration {
  const raw = process.env[name]?.trim();
  return raw ? (raw as Duration) : fallback;
}

function scopeConfig(scope: RateScope): ScopeConfig {
  const defaults = DEFAULTS[scope];
  const prefix = scope.toUpperCase();
  return {
    max: envInt(`${prefix}_RATELIMIT_MAX`, defaults.max),
    refill: envInt(`${prefix}_RATELIMIT_REFILL`, defaults.refill),
    window: envWindow(`${prefix}_RATELIMIT_WINDOW`, defaults.window),
  };
}

// `undefined` = not yet resolved; `null` = resolved to "no Redis configured".
let redisClient: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redisClient !== undefined) {
    return redisClient;
  }
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    // Not using Redis.fromEnv() — it throws on missing vars, which would break
    // the fail-open path in local dev without Upstash.
    console.warn(
      '[rate-limit] UPSTASH_REDIS_REST_URL/_TOKEN not set — rate limiting disabled (fail-open).',
    );
    redisClient = null;
    return null;
  }
  redisClient = new Redis({ url, token });
  return redisClient;
}

// One limiter per scope (distinct prefixes → chat and pdf never share a bucket).
const ephemeralCache = new Map<string, number>();
const limiters = new Map<RateScope, Ratelimit>();

function getLimiter(scope: RateScope): Ratelimit | null {
  const redis = getRedis();
  if (!redis) {
    return null;
  }
  const cached = limiters.get(scope);
  if (cached) {
    return cached;
  }
  const { max, refill, window } = scopeConfig(scope);
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.tokenBucket(refill, window, max),
    prefix: `ratelimit:${scope}`,
    analytics: false,
    // Short-circuit repeated identifiers within a single lambda invocation.
    ephemeralCache,
  });
  limiters.set(scope, limiter);
  return limiter;
}

// Consumes one token for `identifier` in the given scope. Returns `ok: false`
// when the bucket is empty (caller should respond 429). Never throws.
export async function enforceRateLimit(
  scope: RateScope,
  identifier: string,
): Promise<RateLimitResult> {
  const limiter = getLimiter(scope);
  if (!limiter) {
    return { ok: true, limit: 0, remaining: 0, reset: 0, failedOpen: true };
  }
  try {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);
    return { ok: success, limit, remaining, reset };
  } catch (error) {
    // Redis unreachable → fail-open. The budget kill switch (task 3) is the cost
    // backstop; availability of the hot path wins here.
    console.warn('[rate-limit] limiter error, failing open:', error);
    return { ok: true, limit: 0, remaining: 0, reset: 0, failedOpen: true };
  }
}

// Standard rate-limit response headers. `Retry-After` (seconds) is only set when
// the request was blocked. `now` is injectable for deterministic testing.
export function rateLimitHeaders(
  result: RateLimitResult,
  now: number = Date.now(),
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(Math.max(0, result.remaining)),
    'X-RateLimit-Reset': String(result.reset),
  };
  if (!result.ok && result.reset > 0) {
    headers['Retry-After'] = String(Math.max(0, Math.ceil((result.reset - now) / 1000)));
  }
  return headers;
}
