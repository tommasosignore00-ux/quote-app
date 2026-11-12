import Link from 'next/link';
import type { ReactNode } from 'react';

interface Qa {
  q: string;
  a: ReactNode;
}

const WORK: Qa[] = [
  {
    q: 'Quanto tempo richiede la configurazione?',
    a: "Listino e modello si impostano una sola volta, all'inizio. Da quel momento, in cantiere, ti basta dettare e verificare le righe.",
  },
  {
    q: 'Uso già un listino in Excel.',
    a: "Puoi caricarlo così com'è: diventa il listino di Mastrovoce e non dovrai più ricopiare i prezzi a mano.",
  },
  {
    q: 'Non ho un listino digitale.',
    a: 'Puoi usare Mastrovoce comunque: detti le voci e inserisci i prezzi a mano.',
  },
  {
    q: 'Chi controlla i preventivi?',
    a: 'Sempre tu: nessuna riga viene salvata senza la tua conferma. Il cliente vede il nome della tua azienda, non il nostro. Quando accetta, restano registrati nome, data e ora: è la documentazione della sua risposta, non una garanzia legale.',
  },
  {
    q: 'Cosa succede se una voce viene interpretata male?',
    a: 'Vedi sempre la frase trascritta e le righe proposte. Una riga errata si elimina o si detta di nuovo; se una voce corrisponde a più articoli, Mastrovoce ti chiede quale scegliere.',
  },
  {
    q: 'Funziona anche senza copertura di rete?',
    a: 'Sì: la registrazione viene salvata sul telefono e inviata appena torna il segnale.',
  },
  {
    q: "Che cos'è METEL?",
    a: 'È il formato standard con cui molti grossisti, soprattutto del materiale elettrico, forniscono i listini. Non è indispensabile: vanno bene anche PDF ed Excel.',
  },
  {
    q: 'Serve un computer?',
    a: 'No: in cantiere si usa dallo smartphone. Dal computer puoi gestire listini e preventivi in ufficio.',
  },
  {
    q: 'Quanto costa?',
    a: "€29,99 al mese, con 14 giorni di prova gratuita e disdetta in qualsiasi momento. I primi 50 clienti possono scegliere l'offerta fondatori, descritta nella sezione Prezzi.",
  },
];

const OFFICE: Qa[] = [
  {
    q: 'Cosa succede quando il cliente accetta?',
    a: 'Il preventivo non è più modificabile e resta archiviato tra gli accettati. Mastrovoce non emette fatture né fatture elettroniche: la fatturazione resta sul programma che usate oggi.',
  },
  {
    q: 'Il modello Word va preparato in qualche modo?',
    a: 'Basta un vostro preventivo in Word, privo dei dati dei clienti.',
  },
  {
    q: 'Siamo in più persone: come funziona?',
    a: 'Il piano Team include 5 utenti, titolare compreso, a €79,99 al mese. Ogni utente aggiuntivo costa €9,99 al mese, fino a un massimo di 10.',
  },
  {
    q: 'Il prezzo fondatori vale anche per il Team?',
    a: "No, l'offerta è valida solo per i piani Mensile e Annuale.",
  },
  {
    q: 'Dove finiscono i dati?',
    a: (
      <>
        I dati sono conservati su Supabase, in server europei a Francoforte, e su Vercel.
        Per la trascrizione, l&apos;audio dettato viene elaborato da OpenAI. Tutti i
        dettagli sono riportati nell&apos;informativa privacy.{' '}
        <Link
          href="/privacy"
          className="inline-flex min-h-[48px] items-center font-semibold text-mv-ink underline decoration-primary decoration-2 underline-offset-4 hover:text-primary-dark"
        >
          Leggi l&apos;informativa
        </Link>
      </>
    ),
  },
  {
    q: "E l'IVA sui prezzi dell'abbonamento?",
    a: 'Le condizioni fiscali definitive saranno indicate a breve.',
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
      <p className="mt-8 text-lg font-semibold text-mv-muted">Uso quotidiano</p>
      <div className="mt-3">
        <QaList items={WORK} />
      </div>
      <details className="group mt-10">
        <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 rounded-md border-2 border-mv-ink px-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
          Per l&apos;ufficio e l&apos;amministrazione
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
