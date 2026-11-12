/**
 * Formato dei soldi, unico per tutta l'app (spec 2.10).
 * Non dipende da Intl: iOS e Android danno lo stesso risultato.
 * Esempi: "12,50 €" · "1.072,15 €" · "23,40 €/m" · "6 m".
 *
 * Solo formattazione per la vista: i calcoli dei totali restano dove sono.
 */

/** Spazio che non va a capo tra numero ed euro. */
const NBSP = ' ';

export function formatMoney(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const [int, dec] = Math.abs(safe).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = safe < 0 && Number(`${int}.${dec}`) !== 0 ? '−' : '';
  return `${sign}${grouped},${dec}${NBSP}€`;
}

export const formatUnitPrice = (value: number, unit?: string | null): string =>
  unit ? `${formatMoney(value)}/${unit}` : formatMoney(value);

export function formatQty(quantity: number, unit?: string | null): string {
  if (unit === 'a corpo') return 'a corpo';
  const n = Number.isInteger(quantity) ? String(quantity) : String(quantity).replace('.', ',');
  return unit ? `${n}${NBSP}${unit}` : n;
}

/** "6 m × 23,40 €" */
export const formatQtyTimesPrice = (quantity: number, unit: string | null | undefined, unitPrice: number): string =>
  `${formatQty(quantity, unit)} × ${formatMoney(unitPrice)}`;

/** Lettura per VoiceOver/TalkBack: "1.072,15 euro". */
export const moneyForScreenReader = (value: number): string =>
  formatMoney(value).replace(`${NBSP}€`, ' euro').replace('−', 'meno ');
