import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import OpenAI from 'openai';
import { supabaseAdmin } from './supabase-server';
import * as XLSX from 'xlsx';
import {
  type UniversalImportResult,
  type UniversalParsedItem,
  mergeUniversalImportResults,
  parseUniversalCsvText,
  parseUniversalPdfText,
  parseUniversalSpreadsheetRows,
} from './listinoUniversalImport';
import { type PricingDiagnostics, resolveImportPricing } from './listinoPricing';
import { uploadListinoSource, type ListinoSourceMetadata } from './listinoSourceStorage';
import { scheduleEmbeddingsForListino } from './bulkGenerateEmbeddings';
import { saveListinoItems, type ListinoChanges } from './listinoItemsStore';
import {
  LISTINO_PARSER_VERSION,
  applyCanonicalGroups,
  applyGroupPricesToListino,
  canonicalizeGroupNames,
  isPricelessCatalogue,
  syncPricingGroups,
} from './listinoPricingGroups';

const supabase = supabaseAdmin;
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const PDF_OCR_MAX_PAGES = 12;
const PDF_OCR_BATCH_SIZE = 2;
const PDF_OCR_SCREENSHOT_WIDTH = 1600;

export type ProcessListinoImportResult = {
  ok: boolean;
  status: number;
  error?: string;
  inserted?: number;
  updated?: number;
  duplicatesSkipped?: number;
  changes?: ListinoChanges;
  /** Catalogue without prices: shapes in the "Prezzi per forma" section. */
  pricingGroups?: number;
  pendingPricingGroups?: number;
  warning?: string;
  listinoId?: string | null;
  summary?: UniversalImportResult['summary'];
  sourceDiagnostics?: Array<Record<string, unknown>>;
  pricingDiagnostics?: PricingDiagnostics;
  sourceStored?: boolean;
  aiFeedback?: string | null;
  sourceInfo?: { fileName: string; mimeType: string; uploadedAt: string } | null;
  /** Server-side only: the metadata just written, so callers don't re-read it from
   *  Storage (its CDN can serve the previous version for a while). */
  storedSource?: ListinoSourceMetadata;
};

export type ProcessListinoImportParams = {
  profileId: string;
  listinoId?: string | null;
  listinoName?: string | null;
  originalFileName?: string | null;
  uploadedFileName: string;
  uploadedFileType: string;
  arrayBuffer: ArrayBuffer;
  sourceOnly?: boolean;
};

let pdfParseCtorPromise: Promise<any> | null = null;
let pdfScreenshotPolyfillsPromise: Promise<void> | null = null;

async function extractPdfText(buffer: Buffer) {
  const PDFParse = await getPdfParseCtor();
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return result.text || '';
  } finally {
    await parser.destroy();
  }
}

function runPdfSubprocess(
  scriptName: 'extract-pdf-text.cjs' | 'render-pdf-pages.cjs',
  args: string[],
  inputBuffer?: Buffer
): Promise<{
  ok: boolean;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve) => {
    let settled = false;
    const resolveOnce = (value: { ok: boolean; stdout: string; stderr: string }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const scriptPath = path.resolve(process.cwd(), 'scripts', scriptName);
      fs.access(scriptPath, fs.constants.F_OK).then(
        () => {
          try {
            const child = spawn(process.execPath, [scriptPath, ...args], {
              stdio: inputBuffer ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
            });

            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (chunk) => {
              stdout += String(chunk || '');
            });
            child.stderr?.on('data', (chunk) => {
              stderr += String(chunk || '');
            });

            child.on('error', (err) => {
              resolveOnce({
                ok: false,
                stdout: '',
                stderr: err?.message || 'spawn failed',
              });
            });
            child.on('close', (code, signal) => {
              resolveOnce({
                ok: code === 0 && !signal,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
              });
            });

            if (inputBuffer && child.stdin) {
              child.stdin.on('error', () => {});
              child.stdin.end(inputBuffer);
            }
          } catch (err) {
            resolveOnce({
              ok: false,
              stdout: '',
              stderr: (err as Error)?.message || String(err),
            });
          }
        },
        () => {
          resolveOnce({
            ok: false,
            stdout: '',
            stderr: `Script ${scriptName} non trovato`,
          });
        }
      );
    } catch (err) {
      resolveOnce({
        ok: false,
        stdout: '',
        stderr: (err as Error)?.message || String(err),
      });
    }
  });
}

function tryParseStderrError(stderrRaw: string): string | null {
  if (!stderrRaw) return null;
  try {
    const parsed = JSON.parse(stderrRaw) as { error?: string };
    if (parsed && typeof parsed.error === 'string' && parsed.error) return parsed.error;
  } catch {}
  return stderrRaw || null;
}

async function extractPdfTextWithFallback(buffer: Buffer): Promise<{
  text: string;
  method: 'inline' | 'subprocess' | 'empty';
  error?: string;
}> {
  let inlineFailureError: unknown = null;
  let inlineProducedEmpty = false;

  try {
    const text = await extractPdfText(buffer);
    if (text.trim()) {
      return { text, method: 'inline' };
    }
    inlineProducedEmpty = true;
  } catch (inlineError) {
    // Any in-process failure (worker setup, bundler/runtime quirks, malformed PDF)
    // falls back to the standalone extractor instead of giving up on the file.
    inlineFailureError = inlineError;
  }

  if (inlineFailureError || inlineProducedEmpty) {
    try {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-extract-'));
      const tmpFile = path.join(tmpDir, 'source.pdf');
      await fs.writeFile(tmpFile, buffer);

      const result = await runPdfSubprocess('extract-pdf-text.cjs', [tmpFile]);

      void fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

      const structuredStderr = tryParseStderrError(result.stderr);

      if (result.ok && result.stdout) {
        let parsed: { text?: string } = {};
        try {
          parsed = JSON.parse(result.stdout) as { text?: string };
        } catch {
          parsed = { text: result.stdout };
        }
        const fallbackText = String(parsed.text || '').trim();
        if (fallbackText) {
          return { text: fallbackText, method: 'subprocess' };
        }
      }
      return {
        text: '',
        method: 'empty',
        error: inlineFailureError
          ? (inlineFailureError as Error)?.message || structuredStderr || 'extract failed'
          : inlineProducedEmpty && !result.ok
            ? structuredStderr || 'subprocess extract failed'
            : structuredStderr || undefined,
      };
    } catch {
      return {
        text: '',
        method: 'empty',
        error: inlineFailureError
          ? (inlineFailureError as Error)?.message || 'extract failed'
          : undefined,
      };
    }
  }

  return { text: '', method: 'empty' };
}

async function ensurePdfScreenshotPolyfills() {
  if (!pdfScreenshotPolyfillsPromise) {
    pdfScreenshotPolyfillsPromise = import('@napi-rs/canvas').then((canvasModule) => {
      const globals = globalThis as Record<string, unknown>;

      if (!globals.DOMMatrix && canvasModule.DOMMatrix) {
        globals.DOMMatrix = canvasModule.DOMMatrix as unknown;
      }
      if (!globals.ImageData && canvasModule.ImageData) {
        globals.ImageData = canvasModule.ImageData as unknown;
      }
      if (!globals.Path2D && canvasModule.Path2D) {
        globals.Path2D = canvasModule.Path2D as unknown;
      }
    });
  }

  await pdfScreenshotPolyfillsPromise;
}

async function renderPdfPages(params: { buffer: Buffer; maxPages?: number }) {
  await ensurePdfScreenshotPolyfills();
  const PDFParse = await getPdfParseCtor();
  const parser = new PDFParse({ data: params.buffer });

  try {
    const result = await parser.getScreenshot({
      imageDataUrl: false,
      imageBuffer: true,
      first:
        Number.isFinite(params.maxPages) && (params.maxPages || 0) > 0
          ? params.maxPages
          : PDF_OCR_MAX_PAGES,
      desiredWidth: PDF_OCR_SCREENSHOT_WIDTH,
    });

    const images = [] as Array<{ pageNumber: number; dataUrl: string }>;
    for (const page of result.pages || []) {
      const pageBuffer = Buffer.isBuffer(page.data) ? page.data : Buffer.from(page.data);
      images.push({
        pageNumber: Number(page.pageNumber || images.length + 1),
        dataUrl: `data:image/png;base64,${pageBuffer.toString('base64')}`,
      });
    }

    return {
      totalPages: result.total || images.length,
      renderedPages: images.length,
      images,
    };
  } finally {
    await parser.destroy();
  }
}

async function getPdfParseCtor() {
  if (!pdfParseCtorPromise) {
    pdfParseCtorPromise = import('pdf-parse').then((module) => {
      const ctor =
        (module as any).PDFParse ||
        (module as any).default?.PDFParse ||
        (module as any).default;
      if (!ctor) {
        throw new Error('pdf-parse non esporta PDFParse');
      }
      return ctor;
    });
  }

  return pdfParseCtorPromise;
}

function chunkArray<T>(items: T[], size: number): Array<T[]> {
  const chunks: Array<T[]> = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function ocrPdfImages(params: {
  fileName: string;
  images: Array<{ pageNumber: number; dataUrl: string }>;
}) {
  if (!openai) {
    throw new Error('OCR automatico non disponibile: manca OPENAI_API_KEY.');
  }

  const chunks = chunkArray(params.images, PDF_OCR_BATCH_SIZE);
  const texts: string[] = [];

  for (const chunk of chunks) {
    const userContent: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string; detail: 'high' } }
    > = [
      {
        type: 'text',
        text:
          `Queste immagini arrivano dal PDF "${params.fileName}" e rappresentano un listino, prezzario o prontuario tecnico.\n` +
          'Fai OCR e restituisci solo testo utile all import dei materiali:\n' +
          '- una voce per riga quando possibile\n' +
          '- mantieni codici, descrizioni, unita, misure, peso e prezzi\n' +
          '- ignora loghi, foto decorative, note legali, numeri pagina e testo puramente grafico\n' +
          '- non usare markdown\n' +
          '- non spiegare nulla\n' +
          '- restituisci solo testo puro',
      },
    ];

    for (const image of chunk) {
      userContent.push({ type: 'text', text: `Pagina ${image.pageNumber}` });
      userContent.push({
        type: 'image_url',
        image_url: {
          url: image.dataUrl,
          detail: 'high',
        },
      });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_AGENT_MODEL || 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 4000,
      messages: [
        {
          role: 'system',
          content:
            'Sei un OCR specializzato in listini tecnici. Devi trascrivere il contenuto delle immagini in testo leggibile e importabile, mantenendo i dati numerici accurati.',
        },
        {
          role: 'user',
          content: userContent,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim() || '';
    if (text) texts.push(text);
  }

  return texts.join('\n');
}

type SourceAnalysis = {
  sourceName: string;
  parsed: ReturnType<typeof parseUniversalSpreadsheetRows>;
  score: number;
  selected: boolean;
  reason?: string;
};

const PRICE_HINTS = [
  'prezzo',
  'price',
  'costo',
  'cost',
  'importo',
  'amount',
  'listino',
  'eur',
  '€',
  'precio',
  'prix',
  'preis',
  'cena',
];

const DESCRIPTION_HINTS = [
  'descrizione',
  'description',
  'articolo',
  'materiale',
  'prodotto',
  'voce',
  'item',
  'desc',
];

function normalizeCell(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function analyzeRowsForImport(rows: unknown[][], sourceName: string): SourceAnalysis {
  const parsed = parseUniversalSpreadsheetRows(rows);
  const probeRows = rows.slice(0, 20);
  const probeCells = probeRows.flat().map(normalizeCell).filter(Boolean);
  const hasPriceSignal = probeCells.some((cell) =>
    PRICE_HINTS.some((hint) => cell.includes(hint))
  );
  const hasDescriptionSignal = probeCells.some((cell) =>
    DESCRIPTION_HINTS.some((hint) => cell.includes(hint))
  );

  let numericCells = 0;
  let textCells = 0;
  for (const row of rows.slice(0, 40)) {
    for (const cell of row) {
      const text = String(cell ?? '').trim();
      if (!text) continue;
      const normalized = text.replace(/\s/g, '');
      if (/^-?[0-9]+(?:[.,][0-9]+)?$/.test(normalized)) {
        numericCells++;
      } else {
        textCells++;
      }
    }
  }

  const numericHeavy = numericCells > Math.max(textCells * 1.4, 10);
  const score =
    parsed.summary.parsedRows * 4 +
    (hasPriceSignal ? 24 : 0) +
    (hasDescriptionSignal ? 10 : 0) +
    (parsed.summary.unitDetectedRows > 0 ? 6 : 0) +
    (parsed.summary.normalizedPriceRows > 0 ? 4 : 0) -
    (!hasPriceSignal ? 8 : 0) -
    (numericHeavy && !hasPriceSignal ? 18 : 0) -
    (parsed.summary.parsedRows === 0 ? 30 : 0);

  const selected =
    parsed.items.length > 0 &&
    (hasPriceSignal || score >= 18) &&
    !(numericHeavy && !hasPriceSignal && parsed.summary.parsedRows < 8);

  let reason: string | undefined;
  if (!parsed.items.length) {
    reason = 'nessuna voce valida trovata';
  } else if (numericHeavy && !hasPriceSignal && !selected) {
    reason = 'sembra piu una scheda tecnica che un listino';
  } else if (!hasPriceSignal && !selected) {
    reason = 'manca un segnale prezzo affidabile';
  }

  return { sourceName, parsed, score, selected, reason };
}

function selectSpreadsheetSources(sources: SourceAnalysis[]): SourceAnalysis[] {
  const selected = sources.filter((source) => source.selected);
  if (selected.length > 0) {
    return selected;
  }

  const best = [...sources].sort((a, b) => b.score - a.score)[0];

  if (best && best.parsed.items.length > 0 && best.score >= 18) {
    return [{ ...best, selected: true, reason: undefined }];
  }

  return [];
}

function getReadablePdfError(error: unknown): string {
  const message = String((error as Error)?.message || error || '').trim();

  if (!message) {
    return 'Non sono riuscito a leggere il PDF.';
  }

  if (
    /expected pattern/i.test(message) ||
    /invalid pdf/i.test(message) ||
    /parser/i.test(message)
  ) {
    return 'Non sono riuscito a leggere il PDF. Se e un PDF scansito o fotografico, serve OCR oppure un PDF con testo selezionabile.';
  }

  if (/password/i.test(message)) {
    return 'Il PDF e protetto da password e non puo essere importato automaticamente.';
  }

  return `Non sono riuscito a leggere il PDF: ${message}`;
}

function buildEmptySummary(): UniversalImportResult['summary'] {
  return {
    totalRows: 0,
    parsedRows: 0,
    skippedRows: 0,
    normalizedPriceRows: 0,
    unitDetectedRows: 0,
    pendingReferenceRows: 0,
  };
}

function buildSummaryFromItems(
  items: UniversalParsedItem[]
): UniversalImportResult['summary'] {
  return {
    totalRows: items.length,
    parsedRows: items.length,
    skippedRows: 0,
    normalizedPriceRows: items.filter((item) => item.unit_price > 0).length,
    unitDetectedRows: items.filter((item) => item.pricing_basis_unit).length,
    pendingReferenceRows: items.filter(
      (item) => item.pricing_status === 'needs_reference'
    ).length,
  };
}

function normalizeCandidateFingerprint(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function scoreCandidateItem(item: UniversalParsedItem) {
  let score = 0;
  if (item.unit_price > 0) score += 10;
  if (item.pricing_basis_unit) score += 4;
  if ((item.pricing_basis_quantity || 0) > 0) score += 3;
  if (item.inferred_rule_key) score += 2;
  if (item.category) score += 1;
  score += Math.min(item.description.trim().length / 40, 2);
  return score;
}

function extractItemCode(description: string): string | null {
  const match = /\(cod\.\s*([^)\s]+)\)\s*$/i.exec(description);
  return match ? match[1].toUpperCase() : null;
}

function mergeCandidateItems(
  ...candidateSets: UniversalParsedItem[][]
): UniversalParsedItem[] {
  const merged = new Map<string, UniversalParsedItem>();

  for (const items of candidateSets) {
    for (const item of items) {
      const description = String(item.description || '').trim();
      if (!description) continue;

      // Same article code = same item, even when parser and AI word the description differently.
      const code = extractItemCode(description);
      const fingerprint = code
        ? `code::${code}`
        : [
            normalizeCandidateFingerprint(description),
            normalizeCandidateFingerprint(item.pricing_basis_unit || ''),
            Number(item.pricing_basis_quantity || 0).toFixed(6),
          ].join('::');

      const existing = merged.get(fingerprint);
      if (!existing || scoreCandidateItem(item) > scoreCandidateItem(existing)) {
        merged.set(fingerprint, {
          ...item,
          description,
        });
      }
    }
  }

  return Array.from(merged.values());
}

async function summarizePdfSourceWithAi(params: {
  fileName: string;
  sourceText: string;
  parsed: UniversalImportResult;
}) {
  const preview = params.sourceText.trim().slice(0, 12000);
  if (!preview) {
    if (params.parsed.items.length > 0) {
      const pending = params.parsed.summary.pendingReferenceRows || 0;
      return pending > 0
        ? `PDF salvato come sorgente tecnica del listino. Ho trovato ${params.parsed.items.length} voci candidate, di cui ${pending} da completare con le regole prezzo.`
        : `PDF salvato come sorgente del listino. Ho trovato ${params.parsed.items.length} voci candidate pronte per l import.`;
    }
    return 'PDF salvato come sorgente del listino. Non sono riuscito a leggere abbastanza testo utile per ricavare voci affidabili.';
  }

  if (!openai) {
    return params.parsed.items.length
      ? `PDF salvato come sorgente del listino. Ho trovato ${params.parsed.items.length} voci potenziali da usare con le regole prezzo.`
      : 'PDF salvato come sorgente del listino. Imposta le regole prezzo e rilancia l AI per provare a ricavare le voci.';
  }

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_AGENT_MODEL || 'gpt-4o-mini',
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content:
          'Sei un assistente che riassume listini tecnici importati da PDF. ' +
          'Devi dare un riscontro breve e pratico in italiano, massimo 4 frasi. ' +
          'Spiega cosa sei riuscito a leggere, se mancano prezzi espliciti e quali regole prezzo servono per completare l import. ' +
          'Parla solo del contenuto letto: niente consigli su spedizioni, pagamenti, resi, sconti o condizioni commerciali.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          file_name: params.fileName,
          parsed_summary: params.parsed.summary,
          candidate_count: params.parsed.items.length,
          text_preview: preview,
        }),
      },
    ],
  });

  return (
    completion.choices[0]?.message?.content?.trim() ||
    'PDF salvato come sorgente del listino. Ho preparato il contenuto per un secondo passaggio AI con le regole prezzo.'
  );
}

async function extractPdfCandidatesWithAi(params: {
  fileName: string;
  sourceText: string;
}): Promise<UniversalParsedItem[]> {
  const preview = params.sourceText.trim().slice(0, 18000);
  if (!preview || !openai) return [];

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_AGENT_MODEL || 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Estrai da un PDF di listino tecnico un elenco di voci importabili. ' +
          'Restituisci solo JSON nel formato {"items":[...]} con campi: ' +
          'description, category, unit_price, pricing_basis_unit, pricing_basis_quantity, inferred_rule_key. ' +
          'Usa unit_price solo se il prezzo e chiaramente presente. ' +
          'Se il prezzo non c e ma esistono misure utili, compila pricing_basis_unit e pricing_basis_quantity. ' +
          'Usa inferred_rule_key solo tra: metal_ferrous, metal_nonferrous, electric_cable, piping, paint_chemical, wood_panel, generic. ' +
          'Le unita ammesse sono: kg, m, l, m2, pcs. Non inventare dati. ' +
          'Se la voce ha un codice articolo, mettilo alla fine della description nel formato "(cod. CODICE)".',
      },
      {
        role: 'user',
        content: JSON.stringify({
          file_name: params.fileName,
          text_preview: preview,
        }),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  let parsed: {
    items?: Array<{
      description?: string;
      category?: string | null;
      unit_price?: number | string | null;
      pricing_basis_unit?: string | null;
      pricing_basis_quantity?: number | string | null;
      inferred_rule_key?: string | null;
    }>;
  } = {};

  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  return mapAiCandidateItems(parsed.items || []);
}

function mapAiCandidateItems(
  items: Array<{
    description?: string;
    category?: string | null;
    unit_price?: number | string | null;
    pricing_basis_unit?: string | null;
    pricing_basis_quantity?: number | string | null;
    inferred_rule_key?: string | null;
  }>
): UniversalParsedItem[] {
  const mappedItems: UniversalParsedItem[] = [];

  for (const item of items) {
    const description = String(item.description || '').trim();
    const unitPrice = Number(item.unit_price || 0);
    const pricingBasisQuantity = Number(item.pricing_basis_quantity || 0);
    const pricingBasisUnit = String(item.pricing_basis_unit || '').trim() || null;
    const inferredRuleKey = String(item.inferred_rule_key || '').trim() || null;
    const category = String(item.category || '').trim() || null;

    if (!description) continue;

    mappedItems.push({
      description,
      unit_price: Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 0,
      markup_percent: 0,
      category,
      pricing_source:
        Number.isFinite(unitPrice) && unitPrice > 0 ? 'file' : 'needs_reference',
      pricing_status:
        Number.isFinite(unitPrice) && unitPrice > 0 ? 'resolved' : 'needs_reference',
      pricing_basis_unit: pricingBasisUnit,
      pricing_basis_quantity:
        Number.isFinite(pricingBasisQuantity) && pricingBasisQuantity > 0
          ? pricingBasisQuantity
          : null,
      inferred_rule_key: inferredRuleKey,
    });
  }

  return mappedItems;
}

async function extractPdfCandidatesFromImagesWithAi(params: {
  fileName: string;
  images: Array<{ pageNumber: number; dataUrl: string }>;
}): Promise<UniversalParsedItem[]> {
  if (!openai || !params.images.length) return [];

  const chunks = chunkArray(params.images, PDF_OCR_BATCH_SIZE);
  const extractedCandidates: UniversalParsedItem[] = [];

  for (const chunk of chunks) {
    const userContent: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string; detail: 'high' } }
    > = [
      {
        type: 'text',
        text:
          `Queste immagini arrivano dal PDF "${params.fileName}" e mostrano un catalogo o listino tecnico.\n` +
          'Estrai solo voci utili all import materiali, anche se il prezzo non e presente.\n' +
          'Per ogni voce cerca di restituire:\n' +
          '- description, con il codice articolo alla fine nel formato "(cod. CODICE)" se presente\n' +
          '- category breve in italiano se evidente\n' +
          '- unit_price solo se davvero leggibile\n' +
          '- pricing_basis_unit e pricing_basis_quantity quando trovi misure come kg, m, l, m2 o pezzi\n' +
          '- inferred_rule_key tra metal_ferrous, metal_nonferrous, electric_cable, piping, paint_chemical, wood_panel, generic\n' +
          'Ignora loghi, immagini decorative, titoli generici, numeri pagina e testo non collegato a una voce materiale.\n' +
          'Restituisci solo JSON nel formato {"items":[...]}',
      },
    ];

    for (const image of chunk) {
      userContent.push({ type: 'text', text: `Pagina ${image.pageNumber}` });
      userContent.push({
        type: 'image_url',
        image_url: {
          url: image.dataUrl,
          detail: 'high',
        },
      });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_AGENT_MODEL || 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Sei un assistente che estrae voci tecniche da cataloghi PDF. ' +
            'Quando i prezzi non sono visibili devi comunque restituire le voci con unita e misure utili alle regole prezzo. ' +
            'Non inventare dati e non restituire testo fuori formato JSON.',
        },
        {
          role: 'user',
          content: userContent,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    try {
      const parsed = JSON.parse(raw) as {
        items?: Array<{
          description?: string;
          category?: string | null;
          unit_price?: number | string | null;
          pricing_basis_unit?: string | null;
          pricing_basis_quantity?: number | string | null;
          inferred_rule_key?: string | null;
        }>;
      };
      extractedCandidates.push(...mapAiCandidateItems(parsed.items || []));
    } catch {
      continue;
    }
  }

  return mergeCandidateItems(extractedCandidates);
}

// Excel cells: use the real numeric value when the cell is a number (SheetJS
// formats "#,##0" as "1,250" which is ambiguous), but keep the formatted text
// for strings and percentages ("30%" would otherwise become 0.3).
function readWorksheetRows(worksheet: XLSX.WorkSheet): unknown[][] {
  const options = { header: 1 as const, defval: '', blankrows: false };
  const formatted = XLSX.utils.sheet_to_json(worksheet, {
    ...options,
    raw: false,
  }) as unknown[][];
  const raw = XLSX.utils.sheet_to_json(worksheet, {
    ...options,
    raw: true,
  }) as unknown[][];

  return formatted.map((row, rowIndex) =>
    row.map((cell, colIndex) => {
      const rawCell = raw[rowIndex]?.[colIndex];
      if (typeof rawCell === 'number' && !String(cell ?? '').includes('%')) {
        return rawCell;
      }
      return cell;
    })
  );
}

// CSV exported by Italian Excel is often Windows-1252, not UTF-8: decoding it as
// UTF-8 turns "Quantità" / "€" into replacement characters.
function decodeTextFile(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('windows-1252').decode(bytes);
    } catch {
      return Buffer.from(bytes).toString('latin1');
    }
  }
}

function countPricedItems(items: UniversalParsedItem[]): number {
  return items.filter((item) => item.unit_price > 0).length;
}

// The AI fallbacks are only useful when the text parser found little or no
// priced rows. Running them on a good parse just adds cost and invented duplicates.
const PDF_AI_FALLBACK_MIN_PRICED_ROWS = 8;

// Amounts alone on a line are table cells the text parser could not attach to an
// item (tables extracted column by column): many of them mean items were missed.
function countOrphanAmountLines(text: string): number {
  return text
    .split(/\r?\n/)
    .filter((line) => /^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(line.trim())).length;
}

function shouldRunPdfAiFallback(
  items: UniversalParsedItem[],
  sourceText: string
): boolean {
  const priced = countPricedItems(items);
  // Technical catalogues without prices: rows with a weight/length are already
  // usable through pricing rules, so the AI would only add noise and latency.
  const priceable = items.filter(
    (item) =>
      item.unit_price <= 0 &&
      item.pricing_basis_unit &&
      (item.pricing_basis_quantity || 0) > 0
  ).length;
  if (priceable >= PDF_AI_FALLBACK_MIN_PRICED_ROWS * 4) return false;
  if (priced < PDF_AI_FALLBACK_MIN_PRICED_ROWS) return true;
  const orphans = countOrphanAmountLines(sourceText);
  return orphans >= 5 && orphans > priced * 0.2;
}

// AI steps only improve a PDF import: if OpenAI fails (bad key, quota, timeout)
// the items read by the parser must still be saved instead of failing with 500.
async function bestEffortAi<T>(
  label: string,
  run: () => Promise<T>,
  fallback: T,
  errors: string[]
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const message = (error as Error)?.message || String(error);
    console.warn(`Listino PDF AI step "${label}" failed:`, message);
    errors.push(`${label}: ${message.slice(0, 200)}`);
    return fallback;
  }
}

function inferUploadExtension(params: {
  fileName?: string | null;
  originalFileName?: string | null;
  mimeType?: string | null;
}): string | null {
  const candidates = [params.originalFileName, params.fileName]
    .map((value) =>
      String(value || '')
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);

  for (const candidate of candidates) {
    const cleanName = candidate.split(/[?#]/, 1)[0];
    const maybeExt = cleanName.split('.').pop();
    if (maybeExt && /^[a-z0-9]{2,8}$/i.test(maybeExt)) {
      return maybeExt;
    }
  }

  const mimeType = String(params.mimeType || '').toLowerCase();
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'text/csv') return 'csv';
  if (mimeType === 'text/plain') return 'txt';
  if (mimeType === 'application/vnd.ms-excel') return 'xls';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return 'xlsx';
  }
  return null;
}

export async function processListinoImport(
  params: ProcessListinoImportParams
): Promise<ProcessListinoImportResult> {
  const profileId = params.profileId;
  const listinoIdParam = params.listinoId || null;
  const listinoName = params.listinoName || null;
  const originalFileName = params.originalFileName || null;
  const uploadedFileName = params.uploadedFileName;
  const uploadedFileType = params.uploadedFileType;
  const arrayBuffer = params.arrayBuffer;
  const sourceOnly = Boolean(params.sourceOnly);

  if (!profileId || !uploadedFileName) {
    return { ok: false, status: 400, error: 'Missing file or profileId' };
  }

  try {
    const ext = inferUploadExtension({
      fileName: uploadedFileName,
      originalFileName,
      mimeType: uploadedFileType,
    });

    let parsed: ReturnType<typeof parseUniversalSpreadsheetRows>;
    let sourceDiagnostics: Array<Record<string, unknown>> = [];
    let storedMetadata: {
      fileName: string;
      mimeType: string;
      uploadedAt: string;
    } | null = null;
    let aiFeedback: string | null = null;

    if (ext === 'xlsx' || ext === 'xls') {
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const analyses = workbook.SheetNames.map((sheetName) =>
        analyzeRowsForImport(readWorksheetRows(workbook.Sheets[sheetName]), sheetName)
      );

      const selectedSources = selectSpreadsheetSources(analyses);
      sourceDiagnostics = analyses.map((analysis) => ({
        sourceName: analysis.sourceName,
        selected: selectedSources.some(
          (selected) => selected.sourceName === analysis.sourceName
        ),
        parsedRows: analysis.parsed.summary.parsedRows,
        totalRows: analysis.parsed.summary.totalRows,
        score: analysis.score,
        reason: analysis.reason || null,
      }));

      parsed = mergeUniversalImportResults(
        selectedSources.map((source) => source.parsed)
      );
    } else if (ext === 'pdf') {
      const pdfBuffer = Buffer.from(arrayBuffer);
      let pdfText = '';
      let combinedPdfText = '';
      let pdfReadError: unknown = null;
      let pdfReadErrorMessage: string | null = null;
      let pdfReadMethod: 'inline' | 'subprocess' | 'empty' = 'empty';
      let ocrApplied = false;
      let ocrFailedReason: string | null = null;
      let ocrRenderedPages = 0;
      let ocrTotalPages = 0;
      let renderedPdfImages: Array<{ pageNumber: number; dataUrl: string }> = [];

      try {
        const extracted = await extractPdfTextWithFallback(pdfBuffer);
        pdfText = extracted.text;
        pdfReadMethod = extracted.method;
        if (extracted.error) pdfReadErrorMessage = extracted.error;
      } catch (pdfError) {
        pdfReadError = pdfError;
        pdfReadErrorMessage = (pdfError as Error)?.message || String(pdfError);
      }

      parsed = parseUniversalPdfText(pdfText || '');

      const shouldTryRenderedFallback =
        parsed.items.length === 0 ||
        (parsed.summary.parsedRows < 8 && parsed.summary.pendingReferenceRows < 3);

      if (shouldTryRenderedFallback) {
        try {
          let rendered: Awaited<ReturnType<typeof renderPdfPages>> | null = null;
          let renderTmpDir: string | null = null;
          try {
            rendered = await renderPdfPages({
              buffer: pdfBuffer,
              maxPages: PDF_OCR_MAX_PAGES,
            });
          } catch {
            // Same as text extraction: retry rendering in a separate process on any error.
            try {
              renderTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-render-'));
              const tmpFile = path.join(renderTmpDir, 'source.pdf');
              await fs.writeFile(tmpFile, pdfBuffer);
              const renderOutDir = path.join(renderTmpDir, 'pages');
              await fs.mkdir(renderOutDir, { recursive: true });

              const result = await runPdfSubprocess('render-pdf-pages.cjs', [
                tmpFile,
                renderOutDir,
                String(PDF_OCR_MAX_PAGES),
                String(PDF_OCR_SCREENSHOT_WIDTH),
              ]);

              const structuredStderr = tryParseStderrError(result.stderr);
              if (result.ok && result.stdout) {
                try {
                  const parsedSub = JSON.parse(result.stdout) as {
                    totalPages?: number;
                    renderedPages?: number;
                    pages?: Array<{
                      pageNumber: number;
                      path: string;
                      width?: number;
                      height?: number;
                    }>;
                  };
                  if (parsedSub && Array.isArray(parsedSub.pages)) {
                    const images: Array<{ pageNumber: number; dataUrl: string }> = [];
                    for (const page of parsedSub.pages) {
                      const pagePath = page?.path;
                      if (!pagePath) continue;
                      try {
                        if (renderTmpDir && !path.isAbsolute(pagePath)) {
                          void renderTmpDir;
                        }
                        const absPath = path.isAbsolute(pagePath)
                          ? pagePath
                          : path.resolve(renderOutDir, pagePath);
                        const pageBuffer = await fs.readFile(absPath);
                        if (pageBuffer && pageBuffer.length > 0) {
                          images.push({
                            pageNumber: Number(page.pageNumber || images.length + 1),
                            dataUrl: `data:image/png;base64,${pageBuffer.toString('base64')}`,
                          });
                        }
                      } catch {}
                    }
                    if (images.length > 0) {
                      rendered = {
                        totalPages: Number(
                          parsedSub.totalPages || parsedSub.renderedPages || images.length
                        ),
                        renderedPages: images.length,
                        images,
                      };
                    }
                  }
                } catch (parseErr) {
                  if (!rendered) {
                    ocrFailedReason =
                      structuredStderr ||
                      (parseErr as Error)?.message ||
                      'Rendering PDF in subprocesso non riuscito';
                  }
                }
              } else if (structuredStderr && !rendered) {
                ocrFailedReason = `Rendering PDF non riuscito: ${structuredStderr}`;
              }
            } catch (subprocessErr) {
              if (!rendered) {
                ocrFailedReason =
                  (subprocessErr as Error)?.message || 'Rendering PDF non riuscito';
              }
            }
          } finally {
            if (renderTmpDir) {
              void fs.rm(renderTmpDir, { recursive: true, force: true }).catch(() => {});
            }
          }

          if (rendered) {
            ocrRenderedPages = rendered.renderedPages;
            ocrTotalPages = rendered.totalPages;
            renderedPdfImages = rendered.images;
          }

          if (rendered && rendered.images.length > 0) {
            const ocrText = await ocrPdfImages({
              fileName: uploadedFileName,
              images: rendered.images,
            });

            ocrApplied = true;
            if (ocrText.trim()) {
              combinedPdfText = [pdfText, ocrText].filter(Boolean).join('\n');
              parsed = parseUniversalPdfText(combinedPdfText);
            }
          }
        } catch (ocrError) {
          ocrFailedReason = (ocrError as Error)?.message || 'OCR automatico non riuscito';
        }
      }

      if (!combinedPdfText) {
        combinedPdfText = pdfText;
      }

      const aiErrors: string[] = [];
      const runAiFallback = shouldRunPdfAiFallback(parsed.items, combinedPdfText);
      if (runAiFallback && combinedPdfText.trim()) {
        const aiCandidates = await bestEffortAi(
          'text candidates',
          () =>
            extractPdfCandidatesWithAi({
              fileName: uploadedFileName,
              sourceText: combinedPdfText,
            }),
          [] as UniversalParsedItem[],
          aiErrors
        );

        if (aiCandidates.length) {
          const mergedItems = mergeCandidateItems(parsed.items, aiCandidates);
          parsed = {
            items: mergedItems,
            summary: buildSummaryFromItems(mergedItems),
          };
        }
      }

      if (runAiFallback && renderedPdfImages.length > 0) {
        const visionCandidates = await bestEffortAi(
          'vision candidates',
          () =>
            extractPdfCandidatesFromImagesWithAi({
              fileName: uploadedFileName,
              images: renderedPdfImages.slice(0, 6),
            }),
          [] as UniversalParsedItem[],
          aiErrors
        );

        if (visionCandidates.length) {
          const mergedItems = mergeCandidateItems(parsed.items, visionCandidates);
          parsed = {
            items: mergedItems,
            summary: buildSummaryFromItems(mergedItems),
          };
        }
      }

      if (
        !parsed.items.length &&
        (pdfReadError || pdfReadErrorMessage) &&
        !ocrApplied &&
        !ocrFailedReason
      ) {
        parsed = {
          items: [],
          summary: buildEmptySummary(),
        };
        sourceDiagnostics = [
          {
            sourceName: uploadedFileName,
            selected: false,
            parsedRows: 0,
            totalRows: 0,
            score: 0,
            reason: getReadablePdfError(pdfReadError || pdfReadErrorMessage),
            pdfReadMethod,
            pdfReadErrorRaw: pdfReadErrorMessage,
          },
        ];
      }

      if (!sourceDiagnostics.length) {
        const ocrHint =
          ocrApplied && ocrRenderedPages > 0
            ? ocrTotalPages > ocrRenderedPages
              ? `OCR automatico usato sulle prime ${ocrRenderedPages} di ${ocrTotalPages} pagine`
              : `OCR automatico usato su ${ocrRenderedPages} pagine`
            : null;

        const pdfHint =
          pdfReadMethod === 'subprocess'
            ? 'PDF estratto tramite estrattore indipendente (backup).'
            : pdfReadErrorMessage && parsed.items.length > 0
              ? `PDF letto con errori interni compensati da fallback: ${getReadablePdfError(pdfReadErrorMessage).slice(0, 120)}`
              : null;

        const reasonBase =
          parsed.summary.parsedRows > 0
            ? [pdfHint, ocrHint].filter(Boolean).join(' ') || null
            : ocrFailedReason
              ? `Ho provato anche l OCR automatico, ma non e riuscito: ${ocrFailedReason}`
              : ocrHint
                ? `${ocrHint}, ma non ho trovato voci con prezzi riconoscibili`
                : pdfReadErrorMessage
                  ? `Il PDF risulta illeggibile: ${getReadablePdfError(pdfReadErrorMessage)}`
                  : 'PDF senza testo utile o senza prezzi riconoscibili';

        sourceDiagnostics = [
          {
            sourceName: uploadedFileName,
            selected: true,
            parsedRows: parsed.summary.parsedRows,
            totalRows: parsed.summary.totalRows,
            score: parsed.summary.parsedRows > 0 ? 100 : 0,
            reason: reasonBase,
            ocrApplied,
            ocrRenderedPages,
            ocrTotalPages,
            aiCandidateFallback: parsed.items.length > 0 && !pdfText.trim(),
            pdfReadMethod,
            pdfReadErrorRaw: pdfReadErrorMessage,
          },
        ];
      }

      let targetListinoId = listinoIdParam;
      if (targetListinoId) {
        const { data: existingListino, error: existingListinoErr } = await supabase
          .from('listini')
          .select('id')
          .eq('id', targetListinoId)
          .eq('profile_id', profileId)
          .maybeSingle();
        if (existingListinoErr) {
          return { ok: false, status: 500, error: existingListinoErr.message };
        }
        if (!existingListino) {
          return { ok: false, status: 404, error: 'Listino non trovato' };
        }
      } else {
        const { data: listino, error: listinoErr } = await supabase
          .from('listini')
          .insert({
            profile_id: profileId,
            name: listinoName || `Imported ${new Date().toISOString()}`,
          })
          .select('id')
          .single();
        if (listinoErr) return { ok: false, status: 500, error: listinoErr.message };
        targetListinoId = listino.id;
      }

      // Catalogue without prices (sizes and weights only): no generic pricing rules.
      // The shapes found become the listino's "Prezzi per forma" section and only the
      // shapes with a price set there become items.
      if (isPricelessCatalogue(parsed.items)) {
        const grouped = parsed.items.filter(
          (item) => item.pricing_group && (item.pricing_basis_quantity || 0) > 0
        );
        const mapping = await canonicalizeGroupNames(
          grouped.map((item) => item.pricing_group!)
        );
        const candidates = applyCanonicalGroups(grouped, mapping);
        const groups = await syncPricingGroups({
          listinoId: targetListinoId!,
          profileId,
          items: candidates,
        });
        const summary = buildSummaryFromItems(candidates);
        aiFeedback =
          `Il PDF non contiene prezzi: ho trovato ${candidates.length} voci in ${groups.length} forme ` +
          '(travi, tondi, lamiere...). Indica il prezzo di ogni forma nella sezione "Prezzi per forma" del listino.';

        const stored = await uploadListinoSource({
          profileId,
          listinoId: targetListinoId!,
          fileName: originalFileName || uploadedFileName,
          mimeType: uploadedFileType || 'application/pdf',
          fileBuffer: pdfBuffer,
          metadata: {
            listinoId: targetListinoId!,
            profileId,
            fileName: originalFileName || uploadedFileName,
            mimeType: uploadedFileType || 'application/pdf',
            uploadedAt: new Date().toISOString(),
            sourceText: combinedPdfText.slice(0, 200000),
            sourceTextPreview: combinedPdfText.slice(0, 4000),
            parsedSummary: summary,
            candidateItems: candidates,
            sourceDiagnostics,
            pricingDiagnostics: null,
            aiFeedback,
            requiresPricingRules: true,
            parserVersion: LISTINO_PARSER_VERSION,
            pricingGroupsCount: groups.length,
          },
        });

        const applied = sourceOnly
          ? null
          : await applyGroupPricesToListino({
              listinoId: targetListinoId!,
              profileId,
              candidates,
              groups,
            });

        return {
          ok: true,
          status: 200,
          inserted: applied?.inserted || 0,
          updated: applied?.updated || 0,
          duplicatesSkipped: applied?.duplicatesSkipped || 0,
          listinoId: targetListinoId,
          summary,
          sourceDiagnostics,
          sourceStored: true,
          aiFeedback,
          pricingGroups: groups.length,
          pendingPricingGroups: groups.filter((group) => !((group.unit_price || 0) > 0))
            .length,
          sourceInfo: {
            fileName: stored.fileName,
            mimeType: stored.mimeType,
            uploadedAt: stored.uploadedAt,
          },
          storedSource: stored,
        };
      }

      const pricingResolution = await resolveImportPricing({ profileId, parsed });
      aiFeedback = await bestEffortAi(
        'summary',
        () =>
          summarizePdfSourceWithAi({
            fileName: uploadedFileName,
            sourceText: combinedPdfText,
            parsed,
          }),
        parsed.items.length
          ? `PDF salvato come sorgente del listino. Ho trovato ${parsed.items.length} voci.`
          : 'PDF salvato come sorgente del listino. Non ho trovato voci con prezzi riconoscibili.',
        aiErrors
      );
      if (aiErrors.length && sourceDiagnostics[0]) {
        sourceDiagnostics[0] = { ...sourceDiagnostics[0], aiErrors };
      }

      const stored = await uploadListinoSource({
        profileId,
        listinoId: targetListinoId!,
        fileName: originalFileName || uploadedFileName,
        mimeType: uploadedFileType || 'application/pdf',
        fileBuffer: pdfBuffer,
        metadata: {
          listinoId: targetListinoId!,
          profileId,
          fileName: originalFileName || uploadedFileName,
          mimeType: uploadedFileType || 'application/pdf',
          uploadedAt: new Date().toISOString(),
          sourceText: combinedPdfText.slice(0, 200000),
          sourceTextPreview: combinedPdfText.slice(0, 4000),
          parsedSummary: parsed.summary,
          candidateItems: parsed.items,
          sourceDiagnostics,
          pricingDiagnostics: pricingResolution.diagnostics,
          aiFeedback,
          requiresPricingRules: !pricingResolution.items.length,
          parserVersion: LISTINO_PARSER_VERSION,
        },
      });
      storedMetadata = {
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        uploadedAt: stored.uploadedAt,
      };

      if (sourceOnly || !pricingResolution.items.length) {
        // The PDF is stored as listino source either way: answer 200 so clients show
        // the "PDF salvato" flow (rules to set, AI feedback) instead of a generic error.
        return {
          ok: true,
          status: 200,
          ...(sourceOnly || pricingResolution.items.length
            ? {}
            : {
                warning:
                  'Ho letto il file, ma nessuna voce ha un prezzo utilizzabile. Se il file non contiene prezzi, servono regole di riferimento per categoria oppure almeno alcune righe con prezzo da cui derivarli.',
              }),
          inserted: 0,
          updated: 0,
          listinoId: targetListinoId,
          summary: pricingResolution.summary,
          sourceDiagnostics,
          pricingDiagnostics: pricingResolution.diagnostics,
          sourceStored: true,
          aiFeedback,
          sourceInfo: storedMetadata,
          storedSource: stored,
        };
      }

      const saved = await saveListinoItems({
        listinoId: targetListinoId!,
        profileId,
        items: pricingResolution.items,
      });

      scheduleEmbeddingsForListino(targetListinoId!);

      return {
        ok: true,
        status: 200,
        inserted: saved.inserted,
        updated: saved.updated,
        duplicatesSkipped: saved.duplicatesSkipped,
        changes: saved.changes,
        listinoId: targetListinoId,
        summary: pricingResolution.summary,
        sourceDiagnostics,
        pricingDiagnostics: pricingResolution.diagnostics,
        sourceStored: true,
        aiFeedback,
        sourceInfo: storedMetadata,
        storedSource: stored,
      };
    } else {
      parsed = parseUniversalCsvText(decodeTextFile(arrayBuffer));
      sourceDiagnostics = [
        {
          sourceName: uploadedFileName,
          selected: true,
          parsedRows: parsed.summary.parsedRows,
          totalRows: parsed.summary.totalRows,
          score: parsed.summary.parsedRows > 0 ? 100 : 0,
          reason:
            parsed.summary.parsedRows > 0 ? null : 'Nessuna voce valida trovata nel file',
        },
      ];
    }

    if (!parsed.items.length) {
      return {
        ok: false,
        status: 400,
        error:
          ext === 'pdf'
            ? 'Nessuna voce valida trovata nel PDF. Ho provato anche il fallback OCR automatico quando disponibile, ma non ho trovato righe con prezzi o misure riconoscibili.'
            : 'Nessuna riga valida trovata nel file. Verifica che esistano almeno una colonna descrizione e una colonna prezzo o una misura utile come peso/metri.',
        summary: parsed.summary,
        sourceDiagnostics,
      };
    }

    // Resolve prices before creating the listino, so a failed import does not leave an empty one behind.
    const pricingResolution = await resolveImportPricing({ profileId, parsed });

    if (!pricingResolution.items.length) {
      return {
        ok: false,
        status: 400,
        error:
          'Ho letto il file, ma nessuna voce ha un prezzo utilizzabile. Se il file non contiene prezzi, servono regole di riferimento per categoria oppure almeno alcune righe con prezzo da cui derivarli.',
        summary: pricingResolution.summary,
        sourceDiagnostics,
        pricingDiagnostics: pricingResolution.diagnostics,
      };
    }

    let targetListinoId = listinoIdParam;
    if (targetListinoId) {
      const { data: existingListino, error: existingListinoErr } = await supabase
        .from('listini')
        .select('id')
        .eq('id', targetListinoId)
        .eq('profile_id', profileId)
        .maybeSingle();
      if (existingListinoErr) {
        return { ok: false, status: 500, error: existingListinoErr.message };
      }
      if (!existingListino) {
        return { ok: false, status: 404, error: 'Listino non trovato' };
      }
    } else {
      const { data: listino, error: listinoErr } = await supabase
        .from('listini')
        .insert({
          profile_id: profileId,
          name: listinoName || `Imported ${new Date().toISOString()}`,
        })
        .select('id')
        .single();
      if (listinoErr) return { ok: false, status: 500, error: listinoErr.message };
      targetListinoId = listino.id;
    }

    const saved = await saveListinoItems({
      listinoId: targetListinoId!,
      profileId,
      items: pricingResolution.items,
    });

    scheduleEmbeddingsForListino(targetListinoId!);

    return {
      ok: true,
      status: 200,
      inserted: saved.inserted,
      updated: saved.updated,
      duplicatesSkipped: saved.duplicatesSkipped,
      changes: saved.changes,
      listinoId: targetListinoId,
      summary: pricingResolution.summary,
      sourceDiagnostics,
      pricingDiagnostics: pricingResolution.diagnostics,
    };
  } catch (err: any) {
    console.error('Upload listini error:', err);
    return { ok: false, status: 500, error: err.message || 'Upload failed' };
  }
}
