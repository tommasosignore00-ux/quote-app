/**
 * Embedding cache to avoid recomputing vectors for identical voice commands.
 * Punto 16: Caching Embeddings - save API costs by caching repeated queries.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const EMBEDDING_CACHE_KEY = '@quoteapp:embedding_cache';
const MAX_CACHE_SIZE = 500; // max cached embeddings
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CachedEmbedding {
  text: string;
  embedding: number[];
  timestamp: number;
}

let memoryCache: Map<string, CachedEmbedding> = new Map();
let initialized = false;

function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

async function loadCache(): Promise<void> {
  if (initialized) return;
  try {
    const raw = await AsyncStorage.getItem(EMBEDDING_CACHE_KEY);
    if (raw) {
      const entries: CachedEmbedding[] = JSON.parse(raw);
      const now = Date.now();
      for (const entry of entries) {
        if (now - entry.timestamp < CACHE_TTL) {
          memoryCache.set(normalizeText(entry.text), entry);
        }
      }
    }
    initialized = true;
  } catch {
    initialized = true;
  }
}

async function persistCache(): Promise<void> {
  try {
    const entries = Array.from(memoryCache.values());
    await AsyncStorage.setItem(EMBEDDING_CACHE_KEY, JSON.stringify(entries));
  } catch {
    // Silently fail — cache is best-effort
  }
}

/**
 * Get cached embedding for a text query.
 * Returns null if not cached.
 */
export async function getCachedEmbedding(text: string): Promise<number[] | null> {
  await loadCache();
  const key = normalizeText(text);
  const cached = memoryCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.embedding;
  }

  // Expired entry
  if (cached) {
    memoryCache.delete(key);
  }

  return null;
}

/**
 * Store an embedding in the cache.
 */
export async function setCachedEmbedding(text: string, embedding: number[]): Promise<void> {
  await loadCache();
  const key = normalizeText(text);

  // Evict oldest entries if at capacity
  if (memoryCache.size >= MAX_CACHE_SIZE) {
    let oldestKey = '';
    let oldestTime = Infinity;
    for (const [k, v] of memoryCache) {
      if (v.timestamp < oldestTime) {
        oldestTime = v.timestamp;
        oldestKey = k;
      }
    }
    if (oldestKey) memoryCache.delete(oldestKey);
  }

  memoryCache.set(key, {
    text: key,
    embedding,
    timestamp: Date.now(),
  });

  await persistCache();
}

/**
 * Clear the entire embedding cache.
 */
export async function clearEmbeddingCache(): Promise<void> {
  memoryCache.clear();
  initialized = false;
  await AsyncStorage.removeItem(EMBEDDING_CACHE_KEY);
}

/**
 * Get cache statistics.
 */
export async function getEmbeddingCacheStats(): Promise<{
  size: number;
  maxSize: number;
  oldestEntry: number | null;
}> {
  await loadCache();
  let oldest: number | null = null;
  for (const entry of memoryCache.values()) {
    if (oldest === null || entry.timestamp < oldest) {
      oldest = entry.timestamp;
    }
  }
  return { size: memoryCache.size, maxSize: MAX_CACHE_SIZE, oldestEntry: oldest };
}
