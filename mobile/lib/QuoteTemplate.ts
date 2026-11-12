import sanitizeHtml from 'sanitize-html';
import { APP_NAME } from './brand';

import { isReverseChargeApplicable } from './fiscalSwitch';
import { renderStandardQuote } from './standardQuoteHtml';

export interface QuoteData {
  lavoroTitle: string;
  clienteName: string;
  clienteEmail?: string;
  clienteAddress?: string;
  clienteCity?: string;
  clientePostalCode?: string;
  clienteVat?: string;
  clienteFiscalCode?: string;
  clientePhone?: string;
  revision: number;
  items: ({ description: string; quantity: number; unit_price: number; material_markup: number } & QuoteLineExtras)[];
  vat_percent: number;
  companyName?: string;
  vatNumber?: string;
  fiscalCode?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  iban?: string;
  swift?: string;
  countryCode?: string;
  templateType?: 'classic' | 'minimal' | 'professional' | 'custom';
  customTemplateHtml?: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  // Punto 22: Client country code for reverse charge
  clientCountryCode?: string;
  // Punto 23: Client preferred language for PDF labels
  language?: string;
  // Punto 24: Currency override
  currency?: string;
}

const TAX_LABELS: Record<string, string> = {
  IT: 'IVA',
  DE: 'MwSt',
  FR: 'TVA',
  ES: 'IVA',
  PT: 'IVA',
  NL: 'VAT',
  BE: 'VAT',
  AT: 'USt',
  CH: 'MWST',
  SE: 'VAT',
  NO: 'MVA',
  DK: 'VAT',
  FI: 'VAT',
  PL: 'VAT',
  CZ: 'DPH',
  SK: 'DPH',
  HU: 'ÁFA',
  RO: 'TVA',
  BG: 'ДДС',
  HR: 'PDV',
  SI: 'DDV',
  UK: 'ПДВ',
  RU: 'НДС',
  GR: 'ΦΠΑ',
  GB: 'VAT',
  IE: 'VAT',
  US: 'Tax',
  CA: 'Tax',
  JP: '税',
  KR: '세금',
  CN: '税',
  default: 'Tax'
};

const PAYMENT_TERMS: Record<string, string> = {
  IT: 'Pagamento a 30 giorni da data fattura. Bonifico bancario.',
  DE: 'Zahlung innerhalb von 30 Tagen nach Rechnungsdatum. Banküberweisung.',
  FR: 'Paiement à 30 jours de la date de facturation. Virement bancaire.',
  ES: 'Pago a 30 días de la fecha de factura. Transferencia bancaria.',
  PT: 'Pagamento a 30 dias da data da fatura. Transferência bancária.',
  NL: 'Betaling binnen 30 dagen van factuurdatum. Bankoverschrijving.',
  BE: 'Betaling binnen 30 dagen van factuurdatum. Bankoverschrijving.',
  AT: 'Zahlung innerhalb von 30 Tagen nach Rechnungsdatum. Banküberweisung.',
  CH: 'Zahlung innerhalb von 30 Tagen nach Rechnungsdatum. Banküberweisung.',
  SE: 'Betalning inom 30 dagar från fakturadatum. Banköverföring.',
  NO: 'Betaling innen 30 dager fra fakturadato. Bankoverføring.',
  DK: 'Betaling inden 30 dage fra fakturadato. Bankoverføring.',
  FI: 'Maksu 30 päivän kuluessa laskun päivämäärästä. Pankkisiirto.',
  PL: 'Płatność w ciągu 30 dni od daty faktury. Przelew bankowy.',
  CZ: 'Platba do 30 dnů od data faktury. Bankovní převod.',
  SK: 'Platba do 30 dní od dátumu faktúry. Bankový prevod.',
  HU: 'Fizetendő 30 napon belül a számla dátumától. Bankátutalás.',
  RO: 'Plată în termen de 30 zile de la data facturii. Transfer bancar.',
  BG: 'Плащане в рамките на 30 дни от датата на фактурата. Банков превод.',
  HR: 'Plaćanje u roku od 30 dana od datuma fakture. Bankovni transfer.',
  SI: 'Plačilo v roku 30 dni od datuma računa. Bančni nalog.',
  UK: 'Оплата в течение 30 дней с даты счета. Банковский перевод.',
  RU: 'Оплата в течение 30 дней с даты счета. Банковский перевод.',
  GR: 'Πληρωμή σε 30 ημέρες από την ημερομηνία του τιμολογίου. Τραπεζική μεταφορά.',
  GB: 'Payment within 30 days from invoice date. Bank transfer.',
  IE: 'Payment within 30 days from invoice date. Bank transfer.',
  US: 'Payment due within 30 days. Bank transfer or check.',
  CA: 'Payment due within 30 days. Bank transfer or check.',
  JP: '請求日から30日以内のお支払いをお願いします。銀行振込。',
  KR: '청구일로부터 30일 이내에 결제하기 바랍니다. 은행 이체.',
  CN: '请在发票日期后30天内付款。银行转账。',
  default: 'Payment due within 30 days. Bank transfer.'
};

const LOCALE_BY_COUNTRY: Record<string, string> = {
  IT: 'it-IT', DE: 'de-DE', FR: 'fr-FR', ES: 'es-ES', PT: 'pt-PT', NL: 'nl-NL', BE: 'fr-BE', AT: 'de-AT',
  CH: 'de-CH', SE: 'sv-SE', NO: 'nb-NO', DK: 'da-DK', GB: 'en-GB', US: 'en-US',
};

/** Locale of the quote's country, not of the server or device that renders it. */
function quoteLocale(cc: string): string {
  return LOCALE_BY_COUNTRY[cc] || 'it-IT';
}

/** "€ 1.930,00" for Italy: grouping and decimals as the client expects them. */
function formatMoney(currency: string, value: number, cc: string): string {
  // 'always': Italian rules alone would print 1930,00 instead of 1.930,00.
  const amount = (Number(value) || 0).toLocaleString(quoteLocale(cc), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: 'always',
  } as Intl.NumberFormatOptions);
  return `${currency} ${amount}`;
}

function formatQuoteDate(cc: string, withTime = false): string {
  const options: Intl.DateTimeFormatOptions = withTime
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' };
  return new Date().toLocaleString(quoteLocale(cc), { timeZone: 'Europe/Rome', ...options });
}

/** Optional per-line data for templates with their own columns (code, unit, discount). */
export type QuoteLineExtras = {
  code?: string | null;
  unit?: string | null;
  discount_percent?: number | null;
};

const CODE_SUFFIX_RE = /\s*\(cod\.\s*([^)]+)\)\s*$/i;

/** Unit of measure read from the description (the quote line does not store one). */
function inferUnit(description: string): string {
  const text = description.toLowerCase();
  if (/prezzo al metro|\bal m\b|\bml\b|\bmetri lineari\b/.test(text)) return 'm';
  if (/prezzo a foglio/.test(text)) return 'pz';
  if (/\b(mq|m2|m²)\b/.test(text)) return 'm²';
  if (/manodopera|\bore\b/.test(text)) return 'h';
  return '';
}

/** Code, unit and discount of a preventivi_dettaglio row, for the template columns. */
export function quoteLineExtras(line: {
  description?: string | null;
  discount_percent?: unknown;
  unit?: string | null;
}): QuoteLineExtras {
  const description = String(line.description || '');
  return {
    code: CODE_SUFFIX_RE.exec(description)?.[1]?.trim() || null,
    // Unit saved on the line (from the price list or typed in); else read from the description.
    unit: String(line.unit || '').trim() || inferUnit(description) || null,
    discount_percent: Number(line.discount_percent) || 0,
  };
}

function lineDiscountFactor(item: { discount_percent?: number | null }): number {
  return 1 - (Number(item.discount_percent) || 0) / 100;
}

function escapeTemplateValue(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * {{#items}}<tr>...{{/items}}: the template's own item row, repeated for every line.
 * Fields: {{item.index}} {{item.code}} {{item.description}} {{item.unit}} {{item.quantity}}
 * {{item.price}} {{item.discount}} {{item.vat}} {{item.total}}.
 */
function renderItemRows(
  template: string,
  items: Array<{ description: string; quantity: number; unit_price: number } & QuoteLineExtras>,
  currency: string,
  cc: string,
  vatPercent: number
): string {
  return template.replace(/\{\{#items\}\}([\s\S]*?)\{\{\/items\}\}/g, (_block, row: string) => {
    const usesCode = /\{\{\s*item\.code\s*\}\}/.test(row);
    return items
      .map((item, index) => {
        const quantity = Number(item.quantity) || 0;
        const price = Number(item.unit_price) || 0;
        const discount = Number(item.discount_percent) || 0;
        const fields: Record<string, string> = {
          index: String(index + 1),
          code: item.code || '',
          // With a code column the "(cod. ...)" suffix would be shown twice.
          description: usesCode ? item.description.replace(CODE_SUFFIX_RE, '') : item.description,
          unit: item.unit || '',
          quantity: quantity.toLocaleString(quoteLocale(cc), { maximumFractionDigits: 2 }),
          price: formatMoney(currency, price, cc),
          discount: discount ? `${discount.toLocaleString(quoteLocale(cc))}%` : '',
          vat: `${vatPercent}%`,
          total: formatMoney(currency, quantity * price * lineDiscountFactor(item), cc),
        };
        return row.replace(/\{\{\s*item\.(\w+)\s*\}\}/g, (_m, field: string) =>
          fields[field] ?? ''
        );
      })
      .join('\n');
  });
}

const TEMPLATE_ALLOWED_TAGS = [
  'html', 'head', 'body', 'meta', 'title', 'style', 'div', 'span', 'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 'small', 'sub', 'sup',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'colgroup', 'col', 'img', 'a', 'center', 'font', 'section', 'header', 'footer', 'main',
  'article', 'blockquote', 'pre', 'code',
];

/**
 * Removes from a template anything that could run code, load external content or
 * submit data: templates come from user files and AI output, and end up in the app,
 * in emails and on the client's public page.
 */
export function sanitizeTemplateMarkup(html: string): string {
  const clean = sanitizeHtml(html, {
    allowedTags: TEMPLATE_ALLOWED_TAGS,
    allowVulnerableTags: true, // <style> is needed by templates; its content is filtered below
    allowedAttributes: {
      '*': [
        'class', 'style', 'id', 'title', 'lang', 'dir', 'align', 'valign', 'width', 'height',
        'border', 'cellpadding', 'cellspacing', 'bgcolor', 'colspan', 'rowspan', 'data-*',
      ],
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt'],
      meta: ['charset', 'name', 'content'],
    },
    allowedSchemes: ['https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['https', 'data'] },
    allowProtocolRelative: false,
    exclusiveFilter: (frame) =>
      frame.tag === 'meta' &&
      !('charset' in frame.attribs) &&
      frame.attribs.name !== 'color-scheme',
    transformTags: {
      img: (tagName, attribs) => {
        const { src, ...rest } = attribs;
        const safe =
          /^\{\{/.test(src || '') ||
          /^https:\/\//i.test(src || '') ||
          /^data:image\/(png|jpe?g|gif|webp);/i.test(src || '');
        return { tagName, attribs: safe ? attribs : rest };
      },
    },
  });
  return clean
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(["']?)(?!data:image\/)[^)]*\1\s*\)/gi, 'none')
    .replace(/expression\s*\(/gi, '(');
}

/**
 * <span data-if="clienteVat">P.IVA {{clienteVat}}</span>: the element (label included)
 * is dropped when that field is empty, so a client without VAT number or address does
 * not leave "P.IVA" or " - , - " on the quote. Elements are matched by counting tags,
 * so a block containing other <div>s is removed whole.
 */
const CONDITIONAL_OPEN =
  /<(span|p|div|td|li|strong|b|em|small|tr)\b([^>]*?)\sdata-if=(["'])([\w.]+)\3([^>]*)>/i;

/** Position just after the tag closing the element whose content starts at `from`; -1 if none. */
function closingTagEnd(html: string, tag: string, from: number): number {
  const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  tags.lastIndex = from;
  let depth = 1;
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return match.index + match[0].length;
  }
  return -1;
}

function applyConditionalBlocks(template: string, values: Record<string, string | undefined | null>): string {
  let output = '';
  let rest = template;
  for (let match = CONDITIONAL_OPEN.exec(rest); match; match = CONDITIONAL_OPEN.exec(rest)) {
    const [open, tag, before, , field, after] = match;
    const contentStart = match.index + open.length;
    const end = closingTagEnd(rest, tag, contentStart);
    const value = values[field];
    const empty = value === undefined || value === null || String(value).trim() === '';
    output += rest.slice(0, match.index);
    if (empty && end !== -1) {
      rest = rest.slice(end);
    } else {
      // Kept: its content is scanned too, for conditions nested inside it.
      output += `<${tag}${before}${after}>`;
      rest = rest.slice(contentStart);
    }
  }
  return output + rest;
}

const CURRENCIES: Record<string, string> = {
  IT: '€',
  DE: '€',
  FR: '€',
  ES: '€',
  PT: '€',
  NL: '€',
  BE: '€',
  AT: '€',
  CH: 'CHF',
  SE: 'kr',
  NO: 'kr',
  DK: 'kr',
  FI: '€',
  PL: 'zł',
  CZ: 'Kč',
  SK: '€',
  HU: 'Ft',
  RO: 'lei',
  BG: 'лв',
  HR: 'kn',
  SI: '€',
  UK: '₴',
  RU: '₽',
  GR: '€',
  GB: '£',
  IE: '€',
  US: '$',
  CA: 'C$',
  JP: '¥',
  KR: '₩',
  CN: '¥',
  default: '€'
};

const QUOTE_LABEL: Record<string, string> = {
  IT: 'PREVENTIVO',
  DE: 'ANGEBOT',
  FR: 'DEVIS',
  ES: 'PRESUPUESTO',
  PT: 'ORÇAMENTO',
  NL: 'OFFERTE',
  BE: 'OFFERTE',
  AT: 'ANGEBOT',
  CH: 'ANGEBOT',
  SE: 'OFFERT',
  NO: 'TILBUD',
  DK: 'TILBUD',
  FI: 'TARJOUS',
  PL: 'WYCENA',
  CZ: 'NABÍDKA',
  SK: 'PONUKA',
  HU: 'AJÁNLAT',
  RO: 'OFERTĂ',
  BG: 'ОФЕРТА',
  HR: 'PONUDA',
  SI: 'PONUDBA',
  UK: 'ПРОПОЗИЦІЯ',
  RU: 'ПРЕДЛОЖЕНИЕ',
  GR: 'ΠΡΟΣΦΟΡΆ',
  GB: 'QUOTE',
  IE: 'QUOTE',
  US: 'QUOTE',
  CA: 'QUOTE',
  JP: '見積書',
  KR: '견적서',
  CN: '报价单',
  default: 'QUOTE'
};

const CLIENT_LABEL: Record<string, string> = {
  IT: 'CLIENTE:',
  DE: 'KUNDE:',
  FR: 'CLIENT:',
  ES: 'CLIENTE:',
  PT: 'CLIENTE:',
  NL: 'KLANT:',
  BE: 'KLANT:',
  AT: 'KUNDE:',
  CH: 'KUNDE:',
  SE: 'KUND:',
  NO: 'KUNDE:',
  DK: 'KUNDE:',
  FI: 'ASIAKAS:',
  PL: 'KLIENT:',
  CZ: 'ZÁKAZNÍK:',
  SK: 'ZÁKAZNÍK:',
  HU: 'ÜGYFÉL:',
  RO: 'CLIENT:',
  BG: 'КЛИЕНТ:',
  HR: 'KLIJENT:',
  SI: 'NAROČNIK:',
  UK: 'КЛІЄНТ:',
  RU: 'КЛИЕНТ:',
  GR: 'ΠΕΛΆΤΗΣ:',
  GB: 'CLIENT:',
  IE: 'CLIENT:',
  US: 'CLIENT:',
  CA: 'CLIENT:',
  JP: 'クライアント:',
  KR: '고객:',
  CN: '客户:',
  default: 'CLIENT:'
};

const SUBTOTAL_LABEL: Record<string, string> = {
  IT: 'Imponibile:',
  DE: 'Steuerpflichtig:',
  FR: 'Montant imposable:',
  ES: 'Importe imponible:',
  PT: 'Valor tributável:',
  NL: 'Belastbaar bedrag:',
  BE: 'Belastbaar bedrag:',
  AT: 'Steuerpflichtig:',
  CH: 'Steuerpflichtig:',
  SE: 'Skatteplikt:',
  NO: 'Skattepliktig:',
  DK: 'Skattepligtig:',
  FI: 'Veronalainen:',
  PL: 'Kwota podlegająca opodatkowaniu:',
  CZ: 'Částka podléhající zdanění:',
  SK: 'Suma podliehajúca zákonu:',
  HU: 'Adóalap:',
  RO: 'Bază de impozitare:',
  BG: 'Облагаема база:',
  HR: 'Osnova za oporezivanje:',
  SI: 'Podlaga za obdavčitev:',
  UK: 'Оподатковувана база:',
  RU: 'Налоговая база:',
  GR: 'Φορολογητέα βάση:',
  GB: 'Subtotal:',
  IE: 'Subtotal:',
  US: 'Subtotal:',
  CA: 'Subtotal:',
  JP: '小計:',
  KR: '소계:',
  CN: '小计:',
  default: 'Subtotal:'
};

const TAX_LABEL_FULL: Record<string, string> = {
  IT: 'Tasse:',
  DE: 'Steuern:',
  FR: 'Taxes:',
  ES: 'Impuestos:',
  PT: 'Impostos:',
  NL: 'Belastingen:',
  BE: 'Belastingen:',
  AT: 'Steuern:',
  CH: 'Steuern:',
  SE: 'Skatter:',
  NO: 'Skatter:',
  DK: 'Skatter:',
  FI: 'Verot:',
  PL: 'Podatki:',
  CZ: 'Daně:',
  SK: 'Dane:',
  HU: 'Adók:',
  RO: 'Taxe:',
  BG: 'Данъци:',
  HR: 'Porezi:',
  SI: 'Davki:',
  UK: 'Податки:',
  RU: 'Налоги:',
  GR: 'Φόροι:',
  GB: 'Taxes:',
  IE: 'Taxes:',
  US: 'Taxes:',
  CA: 'Taxes:',
  JP: '税金:',
  KR: '세금:',
  CN: '税款:',
  default: 'Taxes:'
};

const TOTAL_LABEL: Record<string, string> = {
  IT: 'TOTALE:',
  DE: 'GESAMTSUMME:',
  FR: 'TOTAL:',
  ES: 'TOTAL:',
  PT: 'TOTAL:',
  NL: 'TOTAAL:',
  BE: 'TOTAAL:',
  AT: 'GESAMTSUMME:',
  CH: 'GESAMTSUMME:',
  SE: 'SUMMA:',
  NO: 'TOTAL:',
  DK: 'TOTAL:',
  FI: 'YHTEENSÄ:',
  PL: 'RAZEM:',
  CZ: 'CELKEM:',
  SK: 'SPOLU:',
  HU: 'ÖSSZESEN:',
  RO: 'TOTAL:',
  BG: 'ОБЩО:',
  HR: 'UKUPNO:',
  SI: 'SKUPAJ:',
  UK: 'ВСЬОГО:',
  RU: 'ИТОГО:',
  GR: 'ΣΎΝΟΛΟ:',
  GB: 'TOTAL:',
  IE: 'TOTAL:',
  US: 'TOTAL:',
  CA: 'TOTAL:',
  JP: '合計:',
  KR: '합계:',
  CN: '总计:',
  default: 'TOTAL:'
};

const DESCRIPTION_LABEL: Record<string, string> = {
  IT: 'Descrizione',
  DE: 'Beschreibung',
  FR: 'Description',
  ES: 'Descripción',
  PT: 'Descrição',
  NL: 'Beschrijving',
  BE: 'Beschrijving',
  AT: 'Beschreibung',
  CH: 'Beschreibung',
  SE: 'Beskrivning',
  NO: 'Beskrivelse',
  DK: 'Beskrivelse',
  FI: 'Kuvaus',
  PL: 'Opis',
  CZ: 'Popis',
  SK: 'Popis',
  HU: 'Leírás',
  RO: 'Descriere',
  BG: 'Описание',
  HR: 'Opis',
  SI: 'Opis',
  UK: 'Опис',
  RU: 'Описание',
  GR: 'Περιγραφή',
  GB: 'Description',
  IE: 'Description',
  US: 'Description',
  CA: 'Description',
  JP: '説明',
  KR: '설명',
  CN: '描述',
  default: 'Description'
};

const QUANTITY_LABEL: Record<string, string> = {
  IT: 'Qty',
  DE: 'Menge',
  FR: 'Qté',
  ES: 'Cant.',
  PT: 'Qtd.',
  NL: 'Hoeveelheid',
  BE: 'Hoeveelheid',
  AT: 'Menge',
  CH: 'Menge',
  SE: 'Mängd',
  NO: 'Mengde',
  DK: 'Mængde',
  FI: 'Määrä',
  PL: 'Ilość',
  CZ: 'Množství',
  SK: 'Množstvo',
  HU: 'Mennyiség',
  RO: 'Cantitate',
  BG: 'Количество',
  HR: 'Količina',
  SI: 'Količina',
  UK: 'Кількість',
  RU: 'Количество',
  GR: 'Ποσότητα',
  GB: 'Qty',
  IE: 'Qty',
  US: 'Qty',
  CA: 'Qty',
  JP: '数量',
  KR: '수량',
  CN: '数量',
  default: 'Qty'
};

const PRICE_LABEL: Record<string, string> = {
  IT: 'Prezzo Unit.',
  DE: 'Einzelpreis',
  FR: 'Prix Unit.',
  ES: 'Precio Unit.',
  PT: 'Preço Unit.',
  NL: 'Eenheidsprijs',
  BE: 'Eenheidsprijs',
  AT: 'Einzelpreis',
  CH: 'Einzelpreis',
  SE: 'Enhetspris',
  NO: 'Enhetspris',
  DK: 'Enhedspris',
  FI: 'Yksikköhinta',
  PL: 'Cena jednostkowa',
  CZ: 'Jednotková cena',
  SK: 'Jednotková cena',
  HU: 'Egységár',
  RO: 'Preț unitar',
  BG: 'Единична цена',
  HR: 'Jedinična cijena',
  SI: 'Enotni cena',
  UK: 'Ціна за одиницю',
  RU: 'Цена за единицу',
  GR: 'Τιμή μονάδας',
  GB: 'Unit Price',
  IE: 'Unit Price',
  US: 'Unit Price',
  CA: 'Unit Price',
  JP: '単価',
  KR: '단가',
  CN: '单价',
  default: 'Unit Price'
};

const SUBTOTAL_COL_LABEL: Record<string, string> = {
  IT: 'Subtotale',
  DE: 'Gesamtbetrag',
  FR: 'Sous-total',
  ES: 'Subtotal',
  PT: 'Subtotal',
  NL: 'Subtotaal',
  BE: 'Subtotaal',
  AT: 'Gesamtbetrag',
  CH: 'Gesamtbetrag',
  SE: 'Delsumma',
  NO: 'Delsum',
  DK: 'Delsum',
  FI: 'Osasumma',
  PL: 'Razem częściowo',
  CZ: 'Mezisoučet',
  SK: 'Medzisoučet',
  HU: 'Részösszeg',
  RO: 'Subtotal',
  BG: 'Частична сума',
  HR: 'Međusuma',
  SI: 'Delne vsote',
  UK: 'Проміжна сума',
  RU: 'Промежуточный итог',
  GR: 'Ενδιάμεσο σύνολο',
  GB: 'Subtotal',
  IE: 'Subtotal',
  US: 'Subtotal',
  CA: 'Subtotal',
  JP: '小計',
  KR: '소계',
  CN: '小计',
  default: 'Subtotal'
};

const SIGNATURE_LABEL: Record<string, string> = {
  IT: 'Firma',
  DE: 'Unterschrift',
  FR: 'Signature',
  ES: 'Firma',
  PT: 'Assinatura',
  NL: 'Handtekening',
  BE: 'Handtekening',
  AT: 'Unterschrift',
  CH: 'Unterschrift',
  SE: 'Signatur',
  NO: 'Signatur',
  DK: 'Underskrift',
  FI: 'Allekirjoitus',
  PL: 'Podpis',
  CZ: 'Podpis',
  SK: 'Podpis',
  HU: 'Aláírás',
  RO: 'Semnătură',
  BG: 'Подпис',
  HR: 'Potpis',
  SI: 'Podpis',
  UK: 'Підпис',
  RU: 'Подпись',
  GR: 'Υπογραφή',
  GB: 'Signature',
  IE: 'Signature',
  US: 'Signature',
  CA: 'Signature',
  JP: '署名',
  KR: '서명',
  CN: '签名',
  default: 'Signature'
};

const APPROVED_LABEL: Record<string, string> = {
  IT: 'Approvato',
  DE: 'Genehmigt',
  FR: 'Approuvé',
  ES: 'Aprobado',
  PT: 'Aprovado',
  NL: 'Goedgekeurd',
  BE: 'Goedgekeurd',
  AT: 'Genehmigt',
  CH: 'Genehmigt',
  SE: 'Godkänd',
  NO: 'Godkjent',
  DK: 'Godkendt',
  FI: 'Hyväksytty',
  PL: 'Zatwierdzone',
  CZ: 'Schváleno',
  SK: 'Schválené',
  HU: 'Jóváhagyott',
  RO: 'Aprobat',
  BG: 'Одобрено',
  HR: 'Odobreno',
  SI: 'Odobreno',
  UK: 'Затверджено',
  RU: 'Одобрено',
  GR: 'Εγκρίθηκε',
  GB: 'Approved',
  IE: 'Approved',
  US: 'Approved',
  CA: 'Approved',
  JP: '承認済み',
  KR: '승인됨',
  CN: '已批准',
  default: 'Approved'
};

/**
 * Where the client's "accept the quote" link goes in a custom template. The quote
 * document (preview, PDF, public page) shows nothing there; the email puts the button
 * at {{acceptanceLink}}, or the bare link at {{acceptanceUrl}} for templates with
 * their own button style. Without either, the button is added at the end of the email.
 */
export const ACCEPTANCE_LINK_MARKER = '<!--QUOTE_ACCEPTANCE_LINK-->';
export const ACCEPTANCE_URL_MARKER = 'https://accettazione.invalid/preventivo';

function processCustomTemplate(template: string, data: QuoteData): string {
  const cc = data.countryCode?.toUpperCase() || 'IT';
  const currency = CURRENCIES[cc] || CURRENCIES.default;
  const taxLabel = TAX_LABELS[cc] || TAX_LABELS.default;
  
  const subtotal = data.items.reduce((s, d) => s + Number(d.quantity) * Number(d.unit_price) * lineDiscountFactor(d), 0);
  const totalWithMarkup = data.items.reduce((s, d) => s + Number(d.quantity) * Number(d.unit_price) * lineDiscountFactor(d) * (1 + Number(d.material_markup) / 100), 0);
  const taxes = totalWithMarkup * (Number(data.vat_percent) / 100);
  const total = totalWithMarkup + taxes;

  // Generate items table rows
  const itemsHtml = data.items.map((item) => {
    const rowSubtotal = Number(item.quantity) * Number(item.unit_price) * lineDiscountFactor(item);
    const rowWithMarkup = rowSubtotal * (1 + Number(item.material_markup) / 100);
    return `
      <tr>
        <td>${item.description}</td>
        <td>${item.quantity}</td>
        <td>${formatMoney(currency, Number(item.unit_price), cc)}</td>
        <td>${item.material_markup}%</td>
        <td>${formatMoney(currency, rowWithMarkup, cc)}</td>
      </tr>
    `.trim();
  }).join('\n');

  // Replace all placeholders
  let html = renderItemRows(applyConditionalBlocks(sanitizeTemplateMarkup(template), {
      clienteName: data.clienteName,
      clienteEmail: data.clienteEmail,
      clienteAddress: data.clienteAddress,
      clienteCity: data.clienteCity,
      clientePostalCode: data.clientePostalCode,
      clienteVat: data.clienteVat,
      clienteFiscalCode: data.clienteFiscalCode,
      clientePhone: data.clientePhone,
      iban: data.iban,
      swift: data.swift,
      vatNumber: data.vatNumber,
      fiscalCode: data.fiscalCode,
      lavoroTitle: data.lavoroTitle,
    }), data.items, currency, cc, Number(data.vat_percent) || 0)
    .replace(/\{\{lavoroTitle\}\}/g, () => data.lavoroTitle || '')
    .replace(/\{\{clienteName\}\}/g, () => data.clienteName || '')
    .replace(/\{\{clienteEmail\}\}/g, () => data.clienteEmail || '')
    .replace(/\{\{clienteAddress\}\}/g, () => data.clienteAddress || '')
    .replace(/\{\{clienteCity\}\}/g, () => data.clienteCity || '')
    .replace(/\{\{clientePostalCode\}\}/g, () => data.clientePostalCode || '')
    .replace(/\{\{clienteVat\}\}/g, () => data.clienteVat || '')
    .replace(/\{\{clienteFiscalCode\}\}/g, () => data.clienteFiscalCode || '')
    .replace(/\{\{clientePhone\}\}/g, () => data.clientePhone || '')
    .replace(/\{\{vatPercent\}\}/g, () => `${Number(data.vat_percent) || 0}%`)
    .replace(/\{\{revision\}\}/g, () => String(data.revision).padStart(2, '0'))
    .replace(/\{\{revisionNumber\}\}/g, () => String(data.revision))
    .replace(/\{\{companyName\}\}/g, () => data.companyName || '')
    .replace(/\{\{vatNumber\}\}/g, () => data.vatNumber || '')
    .replace(/\{\{fiscalCode\}\}/g, () => data.fiscalCode || '')
    .replace(/\{\{address\}\}/g, () => data.address || '')
    .replace(/\{\{city\}\}/g, () => data.city || '')
    .replace(/\{\{postalCode\}\}/g, () => data.postalCode || '')
    .replace(/\{\{country\}\}/g, () => data.country || '')
    .replace(/\{\{iban\}\}/g, () => data.iban || '')
    .replace(/\{\{swift\}\}/g, () => data.swift || '')
    .replace(/\{\{currency\}\}/g, () => currency)
    .replace(/\{\{taxLabel\}\}/g, () => taxLabel)
    .replace(/\{\{items\}\}/g, () => itemsHtml)
    .replace(/\{\{subtotal\}\}/g, () => `${formatMoney(currency, subtotal, cc)}`)
    .replace(/\{\{taxes\}\}/g, () => `${formatMoney(currency, taxes, cc)}`)
    .replace(/\{\{total\}\}/g, () => `${formatMoney(currency, total, cc)}`)
    .replace(/\{\{date\}\}/g, () => formatQuoteDate(cc))
    .replace(/\{\{dateTime\}\}/g, () => formatQuoteDate(cc, true))
    .replace(/\{\{acceptanceLink\}\}/g, () => ACCEPTANCE_LINK_MARKER)
    .replace(/\{\{acceptanceUrl\}\}/g, () => ACCEPTANCE_URL_MARKER)
    // Placeholders with no value (or misspelt) must not reach the client as "{{...}}".
    .replace(/\{\{[^{}]*\}\}/g, '');

  return html;
}

/** Every text that reaches the document is escaped once, here, at the entrance. */
function escapeQuoteData(data: QuoteData): QuoteData {
  const text = <T extends string | undefined | null>(value: T): T =>
    (typeof value === 'string' ? escapeTemplateValue(value) : value) as T;
  return {
    ...data,
    lavoroTitle: text(data.lavoroTitle),
    clienteName: text(data.clienteName),
    clienteEmail: text(data.clienteEmail),
    clienteAddress: text(data.clienteAddress),
    clienteCity: text(data.clienteCity),
    clientePostalCode: text(data.clientePostalCode),
    clienteVat: text(data.clienteVat),
    clienteFiscalCode: text(data.clienteFiscalCode),
    clientePhone: text(data.clientePhone),
    companyName: text(data.companyName),
    vatNumber: text(data.vatNumber),
    fiscalCode: text(data.fiscalCode),
    address: text(data.address),
    city: text(data.city),
    postalCode: text(data.postalCode),
    country: text(data.country),
    iban: text(data.iban),
    swift: text(data.swift),
    items: data.items.map((item) => ({
      ...item,
      description: text(item.description),
      code: text(item.code),
      unit: text(item.unit),
    })),
  };
}

export function generateQuoteHTML(rawData: QuoteData): string {
  const data = escapeQuoteData(rawData);
  const brandColor = /^#[0-9a-f]{6}$/i.test(rawData.brandColor || '') ? rawData.brandColor! : '#1f2937';
  const logoUrl = /^https:\/\//i.test(rawData.logoUrl || '') ? escapeTemplateValue(rawData.logoUrl!) : '';
  // Use custom template if provided
  if (data.templateType === 'custom' && data.customTemplateHtml) {
    return processCustomTemplate(data.customTemplateHtml, data);
  }

  const cc = data.countryCode?.toUpperCase() || 'IT';
  // Punto 23: Use client language for labels if provided, fallback to country code
  const lang = data.language?.toUpperCase() || cc;
  const taxLabel = TAX_LABELS[lang] || TAX_LABELS[cc] || TAX_LABELS.default;
  // Punto 24: Currency override
  const CURRENCY_SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', JPY: '¥', KRW: '₩' };
  const currency = data.currency ? (CURRENCY_SYMBOLS[data.currency] || '€') : (CURRENCIES[cc] || CURRENCIES.default);
  const paymentTerms = PAYMENT_TERMS[lang] || PAYMENT_TERMS[cc] || PAYMENT_TERMS.default;
  const quoteLabel = QUOTE_LABEL[lang] || QUOTE_LABEL[cc] || QUOTE_LABEL.default;

  // Punto 22: Reverse charge check
  const rcCheck = data.clientCountryCode
    ? isReverseChargeApplicable(cc, data.clientCountryCode, !!data.vatNumber, true)
    : { applicable: false, reason: '' };
  const isRC = rcCheck.applicable;

  const cityLine = [data.postalCode, data.city].filter(Boolean).join(' ');
  return renderStandardQuote({
    appName: APP_NAME,
    locale: quoteLocale(cc),
    currencySymbol: currency,
    brandColor,
    logoUrl,
    companyName: data.companyName,
    companyDetails: [
      [data.address, cityLine].filter(Boolean).join(', '),
      data.vatNumber ? `P.IVA ${data.vatNumber}` : '',
      data.fiscalCode && data.fiscalCode !== data.vatNumber ? `C.F. ${data.fiscalCode}` : '',
    ].filter(Boolean),
    quoteLabel,
    title: data.lavoroTitle,
    revision: data.revision,
    dateText: formatQuoteDate(cc),
    clientName: data.clienteName,
    clientDetails: [
      [data.clienteAddress, [data.clientePostalCode, data.clienteCity].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', '),
      data.clienteVat ? `P.IVA ${data.clienteVat}` : '',
      data.clienteEmail || '',
    ].filter(Boolean),
    // The client sees the final unit price: the markup is already inside it.
    lines: data.items.map((item) => ({
      description: item.description,
      quantity: Number(item.quantity),
      unit: item.unit,
      unitPrice: Number(item.unit_price) * (1 + Number(item.material_markup) / 100),
      discountPercent: item.discount_percent,
    })),
    vatPercent: Number(data.vat_percent),
    taxLabel,
    reverseCharge: isRC ? 'Inversione contabile (art. 196 Dir. 2006/112/CE)' : null,
    paymentTerms,
    iban: data.iban,
    swift: data.swift,
  });
}
