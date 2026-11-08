/**
 * Offline recording support.
 * Punto 1: Offline Recording - record audio offline, sync when back online.
 * Integrates with existing offline.ts queue system.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { getFunctionHeaders } from './supabaseFunctions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const OFFLINE_RECORDINGS_KEY = '@quoteapp:offline_recordings';

export interface OfflineRecording {
  id: string;
  uri: string;
  timestamp: number;
  clienti: { id: string; name: string }[];
  context?: Record<string, unknown>;
  retries: number;
  /** Automatic retries are over: only the user can retry or delete it. */
  needsAttention?: boolean;
}

export const VOICE_REQUEST_TIMEOUT_MS = 60000;
const MAX_RETRIES = 5;
const VOICE_UNAVAILABLE = 'Il servizio vocale non risponde. Riprova tra poco.';

export type VoiceUploadOutcome =
  /** The server answered with something usable. */
  | { kind: 'ok'; result: any }
  /** Network, timeout or server fault: the recording must be kept for later. */
  | { kind: 'transient'; message: string }
  /** Session expired or daily limit: nothing wrong with the recording. */
  | { kind: 'blocked'; message: string }
  /** The server refused this recording (too long, malformed). */
  | { kind: 'rejected'; message: string };

/** Sends one recording to voice-process and says what happened, without throwing. */
export async function uploadVoiceRecording(
  supabaseUrl: string,
  uri: string,
  clienti: { id: string; name: string }[],
  context?: Record<string, unknown>
): Promise<VoiceUploadOutcome> {
  let headers: Record<string, string>;
  try {
    headers = await getFunctionHeaders();
  } catch (err) {
    return { kind: 'blocked', message: (err as Error).message };
  }

  const formData = new FormData();
  formData.append('audio', { uri, name: 'recording.m4a', type: 'audio/m4a' } as any);
  formData.append('clienti', JSON.stringify(clienti.map((c) => ({ id: c.id, name: c.name }))));
  if (context) formData.append('context', JSON.stringify(context));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VOICE_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/voice-process`, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });
    // A gateway error page is not JSON: read the text first.
    const body = await res.text();
    let result: any = null;
    try {
      result = JSON.parse(body);
    } catch {
      result = null;
    }
    const message = typeof result?.error === 'string' ? result.error : null;
    if (res.status >= 500) return { kind: 'transient', message: message || VOICE_UNAVAILABLE };
    if (res.status === 401 || res.status === 403) {
      return { kind: 'blocked', message: 'Sessione scaduta: effettua di nuovo l\'accesso.' };
    }
    if (res.status === 429) return { kind: 'blocked', message: message || 'Limite giornaliero raggiunto. Riprova domani.' };
    if (!res.ok) return { kind: 'rejected', message: message || 'Registrazione non valida, riprova.' };
    if (!result) return { kind: 'transient', message: 'Risposta del server non leggibile. Riprova tra poco.' };
    if (message) return { kind: result.retryable ? 'transient' : 'rejected', message };
    return { kind: 'ok', result };
  } catch {
    return { kind: 'transient', message: VOICE_UNAVAILABLE };
  } finally {
    clearTimeout(timer);
  }
}

export async function getOfflineRecordings(): Promise<OfflineRecording[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_RECORDINGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// AsyncStorage is asynchronous: every change goes through this chain, so a recording
// saved while a sync is running is never overwritten by a stale copy of the list.
let storeChain: Promise<unknown> = Promise.resolve();

function updateRecordings(
  change: (recordings: OfflineRecording[]) => OfflineRecording[]
): Promise<void> {
  const next = storeChain.then(async () => {
    const recordings = await getOfflineRecordings();
    await AsyncStorage.setItem(OFFLINE_RECORDINGS_KEY, JSON.stringify(change(recordings)));
  });
  storeChain = next.catch(() => {});
  return next;
}

function removeRecording(id: string): Promise<void> {
  return updateRecordings((recordings) => recordings.filter((rec) => rec.id !== id));
}

function patchRecording(id: string, patch: Partial<OfflineRecording>): Promise<void> {
  return updateRecordings((recordings) =>
    recordings.map((rec) => (rec.id === id ? { ...rec, ...patch } : rec))
  );
}

/** iOS changes the app container path on updates: rebuild the path from the file name. */
function currentUri(rec: OfflineRecording): string {
  const fileName = rec.uri.split('/').pop();
  return fileName ? `${FileSystem.documentDirectory}offline_recordings/${fileName}` : rec.uri;
}

/**
 * Save a recording for later sync when offline.
 * Copies file to a persistent directory so it survives app restarts.
 */
export async function saveOfflineRecording(
  tempUri: string,
  clienti: { id: string; name: string }[],
  context?: Record<string, unknown>
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

  await updateRecordings((recordings) => [
    ...recordings,
    { id, uri: persistUri, timestamp: Date.now(), clienti, context, retries: 0 },
  ]);

  return id;
}

export type SyncSummary = {
  synced: number;
  failed: number;
  /** Results to show the user, oldest first. */
  results: any[];
  /** Files that disappeared from the device. */
  missing: number;
};

let syncInFlight = false;

/**
 * Sends the saved recordings to voice-process, oldest first. The audio is deleted
 * only once it became a usable result; anything else stays for the user to decide.
 */
export async function syncOfflineRecordings(
  supabaseUrl: string,
  _supabaseAnonKey: string
): Promise<SyncSummary> {
  const summary: SyncSummary = { synced: 0, failed: 0, results: [], missing: 0 };
  if (syncInFlight) return summary;
  syncInFlight = true;
  try {
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) return summary;

    const recordings = (await getOfflineRecordings()).filter((rec) => !rec.needsAttention);
    for (const rec of recordings) {
      const uri = currentUri(rec);
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        await removeRecording(rec.id);
        summary.missing++;
        continue;
      }

      const outcome = await uploadVoiceRecording(supabaseUrl, uri, rec.clienti, rec.context);
      // No connection, expired session or daily limit: the next ones would fail too.
      if (outcome.kind === 'transient' || outcome.kind === 'blocked') {
        console.warn(`Offline recording sync paused at ${rec.id}: ${outcome.kind}`);
        summary.failed++;
        break;
      }

      const result = outcome.kind === 'ok' ? outcome.result : null;
      if (result?.action && result.action !== 'none' && String(result.text ?? '').trim()) {
        summary.results.push(result);
        await removeRecording(rec.id);
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        summary.synced++;
        continue;
      }

      // Same audio, same answer: an unintelligible clip is not retried automatically.
      const retries = outcome.kind === 'ok' ? MAX_RETRIES : rec.retries + 1;
      await patchRecording(rec.id, { retries, needsAttention: retries >= MAX_RETRIES });
      summary.failed++;
    }
    return summary;
  } finally {
    syncInFlight = false;
  }
}

export async function getPendingRecordingsCount(): Promise<number> {
  const recordings = await getOfflineRecordings();
  return recordings.length;
}

/** Recordings the app could not process and only the user can decide about. */
export async function getRecordingsNeedingAttention(): Promise<OfflineRecording[]> {
  return (await getOfflineRecordings()).filter((rec) => rec.needsAttention);
}

/** Gives these recordings another full round of automatic attempts. */
export async function retryRecordings(ids: string[]): Promise<void> {
  const wanted = new Set(ids);
  await updateRecordings((recordings) =>
    recordings.map((rec) => (wanted.has(rec.id) ? { ...rec, retries: 0, needsAttention: false } : rec))
  );
}

/** Deletes these recordings: only ever called after the user asked for it. */
export async function deleteRecordings(ids: string[]): Promise<void> {
  const wanted = new Set(ids);
  const recordings = await getOfflineRecordings();
  await updateRecordings((current) => current.filter((rec) => !wanted.has(rec.id)));
  for (const rec of recordings) {
    if (wanted.has(rec.id)) await FileSystem.deleteAsync(currentUri(rec), { idempotent: true }).catch(() => {});
  }
}

export async function clearOfflineRecordings(): Promise<void> {
  const recordings = await getOfflineRecordings();
  await deleteRecordings(recordings.map((rec) => rec.id));
}
