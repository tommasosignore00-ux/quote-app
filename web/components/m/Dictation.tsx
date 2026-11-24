'use client';

/** Microphone + confirmation for one job: dictate, check, then the lines are saved. */

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  draftFromResult,
  draftRows,
  sendDictation,
  useVoiceRecorder,
  type Costo,
  type Lavoro,
  type VoiceDraftItem,
} from '@/lib/mobileWeb';
import { useMobileProfile } from './profile';
import { MicButton, Notice } from './ui';
import VoiceSheet from './VoiceSheet';

type Props = {
  job: Lavoro | null;
  clientName: string;
  size?: 'big' | 'small';
  /**
   * Like the app: with no job yet you dictate first, and the job is asked when you
   * confirm the lines. Resolves to null when the user gives up.
   */
  chooseJob?: () => Promise<{ job: Lavoro; clientName: string } | null>;
  onSaved: (rows: Costo[], job: Lavoro) => void;
};

export default function Dictation({
  job,
  clientName,
  size = 'big',
  chooseJob,
  onSaved,
}: Props) {
  const profile = useMobileProfile();
  const [draft, setDraft] = useState<{
    transcript: string;
    items: VoiceDraftItem[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const recorder = useVoiceRecorder(async (blob) => {
    try {
      const result = await sendDictation(blob, {
        appLanguage: 'it',
        selectedInputLanguage: 'it',
        userIntentMode: 'voice',
        company: {
          country: 'IT',
          locale: 'it-IT',
          currency: 'EUR',
          defaultVatRate: profile.vatPercent,
          vatMode: 'standard',
        },
        ...(job
          ? {
              currentCustomer: {
                id: job.cliente_id,
                name: clientName,
                companyName: clientName,
              },
              currentJob: { id: job.id, customerId: job.cliente_id, title: job.title },
            }
          : {}),
      });
      const { items, message: problem } = await draftFromResult(result, profile.id);
      if (problem) setMessage(problem);
      else setDraft({ transcript: result.text || '', items });
    } catch (err) {
      setMessage((err as Error).message);
    }
  });

  const press = () => {
    setMessage(null);
    recorder.setError(null);
    if (!job && !chooseJob) return;
    recorder.toggle();
  };

  const confirm = async (items: VoiceDraftItem[]) => {
    let target = job;
    if (!target) {
      const chosen = await chooseJob?.();
      if (!chosen) return;
      target = chosen.job;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from('preventivi_dettaglio')
      .insert(draftRows(items, target.id, profile.materialMarkup))
      .select('*');
    setSaving(false);
    if (error) {
      setMessage('Voci non salvate. Riprova.');
      return;
    }
    supabase
      .from('lavori')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', target.id)
      .then(() => {});
    setDraft(null);
    navigator.vibrate?.(30);
    onSaved((data || []) as Costo[], target);
  };

  const problem = message || recorder.error;
  return (
    <>
      <MicButton
        state={recorder.state}
        seconds={recorder.seconds}
        onPress={press}
        size={size}
        level={recorder.level}
      />
      {problem ? (
        <div className={size === 'big' ? 'mt-4 w-full' : 'mt-2 max-w-[260px]'}>
          <Notice tone="error">{problem}</Notice>
        </div>
      ) : null}
      {draft ? (
        <VoiceSheet
          open
          transcript={draft.transcript}
          initialItems={draft.items}
          jobLabel={job ? `${clientName} · ${job.title}` : 'Dopo ti chiedo il lavoro'}
          profileMarkup={profile.materialMarkup}
          saving={saving}
          onConfirm={confirm}
          onCancel={() => setDraft(null)}
        />
      ) : null}
    </>
  );
}
