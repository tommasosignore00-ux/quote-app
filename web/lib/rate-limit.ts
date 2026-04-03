/**
 * In-memory rate limiter for API routes.
 * For production at scale, replace with Upstash Redis or similar.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetTime) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

interface RateLimitConfig {
  /** Max requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetIn: number;
  headers: Record<string, string>;
}

export function rateLimit(
  identifier: string,
  config: RateLimitConfig = { maxRequests: 60, windowMs: 60_000 }
): RateLimitResult {
  const now = Date.now();
  const key = identifier;

  let entry = store.get(key);

  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + config.windowMs };
    store.set(key, entry);
  }

  entry.count++;

  const remaining = Math.max(0, config.maxRequests - entry.count);
  const resetIn = Math.max(0, entry.resetTime - now);

  const headers: Record<string, string> = {
    'X-RateLimit-Limit': config.maxRequests.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': new Date(entry.resetTime).toISOString(),
  };

  return {
    success: entry.count <= config.maxRequests,
    remaining,
    resetIn,
    headers,
  };
}

// ── Pre-configured limiters for different route types ──────────

/** Auth routes: 10 requests per minute per IP */
export function rateLimitAuth(ip: string) {
  return rateLimit(`auth:${ip}`, { maxRequests: 10, windowMs: 60_000 });
}

/** Voice/AI routes: 20 requests per minute per user */
export function rateLimitVoice(userId: string) {
  return rateLimit(`voice:${userId}`, { maxRequests: 20, windowMs: 60_000 });
}

/** General API: 100 requests per minute per IP */
export function rateLimitGeneral(ip: string) {
  return rateLimit(`general:${ip}`, { maxRequests: 100, windowMs: 60_000 });
}

/** Stripe: 20 requests per minute per user */
export function rateLimitStripe(userId: string) {
  return rateLimit(`stripe:${userId}`, { maxRequests: 20, windowMs: 60_000 });
}

/** Email: 5 emails per minute per user */
export function rateLimitEmail(userId: string) {
  return rateLimit(`email:${userId}`, { maxRequests: 5, windowMs: 60_000 });
}
