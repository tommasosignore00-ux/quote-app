/**
 * Intelligent rounding utilities.
 * Punto 30: Arrotondamento Intelligente - round totals per local commercial customs.
 */

type RoundingStrategy = 'none' | 'nearest_cent' | 'nearest_5_cent' | 'nearest_10_cent' | 'nearest_50_cent' | 'nearest_euro' | 'nearest_5' | 'nearest_10' | 'swedish_rounding';

// Country-specific rounding preferences
const COUNTRY_ROUNDING: Record<string, RoundingStrategy> = {
  // Euro zone: generally nearest cent
  IT: 'nearest_cent',
  DE: 'nearest_cent',
  FR: 'nearest_cent',
  ES: 'nearest_cent',
  AT: 'nearest_cent',
  NL: 'nearest_5_cent', // Dutch rounding (1/2 cent coins removed)
  BE: 'nearest_5_cent', // Belgian rounding
  PT: 'nearest_cent',
  GR: 'nearest_cent',
  IE: 'nearest_5_cent', // Irish rounding
  FI: 'nearest_5_cent', // Finnish rounding (no 1/2 cent coins)
  HR: 'nearest_cent',
  SK: 'nearest_cent',
  SI: 'nearest_cent',
  EE: 'nearest_cent',
  LV: 'nearest_cent',
  LT: 'nearest_cent',
  // Nordic
  SE: 'swedish_rounding', // Öre removed, round to nearest krona
  DK: 'nearest_50_cent', // Danish 50-øre rounding
  NO: 'nearest_euro', // Norwegian krone rounding
  // Eastern Europe
  PL: 'nearest_cent',
  CZ: 'nearest_euro', // Koruna - round to nearest whole
  HU: 'nearest_5', // Forint - round to nearest 5 (small denominations)
  RO: 'nearest_cent',
  BG: 'nearest_cent',
  RS: 'nearest_euro', // Dinar - round to whole
  UA: 'nearest_cent',
  RU: 'nearest_cent',
  // Non-EU
  CH: 'nearest_5_cent', // Swiss rounding (Rappen)
  GB: 'nearest_cent',
  US: 'nearest_cent',
  CA: 'nearest_5_cent', // Canadian penny removed
  AU: 'nearest_5_cent', // Australian 1/2 cent removed
  JP: 'nearest_euro', // Yen has no decimals
  KR: 'nearest_10', // Won - round to nearest 10
  CN: 'nearest_cent',
  IN: 'nearest_euro', // Rupee - round to whole
  BR: 'nearest_cent',
};

/**
 * Apply intelligent rounding based on country.
 */
export function roundForCountry(amount: number, countryCode: string): number {
  const strategy = COUNTRY_ROUNDING[countryCode.toUpperCase()] || 'nearest_cent';
  return applyRounding(amount, strategy);
}

/**
 * Apply a specific rounding strategy.
 */
export function applyRounding(amount: number, strategy: RoundingStrategy): number {
  switch (strategy) {
    case 'none':
      return amount;

    case 'nearest_cent':
      return Math.round(amount * 100) / 100;

    case 'nearest_5_cent':
      return Math.round(amount * 20) / 20;

    case 'nearest_10_cent':
      return Math.round(amount * 10) / 10;

    case 'nearest_50_cent':
      return Math.round(amount * 2) / 2;

    case 'nearest_euro':
      return Math.round(amount);

    case 'nearest_5':
      return Math.round(amount / 5) * 5;

    case 'nearest_10':
      return Math.round(amount / 10) * 10;

    case 'swedish_rounding':
      // Round to nearest whole unit (öre removed)
      return Math.round(amount);

    default:
      return Math.round(amount * 100) / 100;
  }
}

/**
 * Get the rounding strategy description for display.
 */
export function getRoundingDescription(countryCode: string): string {
  const strategy = COUNTRY_ROUNDING[countryCode.toUpperCase()] || 'nearest_cent';
  const descriptions: Record<RoundingStrategy, string> = {
    none: 'Nessun arrotondamento',
    nearest_cent: 'Al centesimo più vicino',
    nearest_5_cent: 'Ai 5 centesimi più vicini',
    nearest_10_cent: 'Ai 10 centesimi più vicini',
    nearest_50_cent: 'Ai 50 centesimi più vicini',
    nearest_euro: "All'unità più vicina",
    nearest_5: 'Alle 5 unità più vicine',
    nearest_10: 'Alle 10 unità più vicine',
    swedish_rounding: 'Arrotondamento svedese (unità intera)',
  };
  return descriptions[strategy];
}
