const buckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
  limit: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: 0, limit };
  }
  if (existing.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(0, existing.resetAt - now),
      limit,
    };
  }
  existing.count += 1;
  return {
    ok: true,
    remaining: limit - existing.count,
    retryAfterMs: 0,
    limit,
  };
}

export function rateLimitResponse(result: RateLimitResult): Response {
  return Response.json(
    {
      error: `Terlalu banyak permintaan. Coba lagi dalam ${Math.ceil(result.retryAfterMs / 1000)} detik.`,
      code: "RATE_LIMITED",
    },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) },
    },
  );
}

export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request.headers.get("x-real-ip")?.trim();
  return `${scope}:${forwarded || real || "local"}`;
}

let lastSweep = 0;
export function sweepRateLimits() {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, value] of buckets) {
    if (value.resetAt <= now) buckets.delete(key);
  }
}
