'use client';

/**
 * Logic shared by the phone version of the site (/m): recording, sending a dictation
 * to voice-process, finding price list candidates and saving confirmed lines.
 * Quote lines keep one meaning everywhere: unit_price is the purchase price and
 * tax_rate the markup; a price said or typed is final (markup 0).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  extractSpokenItems,
  parseItalianNumber,
  type SpokenItem,
  type VoiceResult,
} from '@/lib/voiceResult';
import type { VoiceCandidate, VoiceDraftItem } from '@/components/VoiceConfirmModal';

export type { VoiceCandidate, VoiceDraftItem };

export type Cliente = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
};
export type Lavoro = {
  id: string;
  title: string;
  cliente_id: string;
  status?: string | null;
  updated_at?: string | null;
  vat_percent?: number | null;
  clienti?: { name?: string } | null;
};
export type Costo = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number | null;
  unit?: string | null;
  vat_percent?: number | null;
  created_at?: string | null;
};

export const MAX_RECORDING_MS = 120_000;
const MIN_RECORDING_MS = 700;

/** Final unit price the client sees. */
export const clientUnitPrice = (c: Pick<Costo, 'unit_price' | 'tax_rate'>) =>
  Number(c.unit_price) * (1 + (Number(c.tax_rate) || 0) / 100);

/** A line saved without a price (e.g. dictated and not in the price list). */
export const lacksPrice = (c: Pick<Costo, 'unit_price' | 'tax_rate'>) =>
  !(clientUnitPrice(c) > 0);

export const euro = (value: number) =>
  `${(Number(value) || 0).toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;

export const qty = (value: number) =>
  (Number(value) || 0).toLocaleString('it-IT', { maximumFractionDigits: 2 });

/** Safari records mp4, Chrome webm: the transcription reads the format from the extension. */
function audioFileName(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'recording.m4a';
  if (mimeType.includes('ogg')) return 'recording.ogg';
  return 'recording.webm';
}

export type RecorderState = 'idle' | 'recording' | 'processing';

/**
 * Tap to start, tap to stop. Stops by itself at 2 minutes. `onAudio` receives the
 * recording when it is long enough to be a dictation.
 */
export function useVoiceRecorder(onAudio: (blob: Blob) => Promise<void>) {
  const [state, setState] = useState<RecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  /** Microphone input level 0-1 while recording, for the meter. */
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const meterRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const peakRef = useRef(0);
  const meteredRef = useRef(false);
  const onAudioRef = useRef(onAudio);
  onAudioRef.current = onAudio;

  const clearTimers = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (autoStopRef.current) window.clearTimeout(autoStopRef.current);
    if (meterRef.current) window.clearInterval(meterRef.current);
    timerRef.current = null;
    autoStopRef.current = null;
    meterRef.current = null;
  };

  const closeAudioContext = () => {
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  };

  useEffect(
    () => () => {
      clearTimers();
      closeAudioContext();
    },
    []
  );

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') {
      // Safari can drop the tail of the audio if the last slice is not requested first.
      try {
        recorder.requestData();
      } catch {
        // Not supported: stop() still flushes what it has.
      }
      recorder.stop();
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Questo browser non registra la voce. Usa Safari o Chrome aggiornati.');
      return;
    }
    // Created inside the tap, before any await: iPhone allows audio only from a gesture.
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    let audioContext: AudioContext | null = null;
    try {
      audioContext = AudioContextClass ? new AudioContextClass() : null;
    } catch {
      audioContext = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      // The format the iPhone records best; Chrome falls back to its own.
      const mimeType = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(
        (type) => MediaRecorder.isTypeSupported?.(type)
      );
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };

      // Level meter: shows the phone is hearing, and tells silence from speech.
      peakRef.current = 0;
      meteredRef.current = false;
      if (audioContext) {
        try {
          await audioContext.resume();
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 1024;
          audioContext.createMediaStreamSource(stream).connect(analyser);
          const samples = new Uint8Array(analyser.fftSize);
          audioContextRef.current = audioContext;
          meterRef.current = window.setInterval(() => {
            if (audioContext?.state !== 'running') return;
            analyser.getByteTimeDomainData(samples);
            let peak = 0;
            for (const sample of samples) {
              peak = Math.max(peak, Math.abs(sample - 128) / 128);
            }
            meteredRef.current = true;
            peakRef.current = Math.max(peakRef.current, peak);
            setLevel(Math.min(1, peak * 3));
          }, 120);
        } catch {
          closeAudioContext();
        }
      }

      recorder.onstop = async () => {
        clearTimers();
        closeAudioContext();
        setLevel(0);
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        const duration = Date.now() - startedAtRef.current;
        if (duration < MIN_RECORDING_MS) {
          setState('idle');
          setError('Registrazione troppo breve: tocca, parla, poi tocca di nuovo.');
          return;
        }
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || 'audio/mp4',
        });
        // Measured silence, or almost no data: sending it would only come back empty.
        if ((meteredRef.current && peakRef.current < 0.02) || blob.size < 2000) {
          setState('idle');
          setError(
            "Il microfono non ha registrato la voce. Controlla che nessun'altra app lo stia usando (chiamate, note vocali), poi riprova parlando vicino al telefono."
          );
          return;
        }
        setState('processing');
        try {
          await onAudioRef.current(blob);
        } finally {
          setState('idle');
        }
      };
      // Slices every second: Safari keeps the whole recording even if it is cut short.
      recorder.start(1000);
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setSeconds(0);
      setState('recording');
      timerRef.current = window.setInterval(
        () => setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000)),
        500
      );
      autoStopRef.current = window.setTimeout(stop, MAX_RECORDING_MS);
    } catch {
      audioContext?.close().catch(() => {});
      setState('idle');
      setError(
        'Microfono bloccato. Consenti il microfono a questo sito nelle impostazioni di Safari.'
      );
    }
  }, [stop]);

  const toggle = useCallback(() => {
    if (state === 'recording') stop();
    else if (state === 'idle') start();
  }, [state, start, stop]);

  return { state, seconds, level, error, setError, toggle };
}

/** Sends the audio to voice-process with the same context the app sends. */
export async function sendDictation(
  blob: Blob,
  context: Record<string, unknown>
): Promise<VoiceResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Sessione scaduta: effettua di nuovo l'accesso.");
  }
  const formData = new FormData();
  formData.append('audio', blob, audioFileName(blob.type));
  formData.append('context', JSON.stringify(context));
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}/functions/v1/voice-process`,
    {
      method: 'POST',
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: formData,
    }
  );
  const body = await res.text();
  let result: (VoiceResult & { error?: string }) | null = null;
  try {
    result = JSON.parse(body);
  } catch {
    result = null;
  }
  if (!res.ok || !result || result.error) {
    throw new Error(
      result?.error || 'Il servizio vocale non risponde. Riprova tra poco.'
    );
  }
  return result;
}

/** Price list candidates for one spoken item: words first, meaning only as a fallback. */
export async function buildDraftItem(
  spoken: SpokenItem,
  index: number,
  profileId: string
): Promise<VoiceDraftItem> {
  const post = async (url: string) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: spoken.description, profileId }),
    });
    return res.ok ? res.json() : { item: null, alternatives: [] };
  };
  const byWords = await post('/api/listini/text-search');
  let candidates: VoiceCandidate[] = byWords.item
    ? [byWords.item, ...(byWords.alternatives || [])]
    : [];
  if (candidates.length === 0) {
    const byMeaning = await post('/api/voice/semantic-match');
    candidates = (byMeaning.alternatives || []).map((item: VoiceCandidate) => ({
      ...item,
      fullMatch: false,
      semantic: true,
    }));
  }
  const exact = candidates.filter((candidate) => candidate.fullMatch);
  return {
    key: `${Date.now()}-${index}`,
    spoken: spoken.description,
    quantity: spoken.quantity === null ? '' : String(spoken.quantity).replace('.', ','),
    unit: spoken.unit || '',
    price: spoken.unitPrice === null ? '' : String(spoken.unitPrice).replace('.', ','),
    candidates,
    choice: exact.length === 1 ? candidates.indexOf(exact[0]) : -1,
  };
}

export async function draftFromResult(
  result: VoiceResult,
  profileId: string
): Promise<{ items: VoiceDraftItem[]; message: string | null }> {
  const intent = String(result.agent?.intent || '');
  if (intent === 'remove_quote_items' || intent === 'edit_quote_items') {
    return {
      items: [],
      message:
        'A voce puoi solo aggiungere voci: per togliere o cambiare tocca la voce nella lista.',
    };
  }
  const spoken = extractSpokenItems(result);
  if (!spoken.length) {
    const question = result.agent?.clarification?.questions?.[0];
    return {
      items: [],
      message:
        typeof question === 'string' && question.trim()
          ? question.trim()
          : result.text
            ? `Non ho capito cosa aggiungere. Ho sentito: "${result.text}".`
            : (result as { reason?: string }).reason === 'noise'
              ? 'Ho sentito solo rumore: riprova parlando vicino al telefono, lontano da macchine accese.'
              : "L'audio è arrivato vuoto: il microfono non ha registrato la voce. Chiudi le altre app che usano il microfono e riprova.",
    };
  }
  const items = await Promise.all(
    spoken.map((item, i) => buildDraftItem(item, i, profileId))
  );
  return { items, message: null };
}

/** Markup of a price list item: its own, else the profile's. */
export const listinoMarkup = (item: VoiceCandidate, profileMarkup: number) =>
  Number(item.markup_percent) || profileMarkup;

/** Sale price shown while choosing (markup included). */
export const candidateSalePrice = (item: VoiceCandidate, profileMarkup: number) =>
  Number(item.unit_price) * (1 + listinoMarkup(item, profileMarkup) / 100);

/** Rows for preventivi_dettaglio from confirmed draft items. */
export function draftRows(
  items: VoiceDraftItem[],
  lavoroId: string,
  profileMarkup: number
) {
  return items.map((item) => {
    const match = item.candidates[item.choice];
    const ownPrice = parseItalianNumber(item.price);
    return {
      lavoro_id: lavoroId,
      description: match?.description || item.spoken,
      quantity: parseItalianNumber(item.quantity) as number,
      unit_price: ownPrice ?? (match ? Number(match.unit_price) : 0),
      tax_rate: ownPrice !== null ? 0 : match ? listinoMarkup(match, profileMarkup) : 0,
      listino_item_id: match?.id || null,
      // Empty: the database copies the unit of the price list item.
      unit: item.unit.trim() || null,
    };
  });
}

/** True on a phone or when opened from the home screen icon. */
export function prefersPhoneVersion(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const phone =
    window.matchMedia?.('(pointer: coarse)').matches && window.innerWidth < 768;
  return Boolean(standalone || phone);
}

const CURRENT_JOB_KEY = 'mastrovoce:m:current-job';
export function rememberJob(id: string | null) {
  try {
    if (id) window.localStorage.setItem(CURRENT_JOB_KEY, id);
    else window.localStorage.removeItem(CURRENT_JOB_KEY);
  } catch {
    // Storage unavailable: the job is chosen again.
  }
}
export function rememberedJob(): string | null {
  try {
    return window.localStorage.getItem(CURRENT_JOB_KEY);
  } catch {
    return null;
  }
}
