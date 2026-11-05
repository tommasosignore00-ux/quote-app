// ── Mercato attivo ──────────────────────────────────────────
// Per ora l'app è disponibile solo in Italia. Per riaprire ad altri paesi
// aggiungere i codici in ACTIVE_COUNTRY_CODES / ACTIVE_LANGUAGE_CODES.
export const DEFAULT_COUNTRY_CODE = 'IT';
export const DEFAULT_LANGUAGE = 'it';
export const DEFAULT_LOCALE = 'it-IT';
export const DEFAULT_CURRENCY = 'EUR';
export const ACTIVE_COUNTRY_CODES: readonly string[] = [DEFAULT_COUNTRY_CODE];
export const ACTIVE_LANGUAGE_CODES: readonly string[] = [DEFAULT_LANGUAGE];

/** Riporta qualsiasi codice paese non attivo al paese di default (Italia). */
export function normalizeCountryCode(code: string | null | undefined): string {
  const cc = (code || '').toUpperCase();
  return ACTIVE_COUNTRY_CODES.includes(cc) ? cc : DEFAULT_COUNTRY_CODE;
}

/** Riporta qualsiasi lingua non attiva alla lingua di default (italiano). */
export function normalizeLanguage(lang: string | null | undefined): string {
  const base = (lang || '').toLowerCase().split('-')[0];
  return ACTIVE_LANGUAGE_CODES.includes(base) ? base : DEFAULT_LANGUAGE;
}

/**
 * Aliquota IVA del profilo, con 22% solo se manca davvero.
 * Attenzione: `valore || 22` trasformerebbe un'aliquota 0% (es. forfettario) in 22%.
 */
export function resolveVatPercent(value: unknown, fallback = 22): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
