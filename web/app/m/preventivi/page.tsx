'use client';

import { useEffect, useMemo, useState } from 'react';
import { Phone } from 'lucide-react';
import {
  fetchQuoteVersions,
  latestPerJob,
  quoteStage,
  STAGE_LABELS,
  type QuoteStage,
  type QuoteVersionRow,
} from '@/lib/quoteTracking';
import { Notice, PageTitle, Sheet } from '@/components/m/ui';

const FILTERS: Array<{ key: QuoteStage | 'all'; label: string }> = [
  { key: 'all', label: 'Tutti' },
  { key: 'accepted', label: 'Accettati' },
  { key: 'sent', label: 'In attesa' },
  { key: 'validated', label: 'Da inviare' },
  { key: 'rejected', label: 'Rifiutati' },
];

const STAGE_STYLE: Record<QuoteStage, string> = {
  accepted: 'bg-green-100 text-green-900',
  rejected: 'bg-red-100 text-red-900',
  sent: 'bg-amber-100 text-amber-900',
  validated: 'bg-mv-soft text-mv-ink',
};

const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
    : '';

/** Days a sent quote has waited for an answer; shown from the third day. */
const daysWaiting = (row: QuoteVersionRow) =>
  !row.sent_at || row.client_decision
    ? 0
    : Math.floor((Date.now() - new Date(row.sent_at).getTime()) / 86_400_000);

export default function MobileQuotes() {
  const [rows, setRows] = useState<QuoteVersionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<QuoteStage | 'all'>('all');
  const [viewing, setViewing] = useState<QuoteVersionRow | null>(null);
  const [html, setHtml] = useState('');

  useEffect(() => {
    fetchQuoteVersions()
      .then((data) => setRows(latestPerJob(data)))
      .catch(() => setError(true))
      .finally(() => setLoaded(true));
  }, []);

  const visible = useMemo(
    () => rows.filter((row) => filter === 'all' || quoteStage(row) === filter),
    [rows, filter]
  );

  const open = async (row: QuoteVersionRow) => {
    setViewing(row);
    setHtml('');
    const { supabase } = await import('@/lib/supabase');
    const { data } = await supabase
      .from('preventivi_versioni')
      .select('html_content')
      .eq('id', row.id)
      .single();
    setHtml(data?.html_content || '');
  };

  return (
    <main>
      <PageTitle>Preventivi</PageTitle>
      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
            className={`min-h-[56px] shrink-0 rounded-full px-5 text-lg font-bold ${
              filter === item.key
                ? 'bg-primary text-white'
                : 'border-2 border-mv-line bg-mv-sheet'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="space-y-3 px-4">
        {error ? (
          <Notice tone="error">Preventivi non caricati. Riprova tra poco.</Notice>
        ) : null}
        {loaded && !error && !visible.length ? (
          <Notice>Nessun preventivo in questa sezione.</Notice>
        ) : null}
        {visible.map((row) => {
          const stage = quoteStage(row);
          const waiting = daysWaiting(row);
          const phone = row.lavori?.clienti?.phone?.trim();
          return (
            <article
              key={row.id}
              className="rounded-2xl border-2 border-mv-line bg-mv-sheet p-4"
            >
              <button
                type="button"
                onClick={() => open(row)}
                className="block w-full text-left"
              >
                <p className="text-xl font-bold">
                  {row.lavori?.clienti?.name || '—'} · {row.lavori?.title || '—'}
                </p>
                <span
                  className={`mt-2 inline-block rounded-lg px-3 py-1 text-base font-bold ${STAGE_STYLE[stage]}`}
                >
                  {STAGE_LABELS[stage]}
                </span>
                <p className="mt-2 text-base text-mv-muted">
                  Revisione {row.revision}
                  {row.sent_at ? ` · inviato il ${date(row.sent_at)}` : ''}
                  {row.client_decision_at
                    ? ` · risposta il ${date(row.client_decision_at)}`
                    : ''}
                </p>
              </button>
              {waiting >= 3 ? (
                <div className="mt-3">
                  <p className="text-lg font-bold text-amber-900">
                    In attesa da {waiting} giorni
                  </p>
                  {phone ? (
                    <a
                      href={`tel:${phone.replace(/[^+\d]/g, '')}`}
                      className="mt-2 flex min-h-[64px] items-center justify-center gap-2 rounded-xl border-2 border-mv-ink text-xl font-bold"
                    >
                      <Phone className="h-6 w-6" /> Chiama il cliente
                    </a>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <Sheet open={Boolean(viewing)} onClose={() => setViewing(null)} title="Preventivo">
        {html ? (
          <iframe
            title="Preventivo"
            sandbox=""
            srcDoc={html}
            className="h-[70dvh] w-full rounded-xl border-2 border-mv-line bg-white"
          />
        ) : (
          <p className="text-lg">Caricamento…</p>
        )}
      </Sheet>
    </main>
  );
}
