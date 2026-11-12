import { CtaLink } from './primitives';

/** Founder places line, or null when Strada 2 must be hidden (unknown or sold out). */
export function founderPlacesText(left: number | null): string | null {
  if (left === null || left <= 0) return null;
  if (left === 1) return 'Resta 1 posto.';
  if (left <= 20) return `Restano ${left} posti.`;
  return 'Vale per i primi 50 clienti che pagano.';
}

const PLANS = [
  { name: 'Mensile', price: '€29,99 al mese', includes: '1 utente' },
  {
    name: 'Annuale',
    price: "€299,99 all'anno",
    includes: '1 utente · 2 mesi gratis rispetto al mensile',
  },
  {
    name: 'Team',
    price: '€79,99 al mese',
    includes:
      '5 utenti, titolare compreso · €9,99 al mese per ogni utente in più, fino a 10',
  },
];

/** Section F, first part: price table and the two ways to start. */
export function Pricing({ founderSlots }: { founderSlots: number | null }) {
  const places = founderPlacesText(founderSlots);
  const showFounder = places !== null;

  return (
    <div>
      <table className="w-full border-collapse text-left text-base leading-6 sm:text-lg">
        <caption className="sr-only">Piani e prezzi</caption>
        <thead>
          <tr className="border-b-2 border-mv-ink">
            <th scope="col" className="py-2 pr-3 font-semibold">
              Piano
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Prezzo
            </th>
            <th scope="col" className="py-2 pl-3 font-semibold">
              Cosa comprende
            </th>
          </tr>
        </thead>
        <tbody>
          {PLANS.map((plan) => (
            <tr key={plan.name} className="border-b border-mv-line align-top">
              <th scope="row" className="py-3 pr-3 font-bold">
                {plan.name}
              </th>
              <td className="px-3 py-3 font-semibold tabular-nums sm:whitespace-nowrap">
                {plan.price}
              </td>
              <td className="py-3 pl-3 text-mv-muted">{plan.includes}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-base text-mv-muted sm:text-lg">
        In tutti i piani i preventivi sono illimitati: non paghi a preventivo.
      </p>

      <p className="mt-10 max-w-[65ch] text-lg font-semibold sm:text-xl">
        {showFounder
          ? 'Per cominciare hai due strade. Scegli quella che ti torna meglio.'
          : 'Per cominciare: 14 giorni di prova con i tuoi prezzi.'}
      </p>

      <div
        className={`mt-6 grid gap-10 ${
          showFounder ? 'md:grid-cols-2 md:gap-0 md:divide-x md:divide-mv-line' : ''
        }`}
      >
        <div className={showFounder ? 'md:pr-10' : 'max-w-[65ch]'}>
          <h3 className="mv-display text-2xl font-bold sm:text-3xl">
            Provi 14 giorni, poi decidi
          </h3>
          <div className="mt-3 space-y-3 text-base leading-7 sm:text-lg">
            <p>Vale per Mensile, Annuale e Team.</p>
            <p>
              Per 14 giorni lo usi con i tuoi prezzi. Al momento dell&apos;attivazione
              serve la carta: se non disdici entro la fine della prova, parte il piano che
              hai scelto. Disdici quando vuoi dalla tua area account.
            </p>
            <p>La prova vale per il primo abbonamento.</p>
          </div>
          <CtaLink href="/auth/register" className="mt-6 w-full sm:w-auto">
            Inizia i 14 giorni di prova
          </CtaLink>
        </div>

        {showFounder ? (
          <div
            id="fondatori"
            className="border-t border-mv-line pt-10 md:border-t-0 md:pl-10 md:pt-0"
          >
            <h3 className="mv-display text-2xl font-bold sm:text-3xl">
              Prezzo fondatori, per i primi 50 clienti
            </h3>
            <div className="mt-3 space-y-3 text-base leading-7 sm:text-lg">
              <p>
                <span className="font-semibold tabular-nums">
                  €19,99 al mese o €199,99 all&apos;anno
                </span>
                , finché resti abbonato senza interruzioni.
              </p>
              <p>
                Qui non c&apos;è la prova: paghi subito. Se entro 30 giorni non ti
                convince, ti rimborsiamo il primo pagamento.
              </p>
              <p>Vale per Mensile e Annuale, non per il Team.</p>
              <p className="font-semibold">{places}</p>
            </div>
            <CtaLink
              href="/auth/register?offer=founder"
              className="mt-6 w-full sm:w-auto"
            >
              Prendi il prezzo fondatori
            </CtaLink>
          </div>
        ) : null}
      </div>
    </div>
  );
}
