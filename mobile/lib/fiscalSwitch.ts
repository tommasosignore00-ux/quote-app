/**
 * Dynamic fiscal form configuration.
 * Punto 21: Switch Fiscale Dinamico - forms based on country (PIVA vs EIN/Tax ID).
 * Punto 22: Gestione Reverse Charge - EU reverse charge automation.
 */

export interface FiscalField {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  type: 'text' | 'number' | 'select';
  validation?: RegExp;
  validationMessage?: string;
}

export interface FiscalConfig {
  countryCode: string;
  fields: FiscalField[];
  taxLabel: string;
  taxIdLabel: string;
  secondaryTaxIdLabel?: string;
  reverseChargeApplicable: boolean;
  electronicInvoicingRequired: boolean;
  electronicInvoicingSystem?: string;
}

// EU member states (for reverse charge)
const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

/**
 * Get fiscal configuration for a given country.
 */
export function getFiscalConfig(countryCode: string): FiscalConfig {
  const cc = countryCode.toUpperCase();

  switch (cc) {
    case 'IT':
      return {
        countryCode: cc,
        taxLabel: 'IVA',
        taxIdLabel: 'Partita IVA',
        secondaryTaxIdLabel: 'Codice Fiscale',
        reverseChargeApplicable: true,
        electronicInvoicingRequired: true,
        electronicInvoicingSystem: 'SDI (Sistema di Interscambio)',
        fields: [
          { key: 'vat_number', label: 'Partita IVA', placeholder: 'IT12345678901', required: true, type: 'text', validation: /^IT\d{11}$/, validationMessage: 'Formato: IT + 11 cifre' },
          { key: 'fiscal_code', label: 'Codice Fiscale', placeholder: 'RSSMRA85M01H501Z', required: false, type: 'text', validation: /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/i, validationMessage: 'Formato codice fiscale non valido' },
          { key: 'sdi_code', label: 'Codice SDI', placeholder: '0000000', required: false, type: 'text', validation: /^[A-Z0-9]{7}$/, validationMessage: 'Codice SDI: 7 caratteri alfanumerici' },
          { key: 'pec', label: 'PEC', placeholder: 'azienda@pec.it', required: false, type: 'text' },
        ],
      };

    case 'DE':
      return {
        countryCode: cc,
        taxLabel: 'MwSt (USt)',
        taxIdLabel: 'Umsatzsteuer-ID',
        secondaryTaxIdLabel: 'Steuernummer',
        reverseChargeApplicable: true,
        electronicInvoicingRequired: false,
        fields: [
          { key: 'vat_number', label: 'USt-IdNr.', placeholder: 'DE123456789', required: true, type: 'text', validation: /^DE\d{9}$/, validationMessage: 'Formato: DE + 9 cifre' },
          { key: 'fiscal_code', label: 'Steuernummer', placeholder: '12/345/67890', required: false, type: 'text' },
          { key: 'handelsregister', label: 'Handelsregister', placeholder: 'HRB 12345', required: false, type: 'text' },
        ],
      };

    case 'FR':
      return {
        countryCode: cc,
        taxLabel: 'TVA',
        taxIdLabel: 'N° TVA intracommunautaire',
        reverseChargeApplicable: true,
        electronicInvoicingRequired: true,
        electronicInvoicingSystem: 'Chorus Pro',
        fields: [
          { key: 'vat_number', label: 'N° TVA', placeholder: 'FR12345678901', required: true, type: 'text', validation: /^FR[A-Z0-9]{2}\d{9}$/, validationMessage: 'Formato: FR + 2 car. + 9 cifre' },
          { key: 'fiscal_code', label: 'SIRET', placeholder: '12345678901234', required: false, type: 'text', validation: /^\d{14}$/, validationMessage: 'SIRET: 14 cifre' },
          { key: 'siren', label: 'SIREN', placeholder: '123456789', required: false, type: 'text', validation: /^\d{9}$/, validationMessage: 'SIREN: 9 cifre' },
          { key: 'naf_code', label: 'Code NAF/APE', placeholder: '6201Z', required: false, type: 'text' },
        ],
      };

    case 'ES':
      return {
        countryCode: cc,
        taxLabel: 'IVA',
        taxIdLabel: 'NIF/CIF',
        reverseChargeApplicable: true,
        electronicInvoicingRequired: false,
        fields: [
          { key: 'vat_number', label: 'NIF/CIF', placeholder: 'ESA12345678', required: true, type: 'text', validation: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/, validationMessage: 'Formato NIF/CIF non valido' },
          { key: 'fiscal_code', label: 'DNI/NIE', placeholder: '12345678A', required: false, type: 'text' },
          { key: 'cnae_code', label: 'Código CNAE', placeholder: '6201', required: false, type: 'text' },
        ],
      };

    case 'GB':
      return {
        countryCode: cc,
        taxLabel: 'VAT',
        taxIdLabel: 'VAT Registration Number',
        reverseChargeApplicable: false,
        electronicInvoicingRequired: false,
        fields: [
          { key: 'vat_number', label: 'VAT Number', placeholder: 'GB123456789', required: true, type: 'text', validation: /^GB(\d{9}|\d{12})$/, validationMessage: 'Formato: GB + 9 o 12 cifre' },
          { key: 'fiscal_code', label: 'Company Number', placeholder: '12345678', required: false, type: 'text' },
          { key: 'utr', label: 'UTR (Unique Taxpayer Ref)', placeholder: '1234567890', required: false, type: 'text' },
        ],
      };

    case 'US':
      return {
        countryCode: cc,
        taxLabel: 'Sales Tax',
        taxIdLabel: 'EIN (Employer Identification Number)',
        reverseChargeApplicable: false,
        electronicInvoicingRequired: false,
        fields: [
          { key: 'vat_number', label: 'EIN', placeholder: '12-3456789', required: true, type: 'text', validation: /^\d{2}-?\d{7}$/, validationMessage: 'Formato: XX-XXXXXXX' },
          { key: 'fiscal_code', label: 'State Tax ID', placeholder: 'Varia per stato', required: false, type: 'text' },
          { key: 'sales_tax_state', label: 'State', placeholder: 'CA, NY, TX...', required: false, type: 'text' },
          { key: 'ssn_last4', label: 'SSN (ultime 4 cifre)', placeholder: '1234', required: false, type: 'text' },
        ],
      };

    case 'CH':
      return {
        countryCode: cc,
        taxLabel: 'MWST/TVA/IVA',
        taxIdLabel: 'UID / MwSt-Nr.',
        reverseChargeApplicable: false,
        electronicInvoicingRequired: false,
        fields: [
          { key: 'vat_number', label: 'UID-Nr.', placeholder: 'CHE-123.456.789', required: true, type: 'text', validation: /^CHE-?\d{3}\.?\d{3}\.?\d{3}\s?(MWST|TVA|IVA)?$/, validationMessage: 'Formato: CHE-XXX.XXX.XXX' },
          { key: 'fiscal_code', label: 'Handelsregister-Nr.', placeholder: 'CH-020.1.234.567-8', required: false, type: 'text' },
        ],
      };

    default:
      // Generic fiscal config for other EU countries
      if (EU_COUNTRIES.has(cc)) {
        return {
          countryCode: cc,
          taxLabel: 'VAT',
          taxIdLabel: 'VAT Number',
          reverseChargeApplicable: true,
          electronicInvoicingRequired: false,
          fields: [
            { key: 'vat_number', label: 'VAT Number', placeholder: `${cc}XXXXXXXXX`, required: true, type: 'text', validation: new RegExp(`^${cc}[A-Z0-9]{8,12}$`), validationMessage: `Formato: ${cc} + 8-12 caratteri` },
            { key: 'fiscal_code', label: 'Tax ID / Registration', placeholder: 'ID fiscale nazionale', required: false, type: 'text' },
          ],
        };
      }

      // Non-EU generic
      return {
        countryCode: cc,
        taxLabel: 'Tax',
        taxIdLabel: 'Tax ID',
        reverseChargeApplicable: false,
        electronicInvoicingRequired: false,
        fields: [
          { key: 'vat_number', label: 'Tax ID', placeholder: 'Tax identification number', required: true, type: 'text' },
        ],
      };
  }
}

/**
 * Check if reverse charge applies to a transaction between two EU countries.
 * Reverse charge applies when:
 * - Both parties are in the EU
 * - They are in DIFFERENT EU countries
 * - Both have valid VAT numbers
 */
export function isReverseChargeApplicable(
  sellerCountry: string,
  buyerCountry: string,
  sellerHasVat: boolean,
  buyerHasVat: boolean
): { applicable: boolean; reason: string } {
  const seller = sellerCountry.toUpperCase();
  const buyer = buyerCountry.toUpperCase();

  if (!EU_COUNTRIES.has(seller) || !EU_COUNTRIES.has(buyer)) {
    return { applicable: false, reason: 'Reverse charge applicabile solo tra paesi UE' };
  }

  if (seller === buyer) {
    return { applicable: false, reason: 'Stesso paese — IVA nazionale si applica' };
  }

  if (!sellerHasVat || !buyerHasVat) {
    return { applicable: false, reason: 'Entrambe le parti devono avere P.IVA valida per reverse charge' };
  }

  return {
    applicable: true,
    reason: `Reverse charge applicabile: ${seller} → ${buyer} (inversione contabile UE)`,
  };
}

/**
 * US Sales Tax support.
 * Punto 25: Supporto Sales Tax USA.
 */
export const US_STATE_TAX_RATES: Record<string, number> = {
  AL: 4.0, AK: 0, AZ: 5.6, AR: 6.5, CA: 7.25, CO: 2.9, CT: 6.35,
  DE: 0, FL: 6.0, GA: 4.0, HI: 4.0, ID: 6.0, IL: 6.25, IN: 7.0,
  IA: 6.0, KS: 6.5, KY: 6.0, LA: 4.45, ME: 5.5, MD: 6.0, MA: 6.25,
  MI: 6.0, MN: 6.875, MS: 7.0, MO: 4.225, MT: 0, NE: 5.5, NV: 6.85,
  NH: 0, NJ: 6.625, NM: 5.125, NY: 4.0, NC: 4.75, ND: 5.0, OH: 5.75,
  OK: 4.5, OR: 0, PA: 6.0, RI: 7.0, SC: 6.0, SD: 4.2, TN: 7.0,
  TX: 6.25, UT: 6.1, VT: 6.0, VA: 5.3, WA: 6.5, WV: 6.0, WI: 5.0,
  WY: 4.0, DC: 6.0,
};

export function getUSSalesTaxRate(stateCode: string): number {
  return US_STATE_TAX_RATES[stateCode.toUpperCase()] || 0;
}
