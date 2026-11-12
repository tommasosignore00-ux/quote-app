'use client';

import { useEffect, useRef, useState } from 'react';
import { EsempioTag } from './primitives';

/** The example job used across the whole page (fictitious firm, see landing-visual.md). */
export const QUOTE_ROWS = [
  {
    d: 'Trave IPE 120 S275JR',
    um: 'm',
    q: '6',
    p: '23,40 €',
    t: '140,40 €',
    dictated: true,
  },
  {
    d: 'Tubolare quadro 80×80×3 S235 (pilastri)',
    um: 'm',
    q: '4',
    p: '14,20 €',
    t: '56,80 €',
  },
  {
    d: 'Piastra di base 200×200×10 mm, 4 fori',
    um: 'pz',
    q: '2',
    p: '18,50 €',
    t: '37,00 €',
  },
  {
    d: 'Ancorante chimico M12 con barra filettata e rondella',
    um: 'pz',
    q: '8',
    p: '6,90 €',
    t: '55,20 €',
    dictated: true,
  },
  {
    d: 'Lamiera grecata zincata sp. 6/10',
    um: 'm²',
    q: '7,5',
    p: '16,80 €',
    t: '126,00 €',
  },
  { d: 'Zincatura a caldo', um: 'kg', q: '95', p: '0,85 €', t: '80,75 €' },
  {
    d: 'Manodopera fabbro',
    um: 'h',
    q: '12',
    p: '38,00 €',
    t: '456,00 €',
    dictated: true,
  },
  { d: 'Trasporto e posa in opera', um: 'a corpo', q: '1', p: '120,00 €', t: '120,00 €' },
] as const;

function qty(row: (typeof QUOTE_ROWS)[number]) {
  return row.um === 'a corpo' ? 'a corpo' : `${row.q} ${row.um}`;
}

/**
 * The example quote document of Carpenteria Esempio s.r.l.
 * `preview`: first five rows, three columns (hero). `full`: all eight rows with
 * header, conditions and the rows dictated at step 3 marked.
 */
export function QuoteSheet({ variant }: { variant: 'preview' | 'full' }) {
  const full = variant === 'full';
  const rows = full ? QUOTE_ROWS : QUOTE_ROWS.slice(0, 5);
  const ref = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!full || !ref.current || typeof IntersectionObserver === 'undefined') return;
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setFlash(true);
          io.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [full]);

  return (
    <div
      ref={ref}
      className="relative rounded-sm border border-mv-line bg-mv-sheet text-mv-ink shadow-[0_1px_2px_rgba(15,23,42,0.06),0_6px_18px_rgba(15,23,42,0.06)]"
    >
      <EsempioTag className="absolute -top-3 right-3 z-10" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex select-none items-center justify-center overflow-hidden"
      >
        <span
          className="mv-display block text-[88px] font-bold text-mv-ink/[0.06] sm:text-[128px]"
          style={{ transform: 'rotate(-28deg)' }}
        >
          ESEMPIO
        </span>
      </div>

      <div className="relative p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="mv-display flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border-2 border-mv-ink text-xl font-bold"
          >
            CE
          </div>
          <div>
            <p className="text-lg font-bold leading-6">Carpenteria Esempio s.r.l.</p>
            <p className="text-base leading-6 text-mv-muted">
              ditta di esempio, non esiste
            </p>
          </div>
        </div>
        {full ? (
          <p className="mt-3 text-base leading-6 text-mv-muted">
            Via dell&apos;Officina 1, 00000 Città Esempio · P.IVA 00000000000 (esempio) ·
            Tel. 000 000 0000 (esempio)
          </p>
        ) : null}

        <div className="mt-3 border-t border-mv-ink pt-2 text-base leading-6 sm:mt-4 sm:pt-3">
          <p className="font-semibold">
            Preventivo n. 2026/014 (esempio) · 12/11/2026
            {full ? ' · valido 30 giorni' : ''}
          </p>
          <p>Cliente: Mario Esempio · Lavoro: Pensilina ingresso</p>
        </div>

        <table className="mt-3 w-full border-collapse text-left text-base leading-6">
          <caption className="sr-only">Righe del preventivo d&apos;esempio</caption>
          <thead>
            <tr className="border-b border-mv-ink">
              <th scope="col" className="py-1.5 pr-2 font-semibold">
                Descrizione
              </th>
              <th
                scope="col"
                className="whitespace-nowrap px-2 py-1.5 text-right font-semibold"
              >
                Q.tà
              </th>
              {full ? (
                <th
                  scope="col"
                  className="hidden whitespace-nowrap px-2 py-1.5 text-right font-semibold md:table-cell"
                >
                  Prezzo unit.
                </th>
              ) : null}
              <th
                scope="col"
                className="whitespace-nowrap py-1.5 pl-2 text-right font-semibold"
              >
                Importo
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const marked = full && 'dictated' in row && row.dictated;
              return (
                <tr
                  key={row.d}
                  className={`border-b border-mv-line align-top ${marked && flash ? 'mv-row-flash' : ''}`}
                >
                  <td
                    className={`py-1.5 pr-2 ${marked ? 'border-l-4 border-primary pl-2' : ''}`}
                  >
                    {row.d}
                    {marked ? (
                      <span className="sr-only"> (dettata al passo 3)</span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                    {qty(row)}
                  </td>
                  {full ? (
                    <td className="hidden whitespace-nowrap px-2 py-2 text-right tabular-nums md:table-cell">
                      {row.p}
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap py-1.5 pl-2 text-right tabular-nums">
                    {row.t}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!full ? <p className="mt-2 text-base text-mv-muted">+ altre 3 righe</p> : null}

        <dl className="ml-auto mt-4 max-w-[20rem] text-base leading-7 tabular-nums">
          <div className="flex justify-between gap-4">
            <dt>TOTALE IMPONIBILE</dt>
            <dd>1.072,15 €</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>IVA 22%</dt>
            <dd>235,87 €</dd>
          </div>
          <div className="flex justify-between gap-4 border-t-2 border-mv-ink pt-1 text-lg font-bold">
            <dt>TOTALE</dt>
            <dd>1.308,02 €</dd>
          </div>
        </dl>
        <p className="mt-3 text-base leading-6 text-mv-muted">
          Aliquota IVA d&apos;esempio: l&apos;aliquota reale dipende dal lavoro.
        </p>
        {full ? (
          <p className="mt-3 text-base leading-6">
            Pagamento: 40% all&apos;ordine, saldo a fine lavori. Tempi: 15 giorni
            lavorativi dall&apos;accettazione.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** "Your Word template": a fictitious template, only the shape of a document. */
export function WordTemplateSheet() {
  const bar = 'h-3 rounded-sm bg-stone-200';
  return (
    <div className="relative rounded-sm border border-mv-line bg-mv-sheet p-4 text-mv-ink sm:p-6">
      <EsempioTag className="absolute -top-3 right-3" />
      <div className="flex items-center gap-3 pr-24">
        <div className="flex h-14 w-28 items-center justify-center rounded-sm border-2 border-dashed border-mv-muted px-2 text-center text-base font-semibold leading-5 text-mv-muted">
          La tua azienda qui
        </div>
      </div>
      <div aria-hidden="true" className="mt-5 space-y-2">
        <div className={`${bar} w-2/3`} />
        <div className={`${bar} w-1/2`} />
      </div>
      <div aria-hidden="true" className="mt-6 border-t border-mv-ink pt-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 border-b border-mv-line py-2.5">
            <div className={`${bar} flex-1`} />
            <div className={`${bar} w-10`} />
            <div className={`${bar} w-14`} />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="ml-auto mt-5 w-1/2 space-y-2">
        <div className={bar} />
        <div className={bar} />
        <div className="h-3 rounded-sm bg-stone-300" />
      </div>
      <div aria-hidden="true" className="mt-6 space-y-2">
        <div className={`${bar} w-full`} />
        <div className={`${bar} w-5/6`} />
      </div>
    </div>
  );
}
