/**
 * In-memory LRU cache for server-side data.
 * For production at scale, replace with Redis.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
}

class LRUCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();
  private maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;

    // Auto-cleanup expired entries every 2 minutes
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.cleanup(), 2 * 60 * 1000);
    }
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    entry.accessCount++;
    entry.lastAccessed = Date.now();
    return entry.value;
  }

  set(key: string, value: T, ttlMs = 60_000): void {
    // Evict LRU if at capacity
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      this.evictLRU();
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      accessCount: 1,
      lastAccessed: Date.now(),
    });
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /** Invalidate all cache entries matching a prefix */
  invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  stats(): { size: number; maxSize: number } {
    return { size: this.store.size, maxSize: this.maxSize };
  }

  private evictLRU(): void {
    let oldestKey = '';
    let oldestTime = Infinity;
    for (const [key, entry] of this.store) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey) this.store.delete(oldestKey);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}

// ── Singleton instances for different cache domains ──

/** Cache for listino/price lookups — 5 min TTL */
export const listinoCache = new LRUCache(200);

/** Cache for profile data — 2 min TTL */
export const profileCache = new LRUCache(100);

/** Cache for general API responses — 1 min TTL */
export const apiCache = new LRUCache(300);

// ── Helper functions ──────────────────────────────

/**
 * Cache-aside pattern: try cache first, then fetch and cache the result.
 */
export async function cacheAside<T>(
  cache: LRUCache<T>,
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 60_000
): Promise<T> {
  const cached = cache.get(key) as T | null;
  if (cached !== null) return cached;

  const value = await fetcher();
  cache.set(key, value, ttlMs);
  return value;
}

/**
 * HTTP Cache-Control headers for Next.js API routes.
 */
export function getCacheHeaders(maxAgeSeconds = 60, staleWhileRevalidate = 120): Record<string, string> {
  return {
    'Cache-Control': `public, s-maxage=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidate}`,
  };
}

/**
 * Immutable cache headers for static assets.
 */
export function getImmutableCacheHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
}

export default LRUCache;
