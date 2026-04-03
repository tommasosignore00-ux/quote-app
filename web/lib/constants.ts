export const COUNTRIES = [
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

export const LANGUAGES = [
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

export const LEGAL_FRAMEWORKS: Record<string, string> = {
  IT: 'GDPR', DE: 'GDPR', FR: 'GDPR', ES: 'GDPR', AT: 'GDPR',
  NL: 'GDPR', BE: 'GDPR', PT: 'GDPR', PL: 'GDPR', GB: 'UK_GDPR',
  GR: 'GDPR', CZ: 'GDPR', HU: 'GDPR', RO: 'GDPR', HR: 'GDPR',
  SK: 'GDPR', BG: 'GDPR', SI: 'GDPR', RS: 'GDPR', LV: 'GDPR',
  LT: 'GDPR', EE: 'GDPR', UA: 'GDPR', RU: 'GDPR',
  US: 'CCPA', CA: 'PIPEDA', AU: 'APA', CH: 'FADP',
  CN: 'PIPL', JP: 'APPI', KR: 'PIPA', IN: 'DPDP', BR: 'LGPD',
};

export const STRIPE_PRICES = {
  monthly: 2900, // 29€ in cents
  yearly: 29000, // 290€ in cents
  trialDays: 7,
};
