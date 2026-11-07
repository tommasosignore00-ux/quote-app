import mammoth from 'mammoth';
import { openai } from './openaiServer';
import { generateQuoteHTML, type QuoteData } from './QuoteTemplate';

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
};

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

export async function readTemplateSource(params: {
  buffer: Buffer;
  fileName: string;
}): Promise<TemplateSource> {
  const name = params.fileName.toLowerCase();

  if (name.endsWith('.docx')) {
    const { value } = await mammoth.convertToHtml({ buffer: params.buffer });
    const { html, images } = tokenizeImages(value);
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
  Indirizzo e dati extra del cliente che non hanno un segnaposto: toglili.
- Tabella delle voci: mantieni la tabella originale con TUTTE le sue colonne, nello stesso ordine e con le stesse
  intestazioni e lo stesso stile. Il corpo della tabella deve contenere UNA sola riga modello racchiusa così:
  <tbody>{{#items}}<tr>...una cella per colonna...</tr>{{/items}}</tbody>
  e in ogni cella metti il campo corrispondente alla colonna:
  {{item.index}} numero riga, {{item.code}} codice/articolo, {{item.description}} descrizione,
  {{item.unit}} unità di misura (U.M.), {{item.quantity}} quantità, {{item.price}} prezzo unitario,
  {{item.discount}} sconto %, {{item.vat}} aliquota IVA, {{item.total}} importo/totale riga.
  Se una colonna non corrisponde a nessun campo lascia la cella vuota. Non lasciare nessuna riga dell'esempio.
- Gli importi del documento originale non devono comparire da nessuna parte.
- Metti {{acceptanceLink}} nella zona della firma/accettazione (o in fondo se non c'è): lì il cliente troverà il
  pulsante per accettare online. Lascia comunque lo spazio per timbro e firma se l'originale lo prevede.
Rispondi solo con JSON: {"html": "...", "notes": "<1-2 frasi in italiano su cosa hai riconosciuto o cosa non era chiaro>"}`;

// A quote is a white sheet: without this, browsers and mail apps in dark mode paint
// the background black while the template's text stays dark.
const PAPER_HEAD =
  '<meta name="color-scheme" content="light"><style>html,body{background:#ffffff;color:#111827;}</style>';

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

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_TEMPLATE_MODEL || 'gpt-4o',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  });

  let parsed: { html?: string; notes?: string } = {};
  try {
    parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
  } catch {
    throw new Error('La conversione non è riuscita: riprova.');
  }

  let template = String(parsed.html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(["'])[\s\S]*?\1/gi, '');
  const images = params.source?.images || [];
  images.forEach((dataUrl, index) => {
    template = template.split(IMAGE_TOKEN(index)).join(dataUrl);
  });
  // On a correction round the logo is already inline in the previous template.
  template = template.replace(/__TEMPLATE_IMAGE_\d+__/g, '');
  // Images the AI made up (no real picture behind them) would show as broken icons.
  template = template.replace(/<img\b(?![^>]*\ssrc=(["'])data:image\/)[^>]*>/gi, '');

  if (!template.trim()) {
    throw new Error('La conversione non ha prodotto un template: riprova.');
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
  };
}

/** Sample quote used to preview a template before saving it. */
export function previewTemplate(template: string, companyName?: string | null): string {
  const sample: QuoteData = {
    lavoroTitle: 'Rifacimento impianto bagno',
    clienteName: 'Mario Rossi',
    clienteEmail: 'mario.rossi@example.com',
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
