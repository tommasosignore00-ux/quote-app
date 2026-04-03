export interface QuoteData {
  lavoroTitle: string;
  clienteName: string;
  clienteEmail?: string;
  revision: number;
  items: { description: string; quantity: number; unit_price: number; material_markup: number }[];
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

function processCustomTemplate(template: string, data: QuoteData): string {
  const cc = data.countryCode?.toUpperCase() || 'IT';
  const currency = CURRENCIES[cc] || CURRENCIES.default;
  const taxLabel = TAX_LABELS[cc] || TAX_LABELS.default;
  
  const subtotal = data.items.reduce((s, d) => s + Number(d.quantity) * Number(d.unit_price), 0);
  const totalWithMarkup = data.items.reduce((s, d) => s + Number(d.quantity) * Number(d.unit_price) * (1 + Number(d.material_markup) / 100), 0);
  const taxes = totalWithMarkup * (Number(data.vat_percent) / 100);
  const total = totalWithMarkup + taxes;

  // Generate items table rows
  const itemsHtml = data.items.map((item) => {
    const rowSubtotal = Number(item.quantity) * Number(item.unit_price);
    const rowWithMarkup = rowSubtotal * (1 + Number(item.material_markup) / 100);
    return `
      <tr>
        <td>${item.description}</td>
        <td>${item.quantity}</td>
        <td>${currency}${Number(item.unit_price).toFixed(2)}</td>
        <td>${item.material_markup}%</td>
        <td>${currency}${rowWithMarkup.toFixed(2)}</td>
      </tr>
    `.trim();
  }).join('\n');

  // Replace all placeholders
  let html = template
    .replace(/\{\{lavoroTitle\}\}/g, data.lavoroTitle || '')
    .replace(/\{\{clienteName\}\}/g, data.clienteName || '')
    .replace(/\{\{clienteEmail\}\}/g, data.clienteEmail || '')
    .replace(/\{\{revision\}\}/g, String(data.revision).padStart(2, '0'))
    .replace(/\{\{revisionNumber\}\}/g, String(data.revision))
    .replace(/\{\{companyName\}\}/g, data.companyName || '')
    .replace(/\{\{vatNumber\}\}/g, data.vatNumber || '')
    .replace(/\{\{fiscalCode\}\}/g, data.fiscalCode || '')
    .replace(/\{\{address\}\}/g, data.address || '')
    .replace(/\{\{city\}\}/g, data.city || '')
    .replace(/\{\{postalCode\}\}/g, data.postalCode || '')
    .replace(/\{\{country\}\}/g, data.country || '')
    .replace(/\{\{iban\}\}/g, data.iban || '')
    .replace(/\{\{swift\}\}/g, data.swift || '')
    .replace(/\{\{currency\}\}/g, currency)
    .replace(/\{\{taxLabel\}\}/g, taxLabel)
    .replace(/\{\{items\}\}/g, itemsHtml)
    .replace(/\{\{subtotal\}\}/g, `${currency}${subtotal.toFixed(2)}`)
    .replace(/\{\{taxes\}\}/g, `${currency}${taxes.toFixed(2)}`)
    .replace(/\{\{total\}\}/g, `${currency}${total.toFixed(2)}`)
    .replace(/\{\{date\}\}/g, new Date().toLocaleDateString())
    .replace(/\{\{dateTime\}\}/g, new Date().toLocaleString());

  return html;
}

export function generateQuoteHTML(data: QuoteData): string {
  // Use custom template if provided
  if (data.templateType === 'custom' && data.customTemplateHtml) {
    return processCustomTemplate(data.customTemplateHtml, data);
  }

  const templateType = data.templateType || 'classic';
  const cc = data.countryCode?.toUpperCase() || 'IT';
  const taxLabel = TAX_LABELS[cc] || TAX_LABELS.default;
  const currency = CURRENCIES[cc] || CURRENCIES.default;
  const paymentTerms = PAYMENT_TERMS[cc] || PAYMENT_TERMS.default;
  const quoteLabel = QUOTE_LABEL[cc] || QUOTE_LABEL.default;
  const clientLabel = CLIENT_LABEL[cc] || CLIENT_LABEL.default;
  const subtotalLabel = SUBTOTAL_LABEL[cc] || SUBTOTAL_LABEL.default;
  const taxLabelFull = TAX_LABEL_FULL[cc] || TAX_LABEL_FULL.default;
  const totalLabel = TOTAL_LABEL[cc] || TOTAL_LABEL.default;
  const descriptionLabel = DESCRIPTION_LABEL[cc] || DESCRIPTION_LABEL.default;
  const quantityLabel = QUANTITY_LABEL[cc] || QUANTITY_LABEL.default;
  const priceLabel = PRICE_LABEL[cc] || PRICE_LABEL.default;
  const subtotalColLabel = SUBTOTAL_COL_LABEL[cc] || SUBTOTAL_COL_LABEL.default;
  const signatureLabel = SIGNATURE_LABEL[cc] || SIGNATURE_LABEL.default;
  const approvedLabel = APPROVED_LABEL[cc] || APPROVED_LABEL.default;
  
  const subtotal = data.items.reduce((s, d) => s + Number(d.quantity) * Number(d.unit_price), 0);
  const totalWithMarkup = data.items.reduce((s, d) => s + Number(d.quantity) * Number(d.unit_price) * (1 + Number(d.material_markup) / 100), 0);
  const taxes = totalWithMarkup * (Number(data.vat_percent) / 100);
  const total = totalWithMarkup + taxes;

  const itemsHtml = data.items.map((item) => {
    const rowSubtotal = Number(item.quantity) * Number(item.unit_price);
    const rowWithMarkup = rowSubtotal * (1 + Number(item.material_markup) / 100);
    const rowTax = rowWithMarkup * (Number(data.vat_percent) / 100);
    return `
      <tr style="border-bottom: 1px solid #ddd;">
        <td style="padding: 10px; text-align: left;">${item.description}</td>
        <td style="padding: 10px; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; text-align: right;">${currency}${Number(item.unit_price).toFixed(2)}</td>
        <td style="padding: 10px; text-align: center;">${item.material_markup}%</td>
        <td style="padding: 10px; text-align: right;">${currency}${rowWithMarkup.toFixed(2)}</td>
        <td style="padding: 10px; text-align: right;">${currency}${rowTax.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  // Generate styles based on template type
  const getStyles = (): string => {
    const baseStyles = `
      body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f9f9f9; }
      .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
      .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; }
      .logo-area { font-size: 24px; font-weight: bold; color: #dc2626; }
      .company-info { text-align: right; font-size: 12px; color: #666; }
      .title { font-size: 28px; font-weight: bold; margin: 20px 0; color: #1f2937; }
      .client-section { margin-bottom: 30px; }
      .client-label { font-weight: bold; color: #666; font-size: 12px; margin-bottom: 5px; }
      .client-value { font-size: 16px; color: #1f2937; margin-bottom: 15px; }
      .revision-date { font-size: 12px; color: #999; margin-bottom: 5px; }
      table { width: 100%; border-collapse: collapse; margin: 20px 0; }
      th { padding: 12px; text-align: left; font-weight: bold; font-size: 13px; color: #374151; }
      td { padding: 12px; font-size: 13px; }
      .summary-section { padding: 20px; border-radius: 4px; margin: 20px 0; }
      .summary-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
      .summary-label { font-weight: bold; }
      .summary-value { text-align: right; }
      .total-row { font-size: 16px; font-weight: bold; color: #dc2626; margin-top: 15px; }
      .notes { margin-top: 30px; padding-top: 20px; font-size: 12px; color: #666; line-height: 1.6; }
      .footer { margin-top: 40px; padding-top: 20px; font-size: 11px; color: #999; text-align: center; }
      .signature-area { margin-top: 30px; display: flex; justify-content: space-between; }
      .signature-box { text-align: center; }
      .signature-line { margin-top: 40px; border-top: 1px solid #1f2937; width: 150px; }
    `;

    if (templateType === 'minimal') {
      return baseStyles + `
        .container { padding: 20px; }
        .header { margin-bottom: 15px; border-bottom: 1px solid #e5e7eb; }
        th { background: transparent; padding: 8px; border-bottom: 1px solid #e5e7eb; }
        td { border-bottom: 1px solid #f3f4f6; }
        .summary-section { background: transparent; border-left: 2px solid #e5e7eb; padding-left: 15px; }
        .notes { border-top: none; padding-top: 10px; }
        .signature-area { margin-top: 20px; }
        .signature-line { margin-top: 20px; }
      `;
    } else if (templateType === 'professional') {
      return baseStyles + `
        .container { padding: 60px; }
        .header { margin-bottom: 50px; border-bottom: 3px solid #dc2626; padding-bottom: 30px; }
        .logo-area { font-size: 32px; }
        .title { font-size: 32px; margin: 40px 0; }
        .client-section { margin-bottom: 50px; }
        th { background: #1f2937; color: white; padding: 15px; border-bottom: 2px solid #dc2626; }
        td { padding: 15px; }
        tr { border-bottom: 1px solid #e5e7eb; }
        .summary-section { background: #f9fafb; padding: 30px; border-radius: 8px; border-left: 4px solid #dc2626; margin: 40px 0; }
        .notes { border-top: 2px solid #e5e7eb; padding-top: 30px; margin-top: 50px; }
        .signature-area { margin-top: 60px; }
      `;
    } else {
      // classic template
      return baseStyles + `
        .container { padding: 40px; }
        .header { margin-bottom: 30px; border-bottom: 3px solid #dc2626; }
        th { background: #f3f4f6; padding: 12px; border-bottom: 2px solid #dc2626; }
        td { border-bottom: 1px solid #ddd; }
        .summary-section { background: #f9fafb; }
        .notes { border-top: 1px solid #e5e7eb; }
      `;
    }
  };

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${quoteLabel} ${data.lavoroTitle}</title>
      <style>
        ${getStyles()}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo-area">📋 ${quoteLabel}</div>
          <div class="company-info">
            <strong>${data.companyName || 'Company'}</strong><br>
            ${data.vatNumber ? `VAT: ${data.vatNumber}<br>` : ''}
            ${data.address ? `${data.address}<br>` : ''}
            ${data.city ? `${data.city}${data.postalCode ? ', ' + data.postalCode : ''}<br>` : ''}
          </div>
        </div>

        <div class="title">${data.lavoroTitle}</div>

        <div class="revision-date">Revision: ${String(data.revision).padStart(2, '0')} | Date: ${new Date().toLocaleDateString()}</div>

        <div class="client-section">
          <div class="client-label">${clientLabel}</div>
          <div class="client-value">${data.clienteName}</div>
          ${data.clienteEmail ? `<div class="client-value">${data.clienteEmail}</div>` : ''}
        </div>

        <table>
          <thead>
            <tr style="border-bottom: 2px solid #dc2626;">
              <th>${descriptionLabel}</th>
              <th style="text-align: center;">${quantityLabel}</th>
              <th style="text-align: right;">${priceLabel}</th>
              <th style="text-align: center;">${taxLabel}%</th>
              <th style="text-align: right;">${subtotalColLabel}</th>
              <th style="text-align: right;">${taxLabelFull}</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="summary-section">
          <div class="summary-row">
            <span class="summary-label">${subtotalLabel}</span>
            <span class="summary-value">${currency}${subtotal.toFixed(2)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">${taxLabelFull}</span>
            <span class="summary-value">${currency}${taxes.toFixed(2)}</span>
          </div>
          <div class="summary-row total-row">
            <span>${totalLabel}</span>
            <span>${currency}${total.toFixed(2)}</span>
          </div>
        </div>

        <div class="notes">
          <strong>Pagamenti / Payment Terms / Paiement:</strong><br>
          ${paymentTerms}
          ${data.iban ? `<br><br><strong>IBAN:</strong> ${data.iban}` : ''}
          ${data.swift ? ` | <strong>SWIFT:</strong> ${data.swift}` : ''}
        </div>

        <div class="signature-area">
          <div class="signature-box">
            <strong>${signatureLabel}</strong>
            <div class="signature-line"></div>
          </div>
          <div class="signature-box">
            <strong>${approvedLabel}</strong>
            <div class="signature-line"></div>
          </div>
        </div>

        <div class="footer">
          Generated: ${new Date().toLocaleString()} | Document Rev: ${data.revision}
        </div>
      </div>
    </body>
    </html>
  `;

  return html;
}
