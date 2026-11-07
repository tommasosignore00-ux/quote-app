import mammoth from 'mammoth';
import JSZip from 'jszip';
import { openai } from './openaiServer';
import {
  generateQuoteHTML,
  sanitizeTemplateMarkup,
  type QuoteData,
} from './QuoteTemplate';

/**
 * Turns the quote a company already uses (Word or HTML) into a quote template:
 * same look, with placeholders where the app puts client, items and totals.
 */

const MAX_SOURCE_CHARS = 60_000;
const MAX_KEPT_IMAGE_CHARS = 700_000;
const IMAGE_TOKEN = (index: number) => `__TEMPLATE_IMAGE_${index}__`;

export type TemplateSource = {
  kind: 'docx' | 'html';
  /** Document content as HTML. */
  content: string;
  /** Embedded images, replaced in `content` by tokens so the AI never sees base64. */
  images: string[];
};

export type TemplateConversion = {
  template: string;
  notes: string;
  missing: string[];
  /** Things the user should check before saving (leftover data, fixed placeholders...). */
  warnings: string[];
};

/** Placeholders the renderer knows; anything else would be printed literally. */
const KNOWN_PLACEHOLDERS = new Set([
  'lavoroTitle',
  'clienteName',
  'clienteEmail',
  'clienteAddress',
  'clienteCity',
  'clientePostalCode',
  'clienteVat',
  'clienteFiscalCode',
  'clientePhone',
  'revision',
  'revisionNumber',
  'companyName',
  'vatNumber',
  'fiscalCode',
  'address',
  'city',
  'postalCode',
  'country',
  'iban',
  'swift',
  'currency',
  'taxLabel',
  'vatPercent',
  'descriptionLabel',
  'quantityLabel',
  'priceLabel',
  'subtotalColLabel',
  'totalLabel',
  'itemsTable',
  'items',
  'subtotal',
  'taxes',
  'total',
  'date',
  'dateTime',
  'acceptanceLink',
  'acceptanceUrl',
  '#items',
  '/items',
  'item.index',
  'item.code',
  'item.description',
  'item.unit',
  'item.quantity',
  'item.price',
  'item.discount',
  'item.vat',
  'item.total',
]);

/** Names the AI sometimes uses instead of the real placeholders. */
const PLACEHOLDER_ALIASES: Record<string, string> = {
  cliente: 'clienteName',
  nomecliente: 'clienteName',
  clientname: 'clienteName',
  customername: 'clienteName',
  clienteemail: 'clienteEmail',
  indirizzocliente: 'clienteAddress',
  clienteindirizzo: 'clienteAddress',
  totale: 'total',
  totaledocumento: 'total',
  imponibile: 'subtotal',
  iva: 'taxes',
  importoiva: 'taxes',
  data: 'date',
  oggetto: 'lavoroTitle',
  titolo: 'lavoroTitle',
  aliquotaiva: 'vatPercent',
  ivapercent: 'vatPercent',
  'item.descrizione': 'item.description',
  'item.quantita': 'item.quantity',
  'item.qty': 'item.quantity',
  'item.prezzo': 'item.price',
  'item.importo': 'item.total',
  'item.totale': 'item.total',
  'item.codice': 'item.code',
  'item.um': 'item.unit',
  'item.sconto': 'item.discount',
  'item.iva': 'item.vat',
};

/** Fixes known misspelt placeholders and drops unknown ones, reporting both. */
function normalizePlaceholders(html: string, warnings: string[]): string {
  const unknown = new Set<string>();
  const out = html.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, rawName: string) => {
    const name = rawName.trim();
    if (KNOWN_PLACEHOLDERS.has(name)) return `{{${name}}}`;
    const alias = PLACEHOLDER_ALIASES[name.toLowerCase().replace(/[\s_-]/g, '')];
    if (alias) return `{{${alias}}}`;
    unknown.add(name);
    return '';
  });
  if (unknown.size) {
    warnings.push(
      `Ho tolto dei campi che l'app non sa riempire: ${Array.from(unknown).slice(0, 5).join(', ')}.`
    );
  }
  return out;
}

/** Amounts of the original quote still written in the template (they would repeat on every quote). */
function leftoverAmounts(sourceContent: string, template: string): string[] {
  const amounts = new Set(sourceContent.match(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g) || []);
  const templateText = template.replace(/<[^>]+>/g, ' ');
  return Array.from(amounts).filter(
    (amount) => amount !== '0,00' && templateText.includes(amount)
  );
}

/** Placeholders a quote template cannot do without. */
const REQUIRED_PLACEHOLDERS: Array<{ label: string; test: (html: string) => boolean }> = [
  {
    label: 'voci del preventivo ({{#items}}…{{/items}}, {{items}} o {{itemsTable}})',
    test: (h) =>
      /\{\{#items\}\}[\s\S]*\{\{\/items\}\}|\{\{\s*(items|itemsTable)\s*\}\}/.test(h),
  },
  { label: 'totale ({{total}})', test: (h) => /\{\{\s*total\s*\}\}/.test(h) },
  {
    label: 'nome del cliente ({{clienteName}})',
    test: (h) => /\{\{\s*clienteName\s*\}\}/.test(h),
  },
];

export function missingTemplatePlaceholders(html: string): string[] {
  return REQUIRED_PLACEHOLDERS.filter((item) => !item.test(html)).map(
    (item) => item.label
  );
}

function tokenizeImages(html: string): { html: string; images: string[] } {
  const images: string[] = [];
  let kept = 0;
  const out = html.replace(
    /src=(["'])(data:image\/[^"']+)\1/gi,
    (_match, quote: string, dataUrl: string) => {
      // Keep the first images (logos) up to a size budget; drop decorative bulk.
      if (kept + dataUrl.length > MAX_KEPT_IMAGE_CHARS) return `src=${quote}${quote}`;
      kept += dataUrl.length;
      images.push(dataUrl);
      return `src=${quote}${IMAGE_TOKEN(images.length - 1)}${quote}`;
    }
  );
  return { html: out, images };
}

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

function xmlText(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function htmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Paragraph texts of a WordprocessingML part. */
function wordParagraphs(xml: string): string[] {
  return (xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [])
    .map((paragraph) =>
      (paragraph.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || [])
        .map((run) => xmlText(run.replace(/<[^>]+>/g, '')))
        .join('')
        .trim()
    )
    .filter(Boolean);
}

function topValues(values: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value]) => value);
}

/**
 * What mammoth leaves out of a Word file: page header and footer (often the
 * letterhead with logo, company data and IBAN) and the colours/fonts used, so the
 * AI can reproduce the look instead of guessing it.
 */
async function readDocxExtras(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const headerHtml: string[] = [];
  const footerHtml: string[] = [];
  const images: string[] = [];
  const xmlParts: string[] = [];

  const partNames = Object.keys(zip.files)
    .filter((name) => /^word\/(header|footer)\d*\.xml$/.test(name))
    .sort();

  for (const name of partNames) {
    const xml = await zip.file(name)!.async('string');
    xmlParts.push(xml);
    const isHeader = name.includes('header');
    const html: string[] = [];

    // Pictures referenced by the part (r:embed ids resolved through its .rels).
    const relsFile = zip.file(name.replace('word/', 'word/_rels/') + '.rels');
    const rels = relsFile ? await relsFile.async('string') : '';
    for (const match of xml.matchAll(/r:embed="([^"]+)"/g)) {
      const target = new RegExp(`Id="${match[1]}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
      const file = target ? zip.file(`word/${target.replace(/^\.\.\//, '')}`) : null;
      const ext = target?.split('.').pop()?.toLowerCase() || '';
      if (!file || !IMAGE_MIME[ext]) continue;
      const data = await file.async('base64');
      images.push(`data:${IMAGE_MIME[ext]};base64,${data}`);
      html.push(`<img src="__DOCX_IMAGE_${images.length - 1}__">`);
    }
    for (const text of wordParagraphs(xml)) html.push(`<p>${htmlText(text)}</p>`);
    (isHeader ? headerHtml : footerHtml).push(...html);
  }

  const documentXml = (await zip.file('word/document.xml')?.async('string')) || '';
  xmlParts.push(documentXml);
  const allXml = xmlParts.join('');
  const colors = topValues(
    [
      ...Array.from(allXml.matchAll(/<w:color w:val="([0-9A-Fa-f]{6})"/g), (m) =>
        m[1].toUpperCase()
      ),
      ...Array.from(allXml.matchAll(/<w:shd [^>]*w:fill="([0-9A-Fa-f]{6})"/g), (m) =>
        m[1].toUpperCase()
      ),
    ].filter((color) => color !== '000000' && color !== 'FFFFFF'),
    6
  ).map((color) => `#${color}`);
  const fonts = topValues(
    Array.from(allXml.matchAll(/w:ascii="([^"]+)"/g), (m) => m[1]),
    3
  );

  return {
    headerHtml: headerHtml.join(''),
    footerHtml: footerHtml.join(''),
    images,
    colors,
    fonts,
  };
}

export async function readTemplateSource(params: {
  buffer: Buffer;
  fileName: string;
}): Promise<TemplateSource> {
  const name = params.fileName.toLowerCase();

  if (name.endsWith('.docx')) {
    const { value } = await mammoth.convertToHtml({ buffer: params.buffer });
    const extras = await readDocxExtras(params.buffer).catch(() => null);
    let body = value;
    if (extras) {
      // Header/footer pictures (usually the logo) go through the same image tokens.
      const withImages = (html: string) =>
        html.replace(
          /__DOCX_IMAGE_(\d+)__/g,
          (_m, index: string) => extras.images[Number(index)] || ''
        );
      const style = [
        extras.colors.length
          ? `Colori usati nel documento: ${extras.colors.join(', ')}.`
          : '',
        extras.fonts.length ? `Caratteri: ${extras.fonts.join(', ')}.` : '',
      ]
        .filter(Boolean)
        .join(' ');
      body =
        (style ? `<!-- ${style} -->` : '') +
        (extras.headerHtml
          ? `<header data-word="intestazione di pagina">${withImages(extras.headerHtml)}</header>`
          : '') +
        value +
        (extras.footerHtml
          ? `<footer data-word="piè di pagina">${withImages(extras.footerHtml)}</footer>`
          : '');
    }
    const { html, images } = tokenizeImages(body);
    return {
      kind: 'docx',
      content: html.slice(0, MAX_SOURCE_CHARS),
      images,
    };
  }

  if (name.endsWith('.html') || name.endsWith('.htm')) {
    const raw = params.buffer
      .toString('utf-8')
      .replace(/<script[\s\S]*?<\/script>/gi, '');
    const { html, images } = tokenizeImages(raw);
    return {
      kind: 'html',
      content: html.slice(0, MAX_SOURCE_CHARS),
      images,
    };
  }

  throw new Error('Formato non supportato: carica il preventivo in Word (.docx) o HTML.');
}

const SYSTEM_PROMPT = `Sei un esperto di impaginazione di preventivi per artigiani e imprese italiane.
Ricevi un preventivo già compilato di un'azienda e devi trasformarlo in un TEMPLATE HTML riutilizzabile,
identico nell'aspetto all'originale (intestazione, colori, allineamenti, tabelle, riquadri, piè di pagina).

Regole:
- HTML completo (<!DOCTYPE html>...), con CSS in un <style> nell'head, formato A4 stampabile, font di sistema.
- Niente JavaScript, niente risorse esterne. Le immagini con src "__TEMPLATE_IMAGE_N__" vanno mantenute dove sono (sono il logo).
- I dati DELL'AZIENDA che emette il preventivo (nome, indirizzo, P.IVA, telefono, email, IBAN, condizioni di pagamento,
  validità, note fisse) restano scritti come nel documento: sono la sua carta intestata.
- I dati che cambiano a ogni preventivo vanno sostituiti con questi segnaposto esatti:
  {{clienteName}} nome del cliente, {{clienteEmail}} email del cliente (se presente nel documento),
  {{lavoroTitle}} oggetto/descrizione del lavoro, {{date}} data, {{revision}} numero di revisione,
  {{subtotal}} imponibile, {{taxLabel}} nome dell'imposta (es. IVA), {{taxes}} importo IVA, {{total}} totale.
  Questi importi includono già il simbolo della valuta: non scrivere € accanto ai segnaposto.
  Altri dati del cliente: {{clienteAddress}} indirizzo, {{clientePostalCode}} CAP, {{clienteCity}} città,
  {{clienteVat}} partita IVA, {{clienteFiscalCode}} codice fiscale, {{clientePhone}} telefono.
  Aliquota: {{vatPercent}} (es. "IVA {{vatPercent}}" invece di "IVA 22%").
  Usa SOLO i segnaposto elencati qui, scritti esattamente così.
  I dati del cliente diversi dal nome possono mancare: racchiudi ognuno, con la sua etichetta e punteggiatura,
  in un elemento con data-if, es. <span data-if="clienteVat"> - P.IVA {{clienteVat}}</span>
  o <div data-if="clienteAddress">{{clienteAddress}}</div>: se il dato manca l'app nasconde l'elemento.
- Tabella delle voci: mantieni la tabella originale con TUTTE le sue colonne, nello stesso ordine e con le stesse
  intestazioni e lo stesso stile. Il corpo della tabella deve contenere UNA sola riga modello racchiusa così:
  <tbody>{{#items}}<tr>...una cella per colonna...</tr>{{/items}}</tbody>
  e in ogni cella metti il campo corrispondente alla colonna:
  {{item.index}} numero riga, {{item.code}} codice/articolo, {{item.description}} descrizione,
  {{item.unit}} unità di misura (U.M.), {{item.quantity}} quantità, {{item.price}} prezzo unitario,
  {{item.discount}} sconto %, {{item.vat}} aliquota IVA, {{item.total}} importo/totale riga.
  Se una colonna non corrisponde a nessun campo lascia la cella vuota. Non lasciare nessuna riga dell'esempio.
- Gli importi del documento originale non devono comparire da nessuna parte.
- Colonne o righe interne all'azienda (ricarico, margine, costo o prezzo d'acquisto) vanno tolte del tutto:
  intestazione e celle, così le colonne restano allineate.
- Se ci sono <header data-word="intestazione di pagina"> e <footer data-word="piè di pagina">, sono la carta
  intestata di Word (logo, ragione sociale, contatti, IBAN): riproducili in cima e in fondo alla pagina.
  Un commento con "Colori usati nel documento" e "Caratteri" indica colori e font da usare.
- Metti {{acceptanceLink}} nella zona della firma/accettazione (o in fondo se non c'è): lì il cliente troverà il
  pulsante per accettare online. Lascia comunque lo spazio per timbro e firma se l'originale lo prevede.
Rispondi solo con JSON: {"html": "...", "notes": "<1-2 frasi in italiano su cosa hai riconosciuto o cosa non era chiaro>"}`;

// A quote is a white sheet: without this, browsers and mail apps in dark mode paint
// the background black while the template's text stays dark.
// The charset too: without it some viewers show "â‚¬" instead of "€".
const PAPER_HEAD =
  '<meta charset="utf-8"><meta name="color-scheme" content="light"><style>html,body{background:#ffffff;color:#111827;}</style>';

function forcePaperColors(html: string): string {
  if (html.includes('name="color-scheme"')) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (head) => `${head}${PAPER_HEAD}`);
  }
  return `${PAPER_HEAD}${html}`;
}

export async function convertToTemplate(params: {
  source?: TemplateSource;
  previousTemplate?: string;
  instructions?: string;
}): Promise<TemplateConversion> {
  const userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail: 'high' } }
  > = [];

  if (params.previousTemplate) {
    userContent.push({
      type: 'text',
      text:
        'Questo è il template già convertito. Applica SOLO la correzione richiesta, lasciando invariato il resto ' +
        `e rispettando sempre le regole.\n\nCorrezione richiesta: ${params.instructions || '(nessuna)'}\n\nTEMPLATE:\n` +
        params.previousTemplate.slice(0, MAX_SOURCE_CHARS),
    });
  } else if (params.source) {
    userContent.push({
      type: 'text',
      text:
        `Documento originale (${params.source.kind.toUpperCase()}):\n` +
        params.source.content +
        (params.instructions
          ? `\n\nIndicazioni dell'utente: ${params.instructions}`
          : ''),
    });
  } else {
    throw new Error('Niente da convertire');
  }

  // Now and then the model loops (e.g. repeating CSS) until the token limit: the limit
  // is kept low enough to stop that fast, and one retry usually gets a clean answer.
  let parsed: { html?: string; notes?: string } = {};
  let lastProblem = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_TEMPLATE_MODEL || 'gpt-4o',
      temperature: attempt === 0 ? 0.1 : 0,
      max_tokens: 9000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    });
    const choice = completion.choices[0];
    if (choice?.finish_reason === 'length') {
      lastProblem = 'length';
      continue;
    }
    try {
      parsed = JSON.parse(choice?.message?.content || '{}');
      if (String(parsed.html || '').trim()) {
        lastProblem = '';
        break;
      }
      lastProblem = 'empty';
    } catch {
      lastProblem = 'json';
    }
  }
  if (lastProblem === 'length') {
    throw new Error(
      'Il preventivo è troppo lungo o complesso per essere convertito: prova con una versione con una sola pagina di voci.'
    );
  }
  if (lastProblem) throw new Error('La conversione non è riuscita: riprova.');

  let template = String(parsed.html || '');
  const images = params.source?.images || [];
  images.forEach((dataUrl, index) => {
    template = template.split(IMAGE_TOKEN(index)).join(dataUrl);
  });
  // Tokens left over (e.g. on a correction round, where the logo is already inline).
  template = template.replace(/__TEMPLATE_IMAGE_\d+__/g, '');
  template = sanitizeTemplateMarkup(template);
  // Only real pictures survive: the document's own (inline) or ones already hosted by
  // the app. Images the AI made up (logo.png, example.com...) would show as broken.
  const hostedPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}/storage/v1/object/public/`;
  template = template.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /\ssrc=(["'])([^"']*)\1/i.exec(tag)?.[2] || '';
    const real =
      src.startsWith('data:image/') ||
      (hostedPrefix.length > 30 && src.startsWith(hostedPrefix));
    return real ? tag : '';
  });

  if (!template.trim()) {
    throw new Error('La conversione non ha prodotto un template: riprova.');
  }
  const warnings: string[] = [];
  template = normalizePlaceholders(template, warnings);
  if (params.source) {
    const leftovers = leftoverAmounts(params.source.content, template);
    if (leftovers.length) {
      warnings.push(
        `Nel modello sono rimasti importi del preventivo originale (${leftovers.slice(0, 4).join(', ')}): chiedi di toglierli con "Correggi".`
      );
    }
  }
  // Amount placeholders already carry the currency symbol ("€ 1.930,00").
  template = template
    .replace(/(?:€|EUR|&euro;)\s*(\{\{\s*(?:subtotal|taxes|total)\s*\}\})/gi, '$1')
    .replace(/(\{\{\s*(?:subtotal|taxes|total)\s*\}\})\s*(?:€|EUR|&euro;)/gi, '$1');
  template = forcePaperColors(template);
  return {
    template,
    notes: String(parsed.notes || '').slice(0, 500),
    missing: missingTemplatePlaceholders(template),
    warnings,
  };
}

/** Sample quote used to preview a template before saving it. */
export function previewTemplate(template: string, companyName?: string | null): string {
  const sample: QuoteData = {
    lavoroTitle: 'Rifacimento impianto bagno',
    clienteName: 'Mario Rossi',
    clienteEmail: 'mario.rossi@example.com',
    clienteAddress: 'Via Roma 1',
    clientePostalCode: '20100',
    clienteCity: 'Milano',
    clienteFiscalCode: 'RSSMRA80A01F205X',
    revision: 1,
    // Code, unit and discount filled in, so extra columns show up in the preview.
    items: [
      {
        description: 'Fornitura e posa piatto doccia 80x120',
        quantity: 1,
        unit_price: 420,
        code: 'PD8012',
        unit: 'pz',
      },
      {
        description: 'Rifacimento impianto idrico',
        quantity: 1,
        unit_price: 950,
        code: 'IMP-ID',
        unit: 'a corpo',
      },
      {
        description: 'Manodopera',
        quantity: 16,
        unit_price: 35,
        unit: 'h',
        discount_percent: 10,
      },
    ],
    vat_percent: 10,
    companyName: companyName || 'La tua azienda',
    countryCode: 'IT',
    templateType: 'custom',
    customTemplateHtml: template,
  };
  return generateQuoteHTML(sample);
}
