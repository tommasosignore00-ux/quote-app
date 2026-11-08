// ── Mercato attivo ──────────────────────────────────────────
// Per ora l'app è disponibile solo in Italia. Le liste complete restano
// in ALL_COUNTRIES / ALL_LANGUAGES per una futura riapertura ad altri paesi:
// basterà aggiungere i codici in ACTIVE_COUNTRY_CODES / ACTIVE_LANGUAGE_CODES.
export const DEFAULT_COUNTRY_CODE = 'IT';
export const DEFAULT_LANGUAGE = 'it';
export const DEFAULT_LOCALE = 'it-IT';
export const DEFAULT_CURRENCY = 'EUR';
export const ACTIVE_COUNTRY_CODES: readonly string[] = [DEFAULT_COUNTRY_CODE];
export const ACTIVE_LANGUAGE_CODES: readonly string[] = [DEFAULT_LANGUAGE];

export const ALL_COUNTRIES = [
  // Europa occidentale
  { code: 'IT', name: 'Italia', currency: 'EUR', vatDefault: 22 },
  { code: 'DE', name: 'Deutschland', currency: 'EUR', vatDefault: 19 },
  { code: 'FR', name: 'France', currency: 'EUR', vatDefault: 20 },
  { code: 'ES', name: 'España', currency: 'EUR', vatDefault: 21 },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', vatDefault: 20 },
  { code: 'AT', name: 'Österreich', currency: 'EUR', vatDefault: 20 },
  { code: 'NL', name: 'Nederland', currency: 'EUR', vatDefault: 21 },
  { code: 'BE', name: 'België', currency: 'EUR', vatDefault: 21 },
  { code: 'PT', name: 'Portugal', currency: 'EUR', vatDefault: 23 },
  { code: 'CH', name: 'Schweiz', currency: 'CHF', vatDefault: 7.7 },
  { code: 'GR', name: 'Ελλάδα', currency: 'EUR', vatDefault: 24 },
  // Europa dell'Est
  { code: 'PL', name: 'Polska', currency: 'PLN', vatDefault: 23 },
  { code: 'CZ', name: 'Česko', currency: 'CZK', vatDefault: 21 },
  { code: 'HU', name: 'Magyarország', currency: 'HUF', vatDefault: 27 },
  { code: 'RO', name: 'România', currency: 'RON', vatDefault: 19 },
  { code: 'UA', name: 'Україна', currency: 'UAH', vatDefault: 20 },
  { code: 'HR', name: 'Hrvatska', currency: 'EUR', vatDefault: 25 },
  { code: 'SK', name: 'Slovensko', currency: 'EUR', vatDefault: 20 },
  { code: 'BG', name: 'България', currency: 'BGN', vatDefault: 20 },
  { code: 'SI', name: 'Slovenija', currency: 'EUR', vatDefault: 22 },
  { code: 'RS', name: 'Srbija', currency: 'RSD', vatDefault: 20 },
  { code: 'LV', name: 'Latvija', currency: 'EUR', vatDefault: 21 },
  { code: 'LT', name: 'Lietuva', currency: 'EUR', vatDefault: 21 },
  { code: 'EE', name: 'Eesti', currency: 'EUR', vatDefault: 22 },
  { code: 'RU', name: 'Россия', currency: 'RUB', vatDefault: 20 },
  // Americhe, Asia, Oceania
  { code: 'US', name: 'United States', currency: 'USD', vatDefault: 0 },
  { code: 'CA', name: 'Canada', currency: 'CAD', vatDefault: 0 },
  { code: 'AU', name: 'Australia', currency: 'AUD', vatDefault: 10 },
  { code: 'CN', name: '中国', currency: 'CNY', vatDefault: 13 },
  { code: 'JP', name: '日本', currency: 'JPY', vatDefault: 10 },
  { code: 'KR', name: '대한민국', currency: 'KRW', vatDefault: 10 },
  { code: 'IN', name: 'India', currency: 'INR', vatDefault: 18 },
  { code: 'BR', name: 'Brasil', currency: 'BRL', vatDefault: 17 },
] as const;

export const ALL_LANGUAGES = [
  { code: 'it', name: 'Italiano' },
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'pl', name: 'Polski' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'zh', name: '中文 (简体)' },
  { code: 'ru', name: 'Русский' },
  { code: 'cs', name: 'Čeština' },
  { code: 'hu', name: 'Magyar' },
  { code: 'ro', name: 'Română' },
  { code: 'uk', name: 'Українська' },
  { code: 'hr', name: 'Hrvatski' },
  { code: 'sk', name: 'Slovenčina' },
  { code: 'bg', name: 'Български' },
  { code: 'sl', name: 'Slovenščina' },
  { code: 'el', name: 'Ελληνικά' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
] as const;

export const COUNTRIES = ALL_COUNTRIES.filter((c) =>
  ACTIVE_COUNTRY_CODES.includes(c.code)
);
export const LANGUAGES = ALL_LANGUAGES.filter((l) =>
  ACTIVE_LANGUAGE_CODES.includes(l.code)
);

export function isActiveCountry(code: string | null | undefined): boolean {
  return !!code && ACTIVE_COUNTRY_CODES.includes(code.toUpperCase());
}

/** Riporta qualsiasi codice paese non attivo al paese di default (Italia). */
export function normalizeCountryCode(code: string | null | undefined): string {
  return isActiveCountry(code) ? String(code).toUpperCase() : DEFAULT_COUNTRY_CODE;
}

/** Riporta qualsiasi lingua non attiva alla lingua di default (italiano). */
export function normalizeLanguage(lang: string | null | undefined): string {
  const base = (lang || '').toLowerCase().split('-')[0];
  return ACTIVE_LANGUAGE_CODES.includes(base) ? base : DEFAULT_LANGUAGE;
}

export const LEGAL_FRAMEWORKS: Record<string, string> = {
  IT: 'GDPR',
  DE: 'GDPR',
  FR: 'GDPR',
  ES: 'GDPR',
  AT: 'GDPR',
  NL: 'GDPR',
  BE: 'GDPR',
  PT: 'GDPR',
  PL: 'GDPR',
  GB: 'UK_GDPR',
  GR: 'GDPR',
  CZ: 'GDPR',
  HU: 'GDPR',
  RO: 'GDPR',
  HR: 'GDPR',
  SK: 'GDPR',
  BG: 'GDPR',
  SI: 'GDPR',
  RS: 'GDPR',
  LV: 'GDPR',
  LT: 'GDPR',
  EE: 'GDPR',
  UA: 'GDPR',
  RU: 'GDPR',
  US: 'CCPA',
  CA: 'PIPEDA',
  AU: 'APA',
  CH: 'FADP',
  CN: 'PIPL',
  JP: 'APPI',
  KR: 'PIPA',
  IN: 'DPDP',
  BR: 'LGPD',
};

export const STRIPE_PRICES = {
  monthly: 2999, // cents
  yearly: 29999, // cents
  trialDays: 7,
};

/**
 * Aliquota IVA del profilo, con 22% solo se manca davvero.
 * Attenzione: `valore || 22` trasformerebbe un'aliquota 0% (es. forfettario) in 22%.
 */
export function resolveVatPercent(value: unknown, fallback = 22): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
