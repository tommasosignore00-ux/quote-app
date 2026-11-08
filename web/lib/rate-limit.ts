import { supabaseAdmin } from './supabase-server';

/**
 * Durable rate limiter backed by Postgres (consume_rate_limit), so limits hold
 * across serverless instances and restarts.
 */

interface RateLimitConfig {
  /** Max requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** What to do when the counter is unavailable. Defaults to denying the request. */
  whenUnavailable?: 'allow' | 'deny';
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetIn: number;
  headers: Record<string, string>;
}

function unavailable(config: RateLimitConfig): RateLimitResult {
  const allowed = config.whenUnavailable === 'allow';
  return {
    success: allowed,
    remaining: 0,
    resetIn: config.windowMs,
    headers: allowed ? {} : { 'Retry-After': '60' },
  };
}

export async function rateLimit(
  identifier: string,
  config: RateLimitConfig = { maxRequests: 60, windowMs: 60_000 }
): Promise<RateLimitResult> {
  try {
    const { data, error } = await supabaseAdmin.rpc('consume_rate_limit', {
      p_key: identifier,
      p_limit: config.maxRequests,
      p_window_seconds: Math.ceil(config.windowMs / 1000),
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      console.error('Rate limit unavailable:', error?.code ?? 'no row');
      return unavailable(config);
    }
    const resetAt = new Date(row.reset_at as string);
    return {
      success: row.allowed === true,
      remaining: row.remaining as number,
      resetIn: Math.max(0, resetAt.getTime() - Date.now()),
      headers: {
        'X-RateLimit-Limit': String(config.maxRequests),
        'X-RateLimit-Remaining': String(row.remaining),
        'X-RateLimit-Reset': resetAt.toISOString(),
      },
    };
  } catch {
    console.error('Rate limit check failed');
    return unavailable(config);
  }
}

/** Auth routes: 10 requests per minute per key. */
export function rateLimitAuth(ip: string) {
  return rateLimit(`auth:${ip}`, { maxRequests: 10, windowMs: 60_000 });
}

/** Voice routes: 20 requests per minute per user. AI quota is the hard stop. */
export function rateLimitVoice(userId: string) {
  return rateLimit(`voice:${userId}`, {
    maxRequests: 20,
    windowMs: 60_000,
    whenUnavailable: 'allow',
  });
}
