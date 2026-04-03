'use client';

import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';

type Cliente = { id: string; name: string };

type VoiceButtonProps = {
  onResult: (result: { action: string; data?: Record<string, unknown> }) => void;
  clienti?: Cliente[];
};

export default function VoiceButton({ onResult, clienti = [] }: VoiceButtonProps) {
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
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', blob, 'recording.webm');
        formData.append('clienti', JSON.stringify(clienti.map(c => ({ id: c.id, name: c.name }))));
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        const res = await fetch(`${supabaseUrl}/functions/v1/voice-process`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: formData,
        });
        const result = await res.json();
        if (result.action) onResult(result);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (err) {
      console.error(err);
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
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
      className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold shadow-lg transition focus:outline-none focus:ring-4 focus:ring-red-300 ${
        recording ? 'bg-red-700 animate-pulse' : 'bg-primary hover:bg-primary-dark'
      }`}
      title={recording ? t('main.stop') : t('main.record')}
      aria-label={recording ? t('main.stop') || 'Ferma registrazione' : t('main.record') || 'Avvia registrazione vocale'}
      aria-pressed={recording}
      role="button"
      tabIndex={0}
    >
      <span aria-hidden="true">{recording ? '⏹' : '🎤'}</span>
      {recording && <span className="sr-only">Registrazione in corso...</span>}
    </button>
  );
}
