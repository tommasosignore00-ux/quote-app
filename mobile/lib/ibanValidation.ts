/**
 * IBAN Validation utilities.
 * Punto 26: Validazione IBAN Internazionale - country-specific regex + checksum.
 */

// IBAN lengths per country (ISO 13616)
const IBAN_LENGTHS: Record<string, number> = {
  AL: 28, AD: 24, AT: 20, AZ: 28, BH: 22, BY: 28, BE: 16, BA: 20,
  BR: 29, BG: 22, CR: 22, HR: 21, CY: 28, CZ: 24, DK: 18, DO: 28,
  TL: 23, EE: 20, FO: 18, FI: 18, FR: 27, GE: 22, DE: 22, GI: 23,
  GR: 27, GL: 18, GT: 28, HU: 28, IS: 26, IQ: 23, IE: 22, IL: 23,
  IT: 27, JO: 30, KZ: 20, XK: 20, KW: 30, LV: 21, LB: 28, LI: 21,
  LT: 20, LU: 20, MK: 19, MT: 31, MR: 27, MU: 30, MC: 27, MD: 24,
  ME: 22, NL: 18, NO: 15, PK: 24, PS: 29, PL: 28, PT: 25, QA: 29,
  RO: 24, SM: 27, SA: 24, RS: 22, SC: 31, SK: 24, SI: 19, ES: 24,
  SE: 24, CH: 21, TN: 24, TR: 26, UA: 29, AE: 23, GB: 22, VG: 24,
};

// Country-specific format regex (BBAN part after country code + check digits)
const IBAN_FORMATS: Record<string, RegExp> = {
  IT: /^IT\d{2}[A-Z]\d{10}[A-Za-z0-9]{12}$/,
  DE: /^DE\d{20}$/,
  FR: /^FR\d{12}[A-Za-z0-9]{11}\d{2}$/,
  ES: /^ES\d{22}$/,
  GB: /^GB\d{2}[A-Z]{4}\d{14}$/,
  AT: /^AT\d{18}$/,
  NL: /^NL\d{2}[A-Z]{4}\d{10}$/,
  BE: /^BE\d{14}$/,
  PT: /^PT\d{23}$/,
  CH: /^CH\d{7}[A-Za-z0-9]{12}$/,
  PL: /^PL\d{26}$/,
  CZ: /^CZ\d{22}$/,
  HU: /^HU\d{26}$/,
  RO: /^RO\d{2}[A-Z]{4}[A-Za-z0-9]{16}$/,
  HR: /^HR\d{19}$/,
  SK: /^SK\d{22}$/,
  BG: /^BG\d{2}[A-Z]{4}\d{6}[A-Za-z0-9]{8}$/,
  SI: /^SI\d{17}$/,
  GR: /^GR\d{25}$/,
  SE: /^SE\d{22}$/,
  DK: /^DK\d{16}$/,
  NO: /^NO\d{13}$/,
  FI: /^FI\d{16}$/,
  LV: /^LV\d{2}[A-Z]{4}[A-Za-z0-9]{13}$/,
  LT: /^LT\d{18}$/,
  EE: /^EE\d{18}$/,
  IE: /^IE\d{2}[A-Z]{4}\d{14}$/,
  RS: /^RS\d{20}$/,
  UA: /^UA\d{8}[A-Za-z0-9]{19}$/,
};

/**
 * Validate IBAN with:
 * 1. Format check (length + country-specific pattern)
 * 2. MOD-97 checksum verification (ISO 7064)
 */
export function validateIBAN(iban: string): {
  valid: boolean;
  error?: string;
  country?: string;
} {
  // Remove spaces and convert to uppercase
  const cleaned = iban.replace(/\s+/g, '').toUpperCase();

  if (cleaned.length < 2) {
    return { valid: false, error: 'IBAN troppo corto' };
  }

  const countryCode = cleaned.substring(0, 2);

  // Check country code is letters
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return { valid: false, error: 'Codice paese non valido' };
  }

  // Check expected length
  const expectedLength = IBAN_LENGTHS[countryCode];
  if (!expectedLength) {
    return { valid: false, error: `Paese ${countryCode} non supportato per IBAN` };
  }

  if (cleaned.length !== expectedLength) {
    return {
      valid: false,
      error: `IBAN ${countryCode} deve avere ${expectedLength} caratteri (inseriti: ${cleaned.length})`,
    };
  }

  // Check format if we have a specific pattern
  const formatRegex = IBAN_FORMATS[countryCode];
  if (formatRegex && !formatRegex.test(cleaned)) {
    return { valid: false, error: `Formato IBAN ${countryCode} non valido` };
  }

  // MOD-97 checksum verification
  if (!verifyMod97(cleaned)) {
    return { valid: false, error: 'Checksum IBAN non valido (cifre di controllo errate)' };
  }

  return { valid: true, country: countryCode };
}

/**
 * MOD-97 check: move first 4 chars to end, convert letters to numbers,
 * compute mod 97 — must equal 1.
 */
function verifyMod97(iban: string): boolean {
  // Move country code + check digits to end
  const rearranged = iban.substring(4) + iban.substring(0, 4);

  // Convert letters to numbers (A=10, B=11, ..., Z=35)
  let numStr = '';
  for (const char of rearranged) {
    if (char >= '0' && char <= '9') {
      numStr += char;
    } else {
      numStr += (char.charCodeAt(0) - 55).toString();
    }
  }

  // Calculate mod 97 using big number arithmetic (string-based)
  let remainder = 0;
  for (let i = 0; i < numStr.length; i++) {
    remainder = (remainder * 10 + parseInt(numStr[i], 10)) % 97;
  }

  return remainder === 1;
}

/**
 * Format IBAN with spaces every 4 characters for display.
 */
export function formatIBAN(iban: string): string {
  const cleaned = iban.replace(/\s+/g, '').toUpperCase();
  return cleaned.replace(/(.{4})/g, '$1 ').trim();
}
