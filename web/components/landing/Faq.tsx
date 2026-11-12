import Link from 'next/link';
import type { ReactNode } from 'react';

interface Qa {
  q: string;
  a: ReactNode;
}

const WORK: Qa[] = [
  {
    q: "Non ho tempo di stare dietro a un'altra app.",
    a: "Listino e modello li prepari all'inizio, una volta. Dopo, sul lavoro, a te resta parlare e controllare.",
  },
  {
    q: 'Ho già il mio Excel.',
    a: 'Tienilo: lo carichi come listino. Cambia che non ricopi più i prezzi a mano.',
  },
  {
    q: 'Non ho un listino. I prezzi li ho in testa.',
    a: 'Va bene lo stesso. Detti le voci e il prezzo lo scrivi tu.',
  },
  {
    q: "Non mi fido di un'app.",
    a: 'Niente si salva senza il tuo sì: ogni riga la vedi prima. Il cliente vede il tuo nome, non il nostro. Quando accetta, resta registrato chi ha accettato e quando. È la registrazione di quello che ha risposto, non una garanzia legale.',
  },
  {
    q: 'E se capisce male?',
    a: 'Vedi sempre la frase che ha capito e le righe che ne escono. Se una riga è sbagliata la togli e la ridici. Se una voce può essere più articoli, ti chiede quale.',
  },
  {
    q: "In cantiere non c'è campo.",
    a: 'La registrazione resta salvata e parte quando torna il segnale.',
  },
  {
    q: "Che cos'è METEL?",
    a: "È il formato di listino che usano molti grossisti, soprattutto nel materiale elettrico. Se non sai cos'è, non ti serve: va bene anche un PDF o un Excel.",
  },
  {
    q: 'Devo mettermi al computer?',
    a: 'In cantiere lo usi dal telefono, in ufficio dal computer.',
  },
  {
    q: 'Quanto mi costa?',
    a: '€29,99 al mese, con 14 giorni di prova per provarlo con i tuoi prezzi. Disdici quando vuoi dalla tua area account. Se sei tra i primi 50 clienti puoi scegliere il prezzo fondatori: lo trovi qui sotto.',
  },
];

const OFFICE: Qa[] = [
  {
    q: 'Cosa succede quando il cliente accetta?',
    a: 'Il preventivo si blocca e resta nella lista Preventivi come accettato. Mastrovoce non fa fatture e non manda fatture elettroniche: la fattura la fate con il programma che usate già.',
  },
  {
    q: 'Il modello Word va preparato in qualche modo?',
    a: 'Basta un vostro preventivo fatto in Word. Prima di caricarlo togliete nomi e indirizzi dei clienti.',
  },
  {
    q: 'Siamo in più persone.',
    a: "C'è il piano Team: 5 utenti, titolare compreso, a €79,99 al mese. Ogni utente in più costa €9,99 al mese, fino a 10.",
  },
  {
    q: 'Il prezzo fondatori vale anche per il Team?',
    a: 'No. Vale solo per i piani Mensile e Annuale.',
  },
  {
    q: 'Dove finiscono i dati?',
    a: (
      <>
        I dati stanno su Supabase, nei server europei di Francoforte, e su Vercel. Per
        trascrivere quello che detti, la voce viene elaborata da OpenAI. Tutti i dettagli
        sono nella pagina Privacy.{' '}
        <Link
          href="/privacy"
          className="inline-flex min-h-[48px] items-center font-semibold text-mv-ink underline decoration-primary decoration-2 underline-offset-4 hover:text-primary-dark"
        >
          Leggi la Privacy
        </Link>
      </>
    ),
  },
  {
    q: "E l'IVA sui prezzi dell'abbonamento?",
    a: "L'indicazione definitiva arriva a breve.",
  },
];

function QaList({ items }: { items: Qa[] }) {
  return (
    <div className="border-t border-mv-line">
      {items.map((item) => (
        <div
          key={item.q}
          className="grid gap-2 border-b border-mv-line py-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-10"
        >
          <h3 className="text-lg font-bold leading-7 sm:text-xl">{item.q}</h3>
          <p className="text-base leading-7 text-mv-ink sm:text-lg">{item.a}</p>
        </div>
      ))}
    </div>
  );
}

/** Section E: real questions, plain question/answer (not quote cards). */
export function Faq() {
  return (
    <div>
      <p className="mt-8 text-lg font-semibold text-mv-muted">Sul lavoro</p>
      <div className="mt-3">
        <QaList items={WORK} />
      </div>
      <details className="group mt-10">
        <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 rounded-md border-2 border-mv-ink px-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
          Per chi segue l&apos;ufficio
          <span aria-hidden="true" className="text-2xl leading-none group-open:rotate-45">
            +
          </span>
        </summary>
        <div className="mt-4">
          <QaList items={OFFICE} />
        </div>
      </details>
    </div>
  );
}
