'use client';

import { useEffect, useState } from 'react';
import { EsempioTag, LockIcon, MicIcon, Phone } from './primitives';

/* Reconstructed app screens. Texts are the app's own (mobile/screens, mobile/components,
   web/app/q/[token]); data is the fictitious example job. Green and amber appear only
   inside these screens, because the real app uses them there. */

function Target({ withChange = false }: { withChange?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-md border-2 border-stone-200 bg-stone-50 p-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-base leading-5 text-mv-muted">Aggiungo a</p>
        <p className="text-base font-bold leading-6">
          Mario Esempio · Pensilina ingresso
        </p>
      </div>
      {withChange ? (
        <span className="rounded-md border-2 border-primary px-2.5 py-1.5 text-base font-bold text-primary">
          Cambia
        </span>
      ) : null}
    </div>
  );
}

function FromListino() {
  return (
    <span className="mt-1 inline-block rounded-sm bg-mv-mark px-1.5 text-base font-semibold text-primary-dark">
      dal tuo listino
    </span>
  );
}

/** Hero: the dictated sentence becomes a line with the price list price. */
export function HeroDictationScreen() {
  return (
    <Phone>
      <Target />
      <p className="mt-3 text-base italic leading-6 text-mv-muted">
        &ldquo;Sei metri di trave IPE 120…&rdquo;
      </p>
      <div className="mt-3 rounded-md border-2 border-primary bg-mv-mark p-3">
        <p className="text-base font-bold leading-6">Trave IPE 120 S275JR</p>
        <p className="text-base font-semibold tabular-nums text-primary-dark">
          6 m · 23,40 €/m
        </p>
        <FromListino />
      </div>
    </Phone>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Step 2: the home screen with the big orange microphone, idle and listening. */
export function MicScreen() {
  const reduced = usePrefersReducedMotion();
  const [listening, setListening] = useState(false);
  useEffect(() => {
    if (reduced) {
      setListening(false);
      return;
    }
    const id = window.setInterval(() => setListening((v) => !v), 3200);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <Phone>
      <p className="mt-2 text-center text-lg leading-7">
        Premi il microfono e detta la prima voce, per esempio: «due metri di tubo
        multistrato».
      </p>
      <div className="mt-6 flex flex-col items-center pb-2" aria-hidden="true">
        <div
          className={`flex h-40 w-40 items-center justify-center rounded-full ${
            listening ? 'mv-mic-pulse bg-primary-dark' : 'bg-primary'
          }`}
        >
          <MicIcon className="h-16 w-16 text-white" />
        </div>
        <p
          className={`mt-4 min-h-[56px] text-center text-lg font-bold leading-7 ${
            listening ? 'text-red-700' : 'text-stone-600'
          }`}
        >
          {listening ? 'Sto ascoltando: tocca per finire' : "Tocca e di' cosa aggiungere"}
        </p>
      </div>
      <p className="sr-only">
        Sotto il cerchio arancio: «Tocca e di&apos; cosa aggiungere». Durante la
        registrazione: «Sto ascoltando: tocca per finire».
      </p>
    </Phone>
  );
}

const CONFIRM_ITEMS = [
  { d: 'Trave IPE 120 S275JR', q: '6 m', p: '23,40 €/m' },
  {
    d: 'Ancorante chimico M12 con barra filettata e rondella',
    q: '8 pz',
    p: '6,90 €/pz',
  },
  { d: 'Manodopera fabbro', q: '12 h', p: '38,00 €/h' },
];

/** Step 3: the confirmation sheet after the dictation (VoiceConfirmSheet). */
export function ConfirmScreen() {
  return (
    <Phone>
      <Target withChange />
      <p className="mt-3 text-base italic leading-6 text-mv-muted">
        &ldquo;Sei metri di trave IPE 120, otto ancoranti chimici M12, e dodici ore di
        manodopera.&rdquo;
      </p>
      <ul className="mt-3 space-y-2.5">
        {CONFIRM_ITEMS.map((item) => (
          <li key={item.d} className="rounded-md border-2 border-stone-200 p-2.5">
            <p className="text-base font-bold leading-6">{item.d}</p>
            <p className="text-base font-semibold tabular-nums text-primary-dark">
              {item.q} · {item.p}
            </p>
            <FromListino />
            <div className="mt-2 flex items-center gap-2" aria-hidden="true">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-stone-100 text-xl font-bold">
                −
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-stone-100 text-xl font-bold">
                +
              </span>
              <span className="ml-auto rounded-md bg-red-100 px-3 py-2 text-base font-bold text-red-700">
                Togli
              </span>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex min-h-[56px] items-center justify-center rounded-md bg-[#15803d] text-lg font-bold text-white">
        ✓ Aggiungi 3 voci
      </div>
    </Phone>
  );
}

/** Step 3: the warning when a spoken item can be more than one article. */
export function ChoiceBox() {
  return (
    <div className="relative rounded-md border border-mv-line bg-mv-sheet p-4 text-mv-ink">
      <EsempioTag className="absolute -top-3 right-3" />
      <span className="sr-only">Schermata d&apos;esempio dell&apos;app</span>
      <p className="text-base italic text-mv-muted">&ldquo;tubolare ottanta&rdquo;</p>
      <p className="mt-2 text-base font-bold text-amber-800">
        Più articoli possibili: scegli quello giusto
      </p>
      <ul className="mt-3 space-y-2">
        <li className="rounded-md border-2 border-stone-200 px-3 py-2.5 text-base font-semibold">
          Tubolare quadro 80×80×3 S235
        </li>
        <li className="rounded-md border-2 border-stone-200 px-3 py-2.5 text-base font-semibold">
          Tubolare rettangolare 80×40×3 S235
        </li>
      </ul>
    </div>
  );
}

/** Step 1: a piece of an example price list. */
export function ListinoSample() {
  const rows = [
    ['Trave IPE 120 S275JR', 'm', '23,40 €'],
    ['Tubolare quadro 80×80×3 S235', 'm', '14,20 €'],
    ['Tubolare rettangolare 80×40×3 S235', 'm', '11,60 €'],
    ['Ancorante chimico M12 con barra filettata e rondella', 'pz', '6,90 €'],
    ['Manodopera fabbro', 'h', '38,00 €'],
  ];
  return (
    <div className="relative rounded-sm border border-mv-line bg-mv-sheet p-4 text-mv-ink sm:p-5">
      <EsempioTag className="absolute -top-3 right-3" />
      <p className="text-lg font-bold">Listino d&apos;esempio</p>
      <table className="mt-3 w-full border-collapse text-left text-base leading-6">
        <thead>
          <tr className="border-b border-mv-ink">
            <th scope="col" className="py-1.5 pr-2 font-semibold">
              Articolo
            </th>
            <th scope="col" className="px-2 py-1.5 font-semibold">
              U.m.
            </th>
            <th scope="col" className="py-1.5 pl-2 text-right font-semibold">
              Prezzo
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, u, p]) => (
            <tr key={a} className="border-b border-mv-line align-top">
              <td className="py-2 pr-2">{a}</td>
              <td className="px-2 py-2">{u}</td>
              <td className="whitespace-nowrap py-2 pl-2 text-right tabular-nums">{p}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Step 5, before: the page the client opens from the link (web/app/q/[token]). */
export function ClientBeforeScreen() {
  const bar = 'h-2.5 rounded-sm bg-stone-200';
  return (
    <Phone light label="Schermata d'esempio della pagina che vede il cliente">
      <p className="text-lg font-semibold leading-6">
        Preventivo di Carpenteria Esempio s.r.l.
      </p>
      <div
        aria-hidden="true"
        className="mt-3 space-y-2 rounded-md border border-stone-200 bg-white p-3"
      >
        <div className={`${bar} w-1/2`} />
        <div className={bar} />
        <div className={bar} />
        <div className={`${bar} w-3/4`} />
        <div className="ml-auto h-2.5 w-1/3 rounded-sm bg-stone-300" />
      </div>
      <p className="mt-3 text-base leading-6 text-stone-700">
        Nome e cognome (necessari per accettare)
      </p>
      <p className="mt-1 rounded-md border border-stone-300 px-3 py-2 text-base">
        Mario Esempio
      </p>
      <p className="mt-3 text-base leading-6 text-stone-700">
        Note per il fornitore (facoltative)
      </p>
      <p className="mt-1 rounded-md border border-stone-300 px-3 py-2 text-base leading-6">
        Va bene anche il colore grigio antracite?
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-md bg-green-700 px-4 py-2.5 text-base font-semibold text-white">
          Accetto il preventivo
        </span>
        <span className="rounded-md border border-stone-300 px-4 py-2.5 text-base font-semibold text-stone-700">
          Rifiuto
        </span>
      </div>
    </Phone>
  );
}

/** Step 5, after: the quote is locked. */
export function ClientAfterScreen() {
  const bar = 'h-2.5 rounded-sm bg-stone-200';
  return (
    <Phone light label="Schermata d'esempio della pagina che vede il cliente">
      <p className="text-lg font-semibold leading-6">
        Preventivo di Carpenteria Esempio s.r.l.
      </p>
      <div
        aria-hidden="true"
        className="mt-3 space-y-2 rounded-md border border-stone-200 bg-white p-3"
      >
        <div className={`${bar} w-1/2`} />
        <div className={bar} />
        <div className={bar} />
        <div className={`${bar} w-3/4`} />
        <div className="ml-auto h-2.5 w-1/3 rounded-sm bg-stone-300" />
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-md border border-stone-200 bg-white p-3">
        <LockIcon className="mt-0.5 h-6 w-6 shrink-0 text-mv-ink" />
        <p className="text-base leading-6">
          Preventivo accettato da Mario Esempio il 14/11/2026.
        </p>
      </div>
    </Phone>
  );
}

/** Closing: the Preventivi screen on the "Accettati" tab. */
export function PreventiviScreen() {
  const tabs = ['Accettati', 'In attesa', 'Da inviare', 'Rifiutati'];
  const rows = [
    ['Mario Esempio · Pensilina ingresso', 'Accettato il 14/11/2026'],
    ['Condominio Esempio · Ringhiera scala B', 'Accettato il 10/11/2026'],
    ['Luisa Esempio · Cancello carraio', 'Accettato il 03/11/2026'],
  ];
  return (
    <Phone>
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((tab, i) => (
          <span
            key={tab}
            className={`rounded-md px-2.5 py-1.5 text-base font-semibold ${
              i === 0 ? 'bg-primary text-white' : 'bg-stone-100 text-mv-ink'
            }`}
          >
            {tab}
            {i === 0 ? <span className="sr-only"> (scheda attiva)</span> : null}
          </span>
        ))}
      </div>
      <ul className="mt-3 space-y-2.5">
        {rows.map(([title, when]) => (
          <li key={title} className="rounded-md border border-stone-200 p-3">
            <p className="text-base font-bold leading-6">{title}</p>
            <p className="mt-1 inline-flex items-center gap-1 rounded-sm bg-green-100 px-1.5 text-base font-semibold text-green-800">
              <LockIcon className="h-4 w-4" />
              {when}
            </p>
          </li>
        ))}
      </ul>
    </Phone>
  );
}
