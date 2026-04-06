/**
 * Global API rate limiter.
 *
 * Applied at the API middleware level to prevent abuse.
 * Uses a sliding window counter per API key.
 * Separate from the policy-level rate_limit (which is per-agent).
 *
 * LIMITATION: This uses an in-memory Map, which does NOT persist across
 * serverless function invocations. Each cold start gets a fresh store, and
 * concurrent instances maintain independent counters. This means the limiter
 * is best-effort only and will under-count in a serverless environment.
 *
 * TODO: Replace with Upstash Redis (@upstash/ratelimit) for production so
 * that rate-limit state is shared across all instances and survives restarts.
 */

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const cutoff = now - 120_000; // Remove entries older than 2 minutes
  for (const [key, entry] of store) {
    if (entry.lastRefill < cutoff) {
      store.delete(key);
    }
  }
}

export interface RateLimitConfig {
  /** Max requests per window. Default: 200 */
  maxRequests: number;
  /** Window in seconds. Default: 60 */
  windowSeconds: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 200,
  windowSeconds: 60,
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds?: number;
}

/**
 * Check if a request is allowed under the global rate limit.
 * Uses token bucket algorithm.
 */
export function checkGlobalRateLimit(
  key: string,
  config: RateLimitConfig = DEFAULT_CONFIG,
): RateLimitResult {
  try {
    cleanup();

    const now = Date.now();
    let entry = store.get(key);

    if (!entry) {
      entry = { tokens: config.maxRequests, lastRefill: now };
      store.set(key, entry);
    }

    // Refill tokens based on elapsed time
    const elapsed = (now - entry.lastRefill) / 1000;
    const refillRate = config.maxRequests / config.windowSeconds;
    entry.tokens = Math.min(config.maxRequests, entry.tokens + elapsed * refillRate);
    entry.lastRefill = now;

    if (entry.tokens < 1) {
      const retryAfter = Math.ceil((1 - entry.tokens) / refillRate);
      return {
        allowed: false,
        remaining: 0,
        limit: config.maxRequests,
        retryAfterSeconds: retryAfter,
      };
    }

    entry.tokens -= 1;
    return {
      allowed: true,
      remaining: Math.floor(entry.tokens),
      limit: config.maxRequests,
    };
  } catch {
    // Fail open: if anything goes wrong with the in-memory limiter,
    // allow the request through rather than blocking legitimate traffic.
    return {
      allowed: true,
      remaining: config.maxRequests,
      limit: config.maxRequests,
    };
  }
}

/** Reset rate limit for a key (useful for testing). */
export function resetRateLimit(key: string): void {
  store.delete(key);
}

/** Get rate limit headers for a response. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
  };
  if (result.retryAfterSeconds) {
    headers['Retry-After'] = String(result.retryAfterSeconds);
  }
  return headers;
}
