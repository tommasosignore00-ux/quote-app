import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import * as XLSX from 'xlsx';
import {
  type UniversalImportResult,
  type UniversalParsedItem,
  mergeUniversalImportResults,
  parseUniversalCsvText,
  parseUniversalPdfText,
  parseUniversalSpreadsheetRows,
} from '../../../../lib/listinoUniversalImport';
import { resolveImportPricing } from '../../../../lib/listinoPricing';
import { LISTINO_SOURCE_BUCKET, uploadListinoSource } from '../../../../lib/listinoSourceStorage';

const supabase = supabaseAdmin;
const execFileAsync = promisify(execFile);
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const PDF_OCR_MAX_PAGES = 12;
const PDF_OCR_BATCH_SIZE = 2;
const PDF_OCR_SCREENSHOT_WIDTH = 1600;
const DEBUG_SERVER_FALLBACK_URL = 'http://127.0.0.1:7777/event';
const DEBUG_SESSION_ID = 'browser-pdf-upload';

async function reportDebugEvent(event: {
  runId: 'pre-fix' | 'post-fix';
  hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E';
  location: string;
  msg: string;
  data?: Record<string, unknown>;
}) {
  if (process.env.NODE_ENV === 'production') return;
  let debugServerUrl = DEBUG_SERVER_FALLBACK_URL;

  try {
    const candidates = [
      path.resolve(process.cwd(), '.dbg', `${DEBUG_SESSION_ID}.env`),
      path.resolve(process.cwd(), '..', '.dbg', `${DEBUG_SESSION_ID}.env`),
    ];

    for (const candidate of candidates) {
      try {
        const envContents = await fs.readFile(candidate, 'utf-8');
        const matchedUrl = envContents.match(/^DEBUG_SERVER_URL=(.+)$/m)?.[1]?.trim();
        if (matchedUrl) {
          debugServerUrl = matchedUrl;
          break;
        }
      } catch {}
    }
  } catch {}

  try {
    await fetch(debugServerUrl, {
      method: 'POST',
      body: JSON.stringify({
        sessionId: DEBUG_SESSION_ID,
        runId: event.runId,
        hypothesisId: event.hypothesisId,
        location: event.location,
        msg: event.msg,
        data: event.data || {},
        ts: Date.now(),
      }),
    });
  } catch {}
}

async function extractPdfText(buffer: Buffer) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'listino-pdf-'));
  const tempFilePath = path.join(tempDir, 'upload.pdf');
  const scriptPath = path.resolve(process.cwd(), 'scripts/extract-pdf-text.cjs');

  try {
    await fs.writeFile(tempFilePath, buffer);
    let stdout = '';
    try {
      const result = await execFileAsync(process.execPath, [scriptPath, tempFilePath], {
        cwd: process.cwd(),
        maxBuffer: 20 * 1024 * 1024,
      });
      stdout = result.stdout;
    } catch (error) {
      const stderr = String((error as { stderr?: string })?.stderr || '');
      try {
        const payload = JSON.parse(stderr) as { error?: string };
        throw new Error(payload.error || stderr || 'PDF extraction failed');
      } catch {
        throw new Error(stderr || (error as Error).message || 'PDF extraction failed');
      }
    }

    const payload = JSON.parse(stdout || '{}') as { text?: string; error?: string };
    if (payload.error) {
      throw new Error(payload.error);
    }

    return payload.text || '';
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function renderPdfPages(params: { buffer: Buffer; maxPages?: number }) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'listino-pdf-pages-'));
  const tempFilePath = path.join(tempDir, 'upload.pdf');
  const outputDir = path.join(tempDir, 'pages');
  const scriptPath = path.resolve(process.cwd(), 'scripts/render-pdf-pages.cjs');

  try {
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(tempFilePath, params.buffer);

    let stdout = '';
    try {
      const result = await execFileAsync(
        process.execPath,
        [scriptPath, tempFilePath, outputDir, String(params.maxPages || PDF_OCR_MAX_PAGES), String(PDF_OCR_SCREENSHOT_WIDTH)],
        {
          cwd: process.cwd(),
          maxBuffer: 20 * 1024 * 1024,
        }
      );
      stdout = result.stdout;
    } catch (error) {
      const stderr = String((error as { stderr?: string })?.stderr || '');
      try {
        const payload = JSON.parse(stderr) as { error?: string };
        throw new Error(payload.error || stderr || 'PDF page rendering failed');
      } catch {
        throw new Error(stderr || (error as Error).message || 'PDF page rendering failed');
      }
    }

    const payload = JSON.parse(stdout || '{}') as {
      totalPages?: number;
      renderedPages?: number;
      pages?: Array<{ pageNumber?: number; path?: string }>;
      error?: string;
    };

    if (payload.error) {
      throw new Error(payload.error);
    }

    const images = [] as Array<{ pageNumber: number; dataUrl: string }>;
    for (const page of payload.pages || []) {
      if (!page?.path) continue;
      const imageBuffer = await fs.readFile(page.path);
      images.push({
        pageNumber: Number(page.pageNumber || images.length + 1),
        dataUrl: `data:image/png;base64,${imageBuffer.toString('base64')}`,
      });
    }

    return {
      totalPages: payload.totalPages || images.length,
      renderedPages: payload.renderedPages || images.length,
      images,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
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
  const hasPriceSignal = probeCells.some((cell) => PRICE_HINTS.some((hint) => cell.includes(hint)));
  const hasDescriptionSignal = probeCells.some((cell) => DESCRIPTION_HINTS.some((hint) => cell.includes(hint)));

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

  const best = [...sources]
    .sort((a, b) => b.score - a.score)[0];

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

function buildSummaryFromItems(items: UniversalParsedItem[]): UniversalImportResult['summary'] {
  return {
    totalRows: items.length,
    parsedRows: items.length,
    skippedRows: 0,
    normalizedPriceRows: items.filter((item) => item.unit_price > 0).length,
    unitDetectedRows: items.filter((item) => item.pricing_basis_unit).length,
    pendingReferenceRows: items.filter((item) => item.pricing_status === 'needs_reference').length,
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

function mergeCandidateItems(...candidateSets: UniversalParsedItem[][]): UniversalParsedItem[] {
  const merged = new Map<string, UniversalParsedItem>();

  for (const items of candidateSets) {
    for (const item of items) {
      const description = String(item.description || '').trim();
      if (!description) continue;

      const fingerprint = [
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
          'Spiega cosa sei riuscito a leggere, se mancano prezzi espliciti e quali regole prezzo servono per completare l import.',
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

  return completion.choices[0]?.message?.content?.trim()
    || 'PDF salvato come sorgente del listino. Ho preparato il contenuto per un secondo passaggio AI con le regole prezzo.';
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
          'Le unita ammesse sono: kg, m, l, m2, pcs. Non inventare dati.',
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
      pricing_source: Number.isFinite(unitPrice) && unitPrice > 0 ? 'file' : 'needs_reference',
      pricing_status: Number.isFinite(unitPrice) && unitPrice > 0 ? 'resolved' : 'needs_reference',
      pricing_basis_unit: pricingBasisUnit,
      pricing_basis_quantity: Number.isFinite(pricingBasisQuantity) && pricingBasisQuantity > 0 ? pricingBasisQuantity : null,
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
          '- description\n' +
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

function inferUploadExtension(params: {
  fileName?: string | null;
  originalFileName?: string | null;
  mimeType?: string | null;
}): string | null {
  const candidates = [params.originalFileName, params.fileName]
    .map((value) => String(value || '').trim().toLowerCase())
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
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  return null;
}

export async function POST(req: Request) {
  try {
    const requestContentType = req.headers.get('content-type') || '';
    let listinoName: string | null = null;
    let profileId: string | null = null;
    let listinoId: string | null = null;
    let originalFileName: string | null = null;
    let uploadedFileName = '';
    let uploadedFileType = '';
    let arrayBuffer = new ArrayBuffer(0);

    if (requestContentType.includes('application/json')) {
      const payload = await req.json() as {
        fileBase64?: string;
          storagePath?: string;
        fileName?: string;
        mimeType?: string;
        listinoName?: string | null;
        profileId?: string | null;
        listinoId?: string | null;
        originalFileName?: string | null;
      };

      profileId = payload.profileId || null;
      listinoId = payload.listinoId || null;
      listinoName = payload.listinoName || null;
      originalFileName = payload.originalFileName || payload.fileName || null;
      uploadedFileName = String(payload.fileName || originalFileName || '').trim();
      uploadedFileType = String(payload.mimeType || '').trim();
        const storagePath = String(payload.storagePath || '').trim();

        if (!profileId || !uploadedFileName) {
        return NextResponse.json({ error: 'Missing file or profileId' }, { status: 400 });
      }

        if (storagePath) {
          const sourceDownload = await supabase.storage
            .from(LISTINO_SOURCE_BUCKET)
            .download(storagePath);

          if (sourceDownload.error) {
            return NextResponse.json({ error: sourceDownload.error.message }, { status: 500 });
          }

          arrayBuffer = await sourceDownload.data.arrayBuffer();
          if (!uploadedFileName) {
            uploadedFileName = path.basename(storagePath);
          }
          if (!uploadedFileType) {
            uploadedFileType = 'application/pdf';
          }
        } else if (payload.fileBase64) {
          arrayBuffer = Uint8Array.from(Buffer.from(payload.fileBase64, 'base64')).buffer;
        } else {
          return NextResponse.json({ error: 'Missing file or profileId' }, { status: 400 });
        }
    } else {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      listinoName = formData.get('listinoName') as string | null;
      profileId = formData.get('profileId') as string | null;
      listinoId = formData.get('listinoId') as string | null;
      originalFileName = formData.get('originalFileName') as string | null;

      if (!file || !profileId) {
        return NextResponse.json({ error: 'Missing file or profileId' }, { status: 400 });
      }

      uploadedFileName = file.name;
      uploadedFileType = file.type;
      arrayBuffer = await file.arrayBuffer();
    }

    // #region debug-point C:route-start
    await reportDebugEvent({
      runId: 'pre-fix',
      hypothesisId: 'C',
      location: 'web/app/api/listini/upload/route.ts:POST:start',
      msg: '[DEBUG] Upload route received request',
      data: {
        fileName: uploadedFileName,
        fileType: uploadedFileType,
        profileId,
        listinoId,
        originalFileName,
        requestContentType,
      },
    });
    // #endregion

    const ext = inferUploadExtension({
      fileName: uploadedFileName,
      originalFileName,
      mimeType: uploadedFileType,
    });

    // #region debug-point C:route-array-buffer
    await reportDebugEvent({
      runId: 'pre-fix',
      hypothesisId: 'C',
      location: 'web/app/api/listini/upload/route.ts:POST:array-buffer',
      msg: '[DEBUG] Upload route decoded file bytes',
      data: {
        ext,
        byteLength: arrayBuffer.byteLength,
        fileName: uploadedFileName,
      },
    });
    // #endregion
    let parsed: ReturnType<typeof parseUniversalSpreadsheetRows>;
    let sourceDiagnostics: Array<Record<string, unknown>> = [];

    if (ext === 'xlsx' || ext === 'xls') {
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const analyses = workbook.SheetNames.map((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: '',
          raw: false,
          blankrows: false,
        }) as unknown[][];
        return analyzeRowsForImport(rows, sheetName);
      });

      const selectedSources = selectSpreadsheetSources(analyses);
      sourceDiagnostics = analyses.map((analysis) => ({
        sourceName: analysis.sourceName,
        selected: selectedSources.some((selected) => selected.sourceName === analysis.sourceName),
        parsedRows: analysis.parsed.summary.parsedRows,
        totalRows: analysis.parsed.summary.totalRows,
        score: analysis.score,
        reason: analysis.reason || null,
      }));

      parsed = mergeUniversalImportResults(selectedSources.map((source) => source.parsed));
    } else if (ext === 'pdf') {
      // #region debug-point D:pdf-branch
      await reportDebugEvent({
        runId: 'pre-fix',
        hypothesisId: 'D',
        location: 'web/app/api/listini/upload/route.ts:POST:pdf-branch',
        msg: '[DEBUG] Upload route entered PDF branch',
        data: {
          fileName: uploadedFileName,
          fileType: uploadedFileType,
          byteLength: arrayBuffer.byteLength,
        },
      });
      // #endregion
      const pdfBuffer = Buffer.from(arrayBuffer);
      let pdfText = '';
      let combinedPdfText = '';
      let pdfReadError: unknown = null;
      let ocrApplied = false;
      let ocrFailedReason: string | null = null;
      let ocrRenderedPages = 0;
      let ocrTotalPages = 0;
      let renderedPdfImages: Array<{ pageNumber: number; dataUrl: string }> = [];

      try {
        pdfText = await extractPdfText(pdfBuffer);
        // #region debug-point D:pdf-text
        await reportDebugEvent({
          runId: 'pre-fix',
          hypothesisId: 'D',
          location: 'web/app/api/listini/upload/route.ts:POST:pdf-text',
          msg: '[DEBUG] PDF text extraction completed',
          data: {
            textLength: pdfText.length,
            preview: pdfText.slice(0, 200),
          },
        });
        // #endregion
      } catch (pdfError) {
        pdfReadError = pdfError;
        // #region debug-point D:pdf-text-error
        await reportDebugEvent({
          runId: 'pre-fix',
          hypothesisId: 'D',
          location: 'web/app/api/listini/upload/route.ts:POST:pdf-text-error',
          msg: '[DEBUG] PDF text extraction failed',
          data: {
            error: (pdfError as Error)?.message || String(pdfError),
          },
        });
        // #endregion
      }

      parsed = parseUniversalPdfText(pdfText || '');

      const shouldTryRenderedFallback =
        parsed.items.length === 0 ||
        (parsed.summary.parsedRows < 8 && parsed.summary.pendingReferenceRows < 3);

      if (shouldTryRenderedFallback) {
        try {
          const rendered = await renderPdfPages({ buffer: pdfBuffer, maxPages: PDF_OCR_MAX_PAGES });
          ocrRenderedPages = rendered.renderedPages;
          ocrTotalPages = rendered.totalPages;
          renderedPdfImages = rendered.images;

          if (rendered.images.length > 0) {
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

      if ((parsed.items.length === 0 || parsed.summary.pendingReferenceRows < 3) && combinedPdfText.trim()) {
        const aiCandidates = await extractPdfCandidatesWithAi({
          fileName: uploadedFileName,
          sourceText: combinedPdfText,
        });

        if (aiCandidates.length) {
          parsed = {
            items: mergeCandidateItems(parsed.items, aiCandidates),
            summary: buildSummaryFromItems(mergeCandidateItems(parsed.items, aiCandidates)),
          };
        }
      }

      if ((parsed.items.length === 0 || parsed.summary.pendingReferenceRows < 5) && renderedPdfImages.length > 0) {
        const visionCandidates = await extractPdfCandidatesFromImagesWithAi({
          fileName: uploadedFileName,
          images: renderedPdfImages.slice(0, 6),
        });

        if (visionCandidates.length) {
          const mergedItems = mergeCandidateItems(parsed.items, visionCandidates);
          parsed = {
            items: mergedItems,
            summary: buildSummaryFromItems(mergedItems),
          };
        }
      }

      if (!parsed.items.length && pdfReadError && !ocrApplied && !ocrFailedReason) {
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
            reason: getReadablePdfError(pdfReadError),
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

        sourceDiagnostics = [
          {
            sourceName: uploadedFileName,
            selected: true,
            parsedRows: parsed.summary.parsedRows,
            totalRows: parsed.summary.totalRows,
            score: parsed.summary.parsedRows > 0 ? 100 : 0,
            reason:
              parsed.summary.parsedRows > 0
                ? ocrHint
                : ocrFailedReason
                  ? `Ho provato anche l OCR automatico, ma non e riuscito: ${ocrFailedReason}`
                  : ocrHint
                    ? `${ocrHint}, ma non ho trovato voci con prezzi riconoscibili`
                    : 'PDF senza testo utile o senza prezzi riconoscibili',
            ocrApplied,
            ocrRenderedPages,
            ocrTotalPages,
            aiCandidateFallback: parsed.items.length > 0 && !pdfText.trim(),
          },
        ];
      }

      let targetListinoId = listinoId;
      if (targetListinoId) {
        const { data: existingListino, error: existingListinoErr } = await supabase
          .from('listini')
          .select('id')
          .eq('id', targetListinoId)
          .eq('profile_id', profileId)
          .maybeSingle();
        if (existingListinoErr) return NextResponse.json({ error: existingListinoErr.message }, { status: 500 });
        if (!existingListino) return NextResponse.json({ error: 'Listino non trovato' }, { status: 404 });
      } else {
        const { data: listino, error: listinoErr } = await supabase
          .from('listini')
          .insert({ profile_id: profileId, name: listinoName || `Imported ${new Date().toISOString()}` })
          .select('id')
          .single();
        if (listinoErr) return NextResponse.json({ error: listinoErr.message }, { status: 500 });
        targetListinoId = listino.id;
      }

      const pricingResolution = await resolveImportPricing({ profileId, parsed });
      const aiFeedback = await summarizePdfSourceWithAi({
        fileName: uploadedFileName,
        sourceText: combinedPdfText,
        parsed,
      });

      const storedMetadata = await uploadListinoSource({
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
        },
      });

      if (!pricingResolution.items.length) {
        return NextResponse.json({
          ok: true,
          inserted: 0,
          listinoId: targetListinoId,
          summary: pricingResolution.summary,
          sourceDiagnostics,
          pricingDiagnostics: pricingResolution.diagnostics,
          sourceStored: true,
          aiFeedback,
          sourceInfo: {
            fileName: storedMetadata.fileName,
            mimeType: storedMetadata.mimeType,
            uploadedAt: storedMetadata.uploadedAt,
          },
        });
      }

      const itemsToInsert = pricingResolution.items.map((row) => ({
        listino_id: targetListinoId,
        profile_id: profileId,
        description: row.description.trim(),
        unit_price: row.unit_price,
        markup_percent: row.markup_percent,
        category: row.category || null,
      }));

      const batchSize = 200;
      for (let i = 0; i < itemsToInsert.length; i += batchSize) {
        const batch = itemsToInsert.slice(i, i + batchSize);
        const { error } = await supabase.from('listini_vettoriali').insert(batch.map((item) => ({
          profile_id: item.profile_id,
          description: item.description,
          unit_price: item.unit_price,
          markup_percent: item.markup_percent,
          category: item.category,
          listino_id: item.listino_id,
          embedding: null,
          created_at: new Date().toISOString(),
        })));
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }

      try {
        const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
        await fetch(`${origin}/api/embeddings/bulk-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listinoId: targetListinoId }),
        });
      } catch (e) {
        console.warn('Failed to trigger bulk embeddings', e);
      }

      return NextResponse.json({
        ok: true,
        inserted: itemsToInsert.length,
        listinoId: targetListinoId,
        summary: pricingResolution.summary,
        sourceDiagnostics,
        pricingDiagnostics: pricingResolution.diagnostics,
        sourceStored: true,
        aiFeedback,
        sourceInfo: {
          fileName: storedMetadata.fileName,
          mimeType: storedMetadata.mimeType,
          uploadedAt: storedMetadata.uploadedAt,
        },
      });
    } else {
      parsed = parseUniversalCsvText(Buffer.from(arrayBuffer).toString('utf-8'));
      sourceDiagnostics = [
        {
            sourceName: uploadedFileName,
          selected: true,
          parsedRows: parsed.summary.parsedRows,
          totalRows: parsed.summary.totalRows,
          score: parsed.summary.parsedRows > 0 ? 100 : 0,
          reason: parsed.summary.parsedRows > 0 ? null : 'Nessuna voce valida trovata nel file',
        },
      ];
    }

    if (!parsed.items.length) {
      return NextResponse.json(
        {
          error: ext === 'pdf'
            ? 'Nessuna voce valida trovata nel PDF. Ho provato anche il fallback OCR automatico quando disponibile, ma non ho trovato righe con prezzi o misure riconoscibili.'
            : 'Nessuna riga valida trovata nel file. Verifica che esistano almeno una colonna descrizione e una colonna prezzo o una misura utile come peso/metri.',
          summary: parsed.summary,
          sourceDiagnostics,
        },
        { status: 400 }
      );
    }

    let targetListinoId = listinoId;
    if (targetListinoId) {
      const { data: existingListino, error: existingListinoErr } = await supabase
        .from('listini')
        .select('id')
        .eq('id', targetListinoId)
        .eq('profile_id', profileId)
        .maybeSingle();
      if (existingListinoErr) return NextResponse.json({ error: existingListinoErr.message }, { status: 500 });
      if (!existingListino) return NextResponse.json({ error: 'Listino non trovato' }, { status: 404 });
    } else {
      const { data: listino, error: listinoErr } = await supabase
        .from('listini')
        .insert({ profile_id: profileId, name: listinoName || `Imported ${new Date().toISOString()}` })
        .select('id')
        .single();
      if (listinoErr) return NextResponse.json({ error: listinoErr.message }, { status: 500 });
      targetListinoId = listino.id;
    }

    const pricingResolution = await resolveImportPricing({ profileId, parsed });

    if (!pricingResolution.items.length) {
      return NextResponse.json(
        {
          error: 'Ho letto il file, ma nessuna voce ha un prezzo utilizzabile. Se il file non contiene prezzi, servono regole di riferimento per categoria oppure almeno alcune righe con prezzo da cui derivarli.',
          summary: pricingResolution.summary,
          sourceDiagnostics,
          pricingDiagnostics: pricingResolution.diagnostics,
        },
        { status: 400 }
      );
    }

    const itemsToInsert = [] as any[];
    for (const row of pricingResolution.items) {
      itemsToInsert.push({
        listino_id: targetListinoId,
        profile_id: profileId,
        description: row.description.trim(),
        unit_price: row.unit_price,
        markup_percent: row.markup_percent,
        category: row.category || null,
      });
    }

    // Insert in batches
    const batchSize = 200;
    for (let i = 0; i < itemsToInsert.length; i += batchSize) {
      const batch = itemsToInsert.slice(i, i + batchSize);
      const { error } = await supabase.from('listini_vettoriali').insert(batch.map(item => ({
        profile_id: item.profile_id,
        description: item.description,
        unit_price: item.unit_price,
        markup_percent: item.markup_percent,
        category: item.category,
        listino_id: item.listino_id,
        embedding: null,
        created_at: new Date().toISOString(),
      })));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Kick off embedding job: call internal endpoint to generate embeddings for new listini_vettoriali
    try {
      const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
      await fetch(`${origin}/api/embeddings/bulk-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listinoId: targetListinoId }),
      });
    } catch (e) {
      console.warn('Failed to trigger bulk embeddings', e);
    }

    return NextResponse.json({
      ok: true,
      inserted: itemsToInsert.length,
      listinoId: targetListinoId,
      summary: pricingResolution.summary,
      sourceDiagnostics,
      pricingDiagnostics: pricingResolution.diagnostics,
    });
  } catch (err: any) {
    // #region debug-point C:route-catch
    await reportDebugEvent({
      runId: 'pre-fix',
      hypothesisId: 'C',
      location: 'web/app/api/listini/upload/route.ts:POST:catch',
      msg: '[DEBUG] Upload route threw',
      data: {
        error: err?.message || String(err),
        stack: err?.stack?.slice?.(0, 1000) || null,
      },
    });
    // #endregion
    console.error('Upload listini error:', err);
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
