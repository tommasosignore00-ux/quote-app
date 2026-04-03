/**
 * Offline recording support.
 * Punto 1: Offline Recording - record audio offline, sync when back online.
 * Integrates with existing offline.ts queue system.
 */
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const OFFLINE_RECORDINGS_KEY = '@quoteapp:offline_recordings';

export interface OfflineRecording {
  id: string;
  uri: string;
  timestamp: number;
  clienti: { id: string; name: string }[];
  retries: number;
}

export async function getOfflineRecordings(): Promise<OfflineRecording[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_RECORDINGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveRecordings(recordings: OfflineRecording[]): Promise<void> {
  await AsyncStorage.setItem(OFFLINE_RECORDINGS_KEY, JSON.stringify(recordings));
}

/**
 * Save a recording for later sync when offline.
 * Copies file to a persistent directory so it survives app restarts.
 */
export async function saveOfflineRecording(
  tempUri: string,
  clienti: { id: string; name: string }[]
): Promise<string> {
  const id = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const persistDir = `${FileSystem.documentDirectory}offline_recordings/`;

  // Ensure directory exists
  const dirInfo = await FileSystem.getInfoAsync(persistDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(persistDir, { intermediates: true });
  }

  const persistUri = `${persistDir}${id}.m4a`;
  await FileSystem.copyAsync({ from: tempUri, to: persistUri });

  const recordings = await getOfflineRecordings();
  recordings.push({
    id,
    uri: persistUri,
    timestamp: Date.now(),
    clienti,
    retries: 0,
  });
  await saveRecordings(recordings);

  return id;
}

/**
 * Sync all offline recordings to the voice-process endpoint.
 * Returns results for each successfully synced recording.
 */
export async function syncOfflineRecordings(
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<{ synced: number; failed: number; results: any[] }> {
  const netState = await NetInfo.fetch();
  if (!netState.isConnected) return { synced: 0, failed: 0, results: [] };

  const recordings = await getOfflineRecordings();
  if (recordings.length === 0) return { synced: 0, failed: 0, results: [] };

  let synced = 0;
  let failed = 0;
  const results: any[] = [];
  const remaining: OfflineRecording[] = [];

  for (const rec of recordings) {
    try {
      // Check if file still exists
      const fileInfo = await FileSystem.getInfoAsync(rec.uri);
      if (!fileInfo.exists) {
        // File gone, skip
        synced++;
        continue;
      }

      const formData = new FormData();
      formData.append('audio', {
        uri: rec.uri,
        name: 'recording.m4a',
        type: 'audio/m4a',
      } as any);
      formData.append(
        'clienti',
        JSON.stringify(rec.clienti.map((c) => ({ id: c.id, name: c.name })))
      );

      const res = await fetch(`${supabaseUrl}/functions/v1/voice-process`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supabaseAnonKey}` },
        body: formData,
      });

      const result = await res.json();
      if (result.action) {
        results.push(result);
        // Delete the synced file
        await FileSystem.deleteAsync(rec.uri, { idempotent: true });
        synced++;
      } else {
        throw new Error('No action in response');
      }
    } catch (e) {
      console.warn(`Offline recording sync failed for ${rec.id}:`, e);
      rec.retries++;
      if (rec.retries < 5) {
        remaining.push(rec);
      } else {
        // Give up after 5 retries, delete file
        await FileSystem.deleteAsync(rec.uri, { idempotent: true }).catch(() => {});
      }
      failed++;
    }
  }

  await saveRecordings(remaining);
  return { synced, failed, results };
}

export async function getPendingRecordingsCount(): Promise<number> {
  const recordings = await getOfflineRecordings();
  return recordings.length;
}

export async function clearOfflineRecordings(): Promise<void> {
  const recordings = await getOfflineRecordings();
  for (const rec of recordings) {
    await FileSystem.deleteAsync(rec.uri, { idempotent: true }).catch(() => {});
  }
  await saveRecordings([]);
}
