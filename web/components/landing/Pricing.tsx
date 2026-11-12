import { CtaLink } from './primitives';

/** Founder places line, or null when Strada 2 must be hidden (unknown or sold out). */
export function founderPlacesText(left: number | null): string | null {
  if (left === null || left <= 0) return null;
  if (left === 1) return 'Resta 1 posto.';
  if (left <= 20) return `Restano ${left} posti.`;
  return 'Riservata ai primi 50 clienti paganti.';
}

const PLANS = [
  { name: 'Mensile', price: '€29,99 al mese', includes: '1 utente' },
  {
    name: 'Annuale',
    price: "€299,99 all'anno",
    includes: '1 utente · equivale a 2 mesi gratuiti rispetto al mensile',
  },
  {
    name: 'Team',
    price: '€79,99 al mese',
    includes:
      '5 utenti, titolare incluso · €9,99 al mese per ogni utente aggiuntivo, fino a 10',
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
        Tutti i piani includono preventivi illimitati, senza costi a preventivo.
      </p>

      <p className="mt-10 max-w-[65ch] text-lg font-semibold sm:text-xl">
        {showFounder
          ? 'Puoi iniziare in due modi.'
          : 'Puoi iniziare con 14 giorni di prova gratuita.'}
      </p>

      <div
        className={`mt-6 grid gap-10 ${
          showFounder ? 'md:grid-cols-2 md:gap-0 md:divide-x md:divide-mv-line' : ''
        }`}
      >
        <div className={showFounder ? 'md:pr-10' : 'max-w-[65ch]'}>
          <h3 className="mv-display text-2xl font-bold sm:text-3xl">
            Prova gratuita di 14 giorni
          </h3>
          <div className="mt-3 space-y-3 text-base leading-7 sm:text-lg">
            <p>Disponibile per i piani Mensile, Annuale e Team.</p>
            <p>
              Per 14 giorni usi Mastrovoce con i tuoi prezzi e i tuoi preventivi. La carta
              è richiesta all&apos;attivazione: se non disdici entro la fine della prova,
              si attiva il piano scelto. Puoi disdire in qualsiasi momento dall&apos;area
              account.
            </p>
            <p>La prova è valida per il primo abbonamento.</p>
          </div>
          <CtaLink href="/auth/register" className="mt-6 w-full sm:w-auto">
            Inizia la prova gratuita
          </CtaLink>
        </div>

        {showFounder ? (
          <div
            id="fondatori"
            className="border-t border-mv-line pt-10 md:border-t-0 md:pl-10 md:pt-0"
          >
            <h3 className="mv-display text-2xl font-bold sm:text-3xl">
              Offerta fondatori: primi 50 clienti
            </h3>
            <div className="mt-3 space-y-3 text-base leading-7 sm:text-lg">
              <p>
                <span className="font-semibold tabular-nums">
                  €19,99 al mese o €199,99 all&apos;anno
                </span>
                , bloccati finché l&apos;abbonamento resta attivo.
              </p>
              <p>
                L&apos;offerta non prevede la prova gratuita: il pagamento è immediato e,
                se lo richiedi entro 30 giorni, ti rimborsiamo il primo importo.
              </p>
              <p>Valida per i piani Mensile e Annuale, escluso il Team.</p>
              <p className="font-semibold">{places}</p>
            </div>
            <CtaLink
              href="/auth/register?offer=founder"
              className="mt-6 w-full sm:w-auto"
            >
              Attiva l&apos;offerta fondatori
            </CtaLink>
          </div>
        ) : null}
      </div>
    </div>
  );
}
