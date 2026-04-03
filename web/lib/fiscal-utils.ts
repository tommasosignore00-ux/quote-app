/**
 * Punto 26: IBAN Validation for web
 * Punto 30: Intelligent rounding
 * Punto 21/22/25: Fiscal switch + reverse charge + US sales tax
 * Shared validation utilities for the web app
 */

// ─── IBAN Validation ───
const IBAN_LENGTHS: Record<string, number> = {
  AL: 28, AD: 24, AT: 20, AZ: 28, BH: 22, BY: 28, BE: 16, BA: 20, BR: 29, BG: 22,
  CR: 22, HR: 21, CY: 28, CZ: 24, DK: 18, DO: 28, EE: 20, FI: 18, FR: 27, GE: 22,
  DE: 22, GI: 23, GR: 27, GL: 18, GT: 28, HU: 28, IS: 26, IE: 22, IL: 23, IT: 27,
  JO: 30, KZ: 20, XK: 20, KW: 30, LV: 21, LB: 28, LI: 21, LT: 20, LU: 20, MK: 19,
  MT: 31, MR: 27, MU: 30, MD: 24, MC: 27, ME: 22, NL: 18, NO: 15, PK: 24, PS: 29,
  PL: 28, PT: 25, QA: 29, RO: 24, SM: 27, SA: 24, RS: 22, SK: 24, SI: 19, ES: 24,
  SE: 24, CH: 21, TN: 24, TR: 26, UA: 29, AE: 23, GB: 22, VG: 24,
};

function mod97(iban: string): number {
  let remainder = '';
  for (const char of iban) {
    remainder += char >= 'A' ? (char.charCodeAt(0) - 55).toString() : char;
    if (remainder.length > 9) remainder = (BigInt(remainder) % 97n).toString();
  }
  return Number(BigInt(remainder) % 97n);
}

export function validateIBAN(iban: string): { valid: boolean; error?: string; country?: string } {
  const clean = iban.replace(/\s/g, '').toUpperCase();
  if (clean.length < 5) return { valid: false, error: 'IBAN too short' };
  const countryCode = clean.substring(0, 2);
  if (!/^[A-Z]{2}$/.test(countryCode)) return { valid: false, error: 'Invalid country code' };
  const expectedLength = IBAN_LENGTHS[countryCode];
  if (!expectedLength) return { valid: false, error: `Unsupported country: ${countryCode}` };
  if (clean.length !== expectedLength) return { valid: false, error: `Expected ${expectedLength} chars for ${countryCode}, got ${clean.length}` };
  const rearranged = clean.substring(4) + clean.substring(0, 4);
  if (mod97(rearranged) !== 1) return { valid: false, error: 'Invalid IBAN checksum' };
  return { valid: true, country: countryCode };
}

export function formatIBAN(iban: string): string {
  return iban.replace(/\s/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
}

// ─── Intelligent Rounding ───
type RoundingStrategy = 'nearest_cent' | 'nearest_5_cent' | 'swedish_rounding' | 'nearest_euro' | 'nearest_5' | 'nearest_10';

const COUNTRY_ROUNDING: Record<string, RoundingStrategy> = {
  NL: 'nearest_5_cent', BE: 'nearest_5_cent', FI: 'nearest_5_cent', CH: 'nearest_5_cent',
  SE: 'swedish_rounding', JP: 'nearest_euro', IN: 'nearest_euro',
  HU: 'nearest_5', KR: 'nearest_10',
};

export function roundForCountry(amount: number, countryCode: string): number {
  const strategy = COUNTRY_ROUNDING[countryCode.toUpperCase()] || 'nearest_cent';
  switch (strategy) {
    case 'nearest_cent': return Math.round(amount * 100) / 100;
    case 'nearest_5_cent': return Math.round(amount * 20) / 20;
    case 'swedish_rounding': return Math.round(amount);
    case 'nearest_euro': return Math.round(amount);
    case 'nearest_5': return Math.round(amount / 5) * 5;
    case 'nearest_10': return Math.round(amount / 10) * 10;
    default: return Math.round(amount * 100) / 100;
  }
}

// ─── Fiscal Configuration per Country ───
export interface FiscalField {
  key: string;
  label: string;
  required: boolean;
  placeholder?: string;
  validation?: RegExp;
}

export interface FiscalConfig {
  countryCode: string;
  fields: FiscalField[];
  reverseChargeAvailable: boolean;
  defaultVatRate: number;
}

const EU_COUNTRIES = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'];

export function getFiscalConfig(countryCode: string): FiscalConfig {
  const cc = countryCode.toUpperCase();
  let fields: FiscalField[] = [];
  let defaultVatRate = 22;

  switch (cc) {
    case 'IT':
      fields = [
        { key: 'vat_number', label: 'Partita IVA', required: true, placeholder: 'IT12345678901', validation: /^IT\d{11}$/ },
        { key: 'fiscal_code', label: 'Codice Fiscale', required: true, placeholder: 'RSSMRA80A01H501U', validation: /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/ },
        { key: 'sdi_code', label: 'Codice SDI', required: false, placeholder: '0000000' },
        { key: 'pec_email', label: 'PEC', required: false, placeholder: 'azienda@pec.it' },
      ];
      defaultVatRate = 22;
      break;
    case 'DE':
      fields = [
        { key: 'vat_number', label: 'USt-IdNr.', required: true, placeholder: 'DE123456789' },
        { key: 'tax_number', label: 'Steuernummer', required: false, placeholder: '123/456/78901' },
      ];
      defaultVatRate = 19;
      break;
    case 'FR':
      fields = [
        { key: 'vat_number', label: 'N° TVA', required: true, placeholder: 'FR12345678901' },
        { key: 'siret', label: 'SIRET', required: true, placeholder: '12345678901234' },
      ];
      defaultVatRate = 20;
      break;
    case 'ES':
      fields = [
        { key: 'vat_number', label: 'NIF/CIF', required: true, placeholder: 'B12345678' },
      ];
      defaultVatRate = 21;
      break;
    case 'GB':
      fields = [
        { key: 'vat_number', label: 'VAT Number', required: true, placeholder: 'GB123456789' },
      ];
      defaultVatRate = 20;
      break;
    case 'US':
      fields = [
        { key: 'ein', label: 'EIN', required: true, placeholder: '12-3456789' },
        { key: 'state_tax_id', label: 'State Tax ID', required: false },
      ];
      defaultVatRate = 0;
      break;
    default:
      fields = [
        { key: 'vat_number', label: 'VAT / Tax ID', required: true },
      ];
      defaultVatRate = 20;
  }

  return {
    countryCode: cc,
    fields,
    reverseChargeAvailable: EU_COUNTRIES.includes(cc),
    defaultVatRate,
  };
}

// ─── US Sales Tax ───
export const US_STATE_TAX_RATES: Record<string, number> = {
  AL: 4.0, AK: 0, AZ: 5.6, AR: 6.5, CA: 7.25, CO: 2.9, CT: 6.35, DE: 0, FL: 6.0,
  GA: 4.0, HI: 4.0, ID: 6.0, IL: 6.25, IN: 7.0, IA: 6.0, KS: 6.5, KY: 6.0, LA: 4.45,
  ME: 5.5, MD: 6.0, MA: 6.25, MI: 6.0, MN: 6.875, MS: 7.0, MO: 4.225, MT: 0, NE: 5.5,
  NV: 6.85, NH: 0, NJ: 6.625, NM: 5.125, NY: 4.0, NC: 4.75, ND: 5.0, OH: 5.75,
  OK: 4.5, OR: 0, PA: 6.0, RI: 7.0, SC: 6.0, SD: 4.5, TN: 7.0, TX: 6.25, UT: 6.1,
  VT: 6.0, VA: 5.3, WA: 6.5, WV: 6.0, WI: 5.0, WY: 4.0, DC: 6.0,
};

export function isReverseChargeApplicable(sellerCountry: string, buyerCountry: string): boolean {
  if (sellerCountry === buyerCountry) return false;
  return EU_COUNTRIES.includes(sellerCountry.toUpperCase()) && EU_COUNTRIES.includes(buyerCountry.toUpperCase());
}
