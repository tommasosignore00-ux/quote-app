'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  fetchUnseenAcceptances,
  markAcceptanceSeen,
  type QuoteVersionRow,
} from '@/lib/quoteTracking';

/** "Preventivo accettato": appears live, or at the next visit if the owner was away. */
export default function QuoteAcceptedPopup() {
  const [queue, setQueue] = useState<QuoteVersionRow[]>([]);

  const refresh = useCallback(async () => {
    setQueue(await fetchUnseenAcceptances());
  }, []);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel('quote-acceptances')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'preventivi_versioni' },
        refresh
      )
      .subscribe();
    window.addEventListener('focus', refresh);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  const current = queue[0];
  if (!current) return null;

  const close = async () => {
    setQueue((items) => items.slice(1));
    await markAcceptanceSeen(current.id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quote-accepted-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700">
          ✓
        </div>
        <h2 id="quote-accepted-title" className="text-2xl font-bold text-slate-900">
          Preventivo accettato
        </h2>
        <p className="mt-3 text-lg text-slate-700">
          {current.lavori?.clienti?.name || 'Il cliente'} ha accettato{' '}
          <strong>{current.lavori?.title || 'il preventivo'}</strong>
        </p>
        <p className="mt-1 text-slate-500">
          Il preventivo è bloccato: non si può più modificare.
        </p>
        {current.client_signer_name ? (
          <p className="mt-1 text-slate-500">Firmato da {current.client_signer_name}</p>
        ) : null}
        {current.client_note ? (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-left text-slate-700">
            {current.client_note}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/dashboard/preventivi"
            onClick={close}
            className="rounded-lg bg-primary px-4 py-3 font-semibold text-white"
          >
            Vedi nei preventivi
          </Link>
          <button onClick={close} className="rounded-lg border px-4 py-3 font-semibold">
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
