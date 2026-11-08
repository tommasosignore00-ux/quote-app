'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  fetchQuoteVersions,
  latestPerJob,
  quoteStage,
  STAGE_LABELS,
  type QuoteStage,
  type QuoteVersionRow,
} from '@/lib/quoteTracking';

const STAGE_STYLES: Record<QuoteStage, string> = {
  accepted: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  sent: 'bg-amber-100 text-amber-800',
  validated: 'bg-slate-100 text-slate-700',
};

const FILTERS: Array<{ key: QuoteStage | 'all'; label: string }> = [
  { key: 'all', label: 'Tutti' },
  { key: 'accepted', label: 'Accettati' },
  { key: 'sent', label: 'In attesa' },
  { key: 'validated', label: 'Da inviare' },
  { key: 'rejected', label: 'Rifiutati' },
];

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export default function PreventiviPage() {
  const [rows, setRows] = useState<QuoteVersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<QuoteStage | 'all'>('all');
  const [viewing, setViewing] = useState<{ title: string; html: string } | null>(null);

  useEffect(() => {
    fetchQuoteVersions()
      .then((data) => setRows(latestPerJob(data)))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(
    () => rows.filter((row) => filter === 'all' || quoteStage(row) === filter),
    [rows, filter]
  );

  const openQuote = async (row: QuoteVersionRow) => {
    const { data, error: readError } = await supabase
      .from('preventivi_versioni')
      .select('html_content')
      .eq('id', row.id)
      .single();
    if (readError) {
      setError(readError.message);
      return;
    }
    setViewing({
      title: row.lavori?.title || 'Preventivo',
      html: data?.html_content || '',
    });
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Preventivi</h1>
      <p className="mt-1 text-slate-600">
        A che punto è ogni preventivo. Quelli accettati dal cliente sono definitivi e non
        si possono più modificare.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${filter === item.key ? 'bg-primary text-white' : 'bg-white text-slate-700 shadow'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? <p className="mt-4 text-red-700">{error}</p> : null}
      {loading ? <p className="mt-6 text-slate-500">Caricamento...</p> : null}
      {!loading && !visible.length ? (
        <p className="mt-6 text-slate-500">Nessun preventivo in questa sezione.</p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {visible.map((row) => {
          const stage = quoteStage(row);
          return (
            <li key={row.id} className="rounded-xl bg-white p-4 shadow">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {row.lavori?.clienti?.name || '—'} · {row.lavori?.title || '—'}
                  </p>
                  <p className="text-sm text-slate-500">
                    Revisione {row.revision}
                    {row.sent_at
                      ? ` · Inviato il ${formatDate(row.sent_at)}${row.recipient_email ? ` a ${row.recipient_email}` : ''}`
                      : ''}
                  </p>
                  {row.client_decision ? (
                    <p className="mt-1 text-sm text-slate-700">
                      {row.client_decision === 'accepted' ? 'Accettato' : 'Rifiutato'} il{' '}
                      {formatDate(row.client_decision_at)}
                      {row.client_signer_name ? ` da ${row.client_signer_name}` : ''}
                    </p>
                  ) : null}
                  {row.client_note ? (
                    <p className="mt-1 text-sm italic text-slate-600">
                      {row.client_note}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${STAGE_STYLES[stage]}`}
                  >
                    {stage === 'accepted' ? '🔒 ' : ''}
                    {STAGE_LABELS[stage]}
                  </span>
                  <button onClick={() => openQuote(row)} className="btn-secondary">
                    Apri
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {viewing ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={viewing.title}
        >
          <div className="flex h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">{viewing.title}</h2>
              <button onClick={() => setViewing(null)} className="btn-secondary">
                Chiudi
              </button>
            </div>
            {/* sandbox with no permissions: stored HTML can neither run scripts nor navigate. */}
            <iframe
              title={viewing.title}
              sandbox=""
              srcDoc={viewing.html}
              className="w-full flex-1 rounded border"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
