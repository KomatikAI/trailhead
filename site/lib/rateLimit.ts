/**
 * Sliding-window in-memory rate limiter — mirrors the discipline of
 * komatik/platform/web/lib/security/rateLimit.ts (checkRateLimit + a standards
 * -compliant 429), minus the Upstash Redis backend. On serverless this is
 * best-effort per-instance; Stripe checkout abuse is additionally bounded by
 * Stripe's own controls. Swap in Upstash here if cross-instance limits are
 * needed (set UPSTASH_REDIS_REST_URL/TOKEN and reintroduce the Ratelimit path).
 */
const WINDOW_MS = 60_000;

type Store = Map<string, number[]>;

function getStore(): Store {
  const g = globalThis as unknown as { __thRateStore?: Store };
  if (!g.__thRateStore) g.__thRateStore = new Map();
  return g.__thRateStore;
}

export function checkRateLimit(
  identifier: string,
  operation: string,
  maxPerMinute: number,
): { allowed: boolean; retryAfterMs: number } {
  const store = getStore();
  const key = `${operation}:${identifier}`;
  const now = Date.now();
  const timestamps = (store.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= maxPerMinute) {
    const oldest = timestamps[0];
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - oldest) };
  }
  timestamps.push(now);
  store.set(key, timestamps);
  return { allowed: true, retryAfterMs: 0 };
}

/** Best-effort client IP from proxy headers. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** RFC 9110 compliant 429. */
export function rateLimitResponse(retryAfterMs: number, maxPerMinute: number): Response {
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please try again later.",
      code: "rate_limited",
      retryAfterSeconds: retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-Limit": String(maxPerMinute),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.floor((Date.now() + retryAfterMs) / 1000)),
      },
    },
  );
}

/** One-shot guard: returns a 429 Response if over limit, else null. */
export function guardRateLimit(
  req: Request,
  operation: string,
  maxPerMinute: number,
): Response | null {
  const result = checkRateLimit(clientIp(req), operation, maxPerMinute);
  if (!result.allowed) return rateLimitResponse(result.retryAfterMs, maxPerMinute);
  return null;
}
