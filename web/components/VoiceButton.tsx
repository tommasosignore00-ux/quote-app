'use client';

import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import type { VoiceResult } from '@/lib/voiceResult';

type Cliente = { id: string; name: string };

type VoiceButtonProps = {
  onResult: (result: VoiceResult) => void;
  clienti?: Cliente[];
  context?: Record<string, unknown>;
};

const VOICE_ERROR = 'Elaborazione vocale non riuscita, riprova.';

// Safari records mp4, Chrome webm: the transcription reads the format from the extension.
function audioFileName(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'recording.m4a';
  if (mimeType.includes('ogg')) return 'recording.ogg';
  return 'recording.webm';
}

export default function VoiceButton({
  onResult,
  clienti = [],
  context,
}: VoiceButtonProps) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        try {
          const mimeType = mr.mimeType || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const formData = new FormData();
          formData.append('audio', blob, audioFileName(mimeType));
          formData.append(
            'clienti',
            JSON.stringify(clienti.map((c) => ({ id: c.id, name: c.name })))
          );
          if (context) {
            formData.append('context', JSON.stringify(context));
          }
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session?.access_token) {
            toast.error("Sessione scaduta: effettua di nuovo l'accesso.");
            return;
          }
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
            toast.error(result?.error || VOICE_ERROR);
            return;
          }
          onResult(result);
        } catch (err) {
          console.error(err);
          toast.error(VOICE_ERROR);
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (err) {
      console.error(err);
      toast.error('Non riesco a usare il microfono: controlla i permessi del browser.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setRecording(false);
  };

  const handleClick = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  return (
    <button
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold shadow-lg transition focus:outline-none focus:ring-4 focus:ring-red-300 ${
        recording ? 'bg-red-700 animate-pulse' : 'bg-primary hover:bg-primary-dark'
      }`}
      title={recording ? t('main.stop') : t('main.record')}
      aria-label={
        recording
          ? t('main.stop') || 'Ferma registrazione'
          : t('main.record') || 'Avvia registrazione vocale'
      }
      aria-pressed={recording}
      role="button"
      tabIndex={0}
    >
      <span aria-hidden="true">{recording ? '⏹' : '🎤'}</span>
      {recording && <span className="sr-only">Registrazione in corso...</span>}
    </button>
  );
}
