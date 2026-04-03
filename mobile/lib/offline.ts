import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import NetInfo from '@react-native-community/netinfo';

const OFFLINE_QUEUE_KEY = '@quoteapp:offline_queue';
const OFFLINE_CACHE_KEY = '@quoteapp:cache';

// ── Types ──────────────────────────────────────────

interface QueuedOperation {
  id: string;
  timestamp: number;
  table: string;
  operation: 'insert' | 'update' | 'delete';
  data: Record<string, unknown>;
  retries: number;
}

interface CacheEntry {
  data: unknown;
  timestamp: number;
  ttl: number; // milliseconds
}

// ── Queue Management ──────────────────────────────

export async function getOfflineQueue(): Promise<QueuedOperation[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedOperation[]): Promise<void> {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export async function addToQueue(
  table: string,
  operation: 'insert' | 'update' | 'delete',
  data: Record<string, unknown>
): Promise<void> {
  const queue = await getOfflineQueue();
  const entry: QueuedOperation = {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    table,
    operation,
    data,
    retries: 0,
  };
  queue.push(entry);
  await saveQueue(queue);
}

// ── Cache Management ──────────────────────────────

export async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(`${OFFLINE_CACHE_KEY}:${key}`);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > entry.ttl) {
      await AsyncStorage.removeItem(`${OFFLINE_CACHE_KEY}:${key}`);
      return null;
    }
    return entry.data as T;
  } catch {
    return null;
  }
}

export async function setCachedData(
  key: string,
  data: unknown,
  ttlMs = 5 * 60 * 1000 // 5 minutes default
): Promise<void> {
  const entry: CacheEntry = { data, timestamp: Date.now(), ttl: ttlMs };
  await AsyncStorage.setItem(`${OFFLINE_CACHE_KEY}:${key}`, JSON.stringify(entry));
}

// ── Sync Engine ──────────────────────────────────

export async function syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  const netState = await NetInfo.fetch();
  if (!netState.isConnected) return { synced: 0, failed: queue.length };

  let synced = 0;
  let failed = 0;
  const remaining: QueuedOperation[] = [];

  for (const op of queue) {
    try {
      let result;
      switch (op.operation) {
        case 'insert':
          result = await supabase.from(op.table).insert(op.data);
          break;
        case 'update':
          const { id: updateId, ...updateData } = op.data;
          result = await supabase.from(op.table).update(updateData).eq('id', updateId);
          break;
        case 'delete':
          result = await supabase.from(op.table).delete().eq('id', op.data.id);
          break;
      }

      if (result?.error) throw result.error;
      synced++;
    } catch (e) {
      console.warn(`Sync failed for ${op.table}/${op.operation}:`, e);
      op.retries++;
      if (op.retries < 5) {
        remaining.push(op);
      }
      failed++;
    }
  }

  await saveQueue(remaining);
  return { synced, failed };
}

// ── Online/Offline Aware Data Fetching ──────────

export async function fetchWithOfflineFallback<T>(
  cacheKey: string,
  fetchFn: () => Promise<T>,
  ttlMs = 5 * 60 * 1000
): Promise<{ data: T | null; isOffline: boolean }> {
  const netState = await NetInfo.fetch();

  if (netState.isConnected) {
    try {
      const data = await fetchFn();
      await setCachedData(cacheKey, data, ttlMs);
      return { data, isOffline: false };
    } catch (e) {
      console.warn('Fetch failed, trying cache:', e);
      const cached = await getCachedData<T>(cacheKey);
      return { data: cached, isOffline: true };
    }
  }

  // Offline: use cache
  const cached = await getCachedData<T>(cacheKey);
  return { data: cached, isOffline: true };
}

// ── Offline-aware mutation ──────────────────────

export async function mutateWithOfflineQueue(
  table: string,
  operation: 'insert' | 'update' | 'delete',
  data: Record<string, unknown>
): Promise<{ queued: boolean }> {
  const netState = await NetInfo.fetch();

  if (netState.isConnected && supabase) {
    try {
      let result;
      switch (operation) {
        case 'insert':
          result = await supabase.from(table).insert(data);
          break;
        case 'update':
          const { id: updateId, ...updateData } = data;
          result = await supabase.from(table).update(updateData).eq('id', updateId);
          break;
        case 'delete':
          result = await supabase.from(table).delete().eq('id', data.id);
          break;
      }
      if (result?.error) throw result.error;
      return { queued: false };
    } catch {
      // Fall through to queue
    }
  }

  await addToQueue(table, operation, data);
  return { queued: true };
}

// ── Network Listener ──────────────────────────

let unsubscribeNetInfo: (() => void) | null = null;

export function startNetworkListener(onSync?: (result: { synced: number; failed: number }) => void) {
  if (unsubscribeNetInfo) return;

  unsubscribeNetInfo = NetInfo.addEventListener(async (state: { isConnected: boolean | null }) => {
    if (state.isConnected) {
      const result = await syncOfflineQueue();
      if (result.synced > 0) {
        onSync?.(result);
      }
    }
  });
}

export function stopNetworkListener() {
  unsubscribeNetInfo?.();
  unsubscribeNetInfo = null;
}

export async function getPendingOperationsCount(): Promise<number> {
  const queue = await getOfflineQueue();
  return queue.length;
}
