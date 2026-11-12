/**
 * The standard Mastrovoce quote (any built-in template type). The same file lives in
 * mobile/lib and web/lib: keep the two copies identical.
 * Every text value must already be HTML-escaped by the caller.
 */

export type StandardQuoteLine = {
  description: string;
  quantity: number;
  unit?: string | null;
  /** Unit price the client pays, markup included, before the line discount. */
  unitPrice: number;
  discountPercent?: number | null;
};

export type StandardQuoteInput = {
  appName: string;
  locale: string;
  currencySymbol: string;
  brandColor?: string | null;
  logoUrl?: string;
  companyName?: string;
  companyDetails: string[];
  quoteLabel: string;
  title: string;
  revision: number;
  dateText: string;
  clientName: string;
  clientDetails: string[];
  lines: StandardQuoteLine[];
  vatPercent: number;
  taxLabel: string;
  reverseCharge?: string | null;
  paymentTerms?: string;
  iban?: string;
  swift?: string;
};

const INK = '#0f172a';
const MUTED = '#57534e';
const RULE = '#d6d3d1';

function initials(name: string): string {
  const words = name
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .split(/\s+/)
    .filter((word) => /^[A-Za-zÀ-ÿ]/.test(word) && !/^(s\.?r\.?l\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|s\.?p\.?a\.?|di|e|&)$/i.test(word));
  return (words[0]?.[0] || '') + (words[1]?.[0] || '') || '·';
}

export function renderStandardQuote(input: StandardQuoteInput): string {
  const { locale, currencySymbol: cur } = input;
  const accent = /^#[0-9a-f]{6}$/i.test(input.brandColor || '') ? input.brandColor! : INK;
  const money = (value: number) =>
    `${(Number(value) || 0).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: 'always',
    } as Intl.NumberFormatOptions)}&nbsp;${cur}`;
  const qty = (value: number) =>
    (Number(value) || 0).toLocaleString(locale, { maximumFractionDigits: 2 });

  let imponibile = 0;
  const rows = input.lines
    .map((line) => {
      const discount = Number(line.discountPercent) || 0;
      const amount = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) * (1 - discount / 100);
      imponibile += amount;
      const unit = String(line.unit || '').trim();
      const lumpSum = /^a\s*corpo$/i.test(unit);
      const quantity = lumpSum ? 'a corpo' : `${qty(line.quantity)}${unit ? `&nbsp;${unit}` : ''}`;
      return `
        <tr>
          <td class="desc">${line.description}${discount ? `<div class="note">sconto ${qty(discount)}%</div>` : ''}</td>
          <td class="num">${quantity}</td>
          <td class="num unit-col">${money(line.unitPrice)}</td>
          <td class="num">${money(amount)}</td>
        </tr>`;
    })
    .join('');

  const vat = input.reverseCharge ? 0 : imponibile * (Number(input.vatPercent) / 100);
  const total = imponibile + vat;
  const vatRow = input.reverseCharge
    ? `<tr><td>${input.reverseCharge}</td><td class="num">${money(0)}</td></tr>`
    : `<tr><td>${input.taxLabel} ${qty(input.vatPercent)}%</td><td class="num">${money(vat)}</td></tr>`;

  const company = input.companyName || '';
  const mark = input.logoUrl
    ? `<img class="logo" src="${input.logoUrl}" alt="">`
    : `<div class="initials" style="border-color:${accent};color:${accent}">${initials(company).toUpperCase()}</div>`;

  const payment = [
    input.paymentTerms ? `<p><strong>Pagamento:</strong> ${input.paymentTerms}</p>` : '',
    input.iban ? `<p><strong>IBAN:</strong> ${input.iban}${input.swift ? ` · <strong>SWIFT:</strong> ${input.swift}` : ''}</p>` : '',
  ].join('');

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${input.quoteLabel} ${input.title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: ${INK}; font-family: 'Source Sans 3', 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { max-width: 820px; margin: 0 auto; padding: 28px 24px 32px; }
  .head { display: flex; align-items: center; gap: 16px; }
  .initials { width: 56px; height: 56px; border: 2.5px solid ${INK}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 20px; flex: none; }
  .logo { max-height: 64px; max-width: 200px; object-fit: contain; flex: none; }
  .company { font-size: 22px; font-weight: 700; line-height: 1.2; }
  .details { color: ${MUTED}; font-size: 13.5px; margin-top: 12px; }
  .rule { border: 0; border-top: 1.5px solid ${INK}; margin: 18px 0; }
  .ref { font-weight: 700; font-size: 16px; }
  .client { margin-top: 2px; }
  .client-details { color: ${MUTED}; font-size: 13.5px; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 22px; font-variant-numeric: tabular-nums; }
  table.lines th { text-align: left; font-weight: 700; padding: 8px 6px; border-bottom: 1.5px solid ${INK}; white-space: nowrap; }
  table.lines td { padding: 10px 6px; border-bottom: 1px solid ${RULE}; vertical-align: top; }
  table.lines .num { text-align: right; white-space: nowrap; }
  table.lines th.num { text-align: right; }
  .desc { width: 100%; }
  .note { color: ${MUTED}; font-size: 13px; }
  .totals { margin: 22px 0 0 auto; width: min(100%, 340px); border-collapse: collapse; font-variant-numeric: tabular-nums; }
  .totals td { padding: 6px 0; }
  .totals .num { text-align: right; white-space: nowrap; }
  .totals tr.total td { border-top: 2px solid ${INK}; padding-top: 10px; font-weight: 700; font-size: 19px; }
  .terms { margin-top: 26px; color: ${MUTED}; font-size: 13.5px; }
  .terms p { margin: 4px 0; }
  .sign { margin-top: 34px; display: flex; justify-content: flex-end; }
  .sign div { width: 240px; border-top: 1px solid ${INK}; padding-top: 6px; font-size: 13px; color: ${MUTED}; text-align: center; }
  .foot { margin-top: 28px; color: #a8a29e; font-size: 12px; text-align: center; }
  @media (max-width: 560px) {
    .sheet { padding: 20px 14px; }
    .company { font-size: 19px; }
    table.lines th, table.lines td { padding-left: 3px; padding-right: 3px; }
    table.lines .unit-col { display: none; }
  }
</style>
</head>
<body>
<div class="sheet">
  <div class="head">
    ${mark}
    <div class="company">${company}</div>
  </div>
  ${input.companyDetails.length ? `<div class="details">${input.companyDetails.join(' · ')}</div>` : ''}
  <hr class="rule">
  <div class="ref">${input.quoteLabel} · ${input.title} · Rev. ${String(input.revision).padStart(2, '0')} · ${input.dateText}</div>
  <div class="client">Cliente: ${input.clientName}</div>
  ${input.clientDetails.length ? `<div class="client-details">${input.clientDetails.join(' · ')}</div>` : ''}

  <table class="lines">
    <thead>
      <tr>
        <th>Descrizione</th>
        <th class="num">Q.tà</th>
        <th class="num unit-col">Prezzo unit.</th>
        <th class="num">Importo</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="totals">
    <tr><td>TOTALE IMPONIBILE</td><td class="num">${money(imponibile)}</td></tr>
    ${vatRow}
    <tr class="total"><td>TOTALE</td><td class="num">${money(total)}</td></tr>
  </table>

  ${payment ? `<div class="terms">${payment}</div>` : ''}
  <div class="sign"><div>Data e firma per accettazione</div></div>
  <div class="foot">Preventivo preparato con ${input.appName}</div>
</div>
</body>
</html>`;
}
