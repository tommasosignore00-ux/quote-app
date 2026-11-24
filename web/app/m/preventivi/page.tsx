'use client';

import { useEffect, useMemo, useState } from 'react';
import { Clock, Lock, Phone, Send, XCircle } from 'lucide-react';
import {
  fetchQuoteVersions,
  latestPerJob,
  quoteStage,
  STAGE_LABELS,
  type QuoteStage,
  type QuoteVersionRow,
} from '@/lib/quoteTracking';
import { Chip, Notice, PageTitle, Sheet, StatusPill } from '@/components/m/ui';

const FILTERS: Array<{ key: QuoteStage | 'all'; label: string }> = [
  { key: 'all', label: 'Tutti' },
  { key: 'accepted', label: 'Accettati' },
  { key: 'sent', label: 'In attesa' },
  { key: 'validated', label: 'Da inviare' },
  { key: 'rejected', label: 'Rifiutati' },
];

const STAGE_PILL = {
  accepted: { kind: 'accepted', Icon: Lock },
  rejected: { kind: 'refused', Icon: XCircle },
  sent: { kind: 'waiting', Icon: Clock },
  validated: { kind: 'toSend', Icon: Send },
} as const;

const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      })
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
      <PageTitle back="/m" backLabel="Lavori">
        Preventivi
      </PageTitle>
      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {FILTERS.map((item) => (
          <Chip
            key={item.key}
            rounded
            selected={filter === item.key}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </Chip>
        ))}
      </div>
      <div className="space-y-3 px-4">
        {error ? (
          <Notice tone="error">Preventivi non caricati. Riprova tra poco.</Notice>
        ) : null}
        {loaded && !error && !visible.length ? (
          <Notice>
            {rows.length
              ? 'Nessun preventivo in questa sezione.'
              : 'Qui trovi i preventivi che mandi. Si preparano da un lavoro.'}
          </Notice>
        ) : null}
        {visible.map((row) => {
          const stage = quoteStage(row);
          const waiting = daysWaiting(row);
          const phone = row.lavori?.clienti?.phone?.trim();
          return (
            <article
              key={row.id}
              className="rounded-[20px] border border-mv-line bg-mv-sheet p-4"
            >
              <button
                type="button"
                onClick={() => open(row)}
                className="flex w-full flex-col gap-2 text-left active:opacity-70"
              >
                <p className="line-clamp-2 text-xl font-bold">
                  {row.lavori?.clienti?.name || '—'} · {row.lavori?.title || '—'}
                </p>
                <StatusPill
                  kind={STAGE_PILL[stage].kind}
                  icon={(() => {
                    const Icon = stage === 'accepted' ? Lock : STAGE_PILL[stage].Icon;
                    return <Icon className="h-5 w-5" />;
                  })()}
                >
                  {STAGE_LABELS[stage]}
                </StatusPill>
                <p className="text-base font-semibold text-mv-muted">
                  Revisione {row.revision}
                  {row.sent_at ? ` · Inviato il ${date(row.sent_at)}` : ''}
                </p>
                {row.client_decision ? (
                  <p className="text-base font-semibold">
                    {row.client_decision === 'accepted' ? 'Accettato' : 'Rifiutato'} il{' '}
                    {date(row.client_decision_at)}
                  </p>
                ) : null}
              </button>
              {waiting >= 3 ? (
                <div className="mt-3">
                  <p className="flex items-center gap-1.5 text-lg font-bold text-amber-800">
                    <Clock className="h-[22px] w-[22px]" /> In attesa da {waiting} giorni
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
