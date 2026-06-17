/**
 * Simple in-memory sliding-window rate limiter.
 * Works on Vercel serverless (per-instance) — good enough for abuse deterrence.
 * For stricter enforcement, replace with Upstash Redis or Vercel KV.
 */

interface WindowEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, WindowEntry>();

const WINDOW_MS = 60_000;     // 1 minute
const DEFAULT_MAX = 10;       // per IP per window for /api/analyze

// Clean up stale entries every 5 minutes to prevent unbounded growth.
let lastCleanup = Date.now();
function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 5 * 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}

export function resolveClientIp(request: Request): string {
  const headers = new Headers((request as Request).headers);
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return "unknown";
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(ip: string, maxRequests = DEFAULT_MAX): RateLimitResult {
  maybeCleanup();

  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || entry.resetAt < now) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + WINDOW_MS };
  }

  entry.count += 1;

  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}
