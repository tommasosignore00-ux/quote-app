import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import * as XLSX from 'xlsx';
import {
  mergeUniversalImportResults,
  parseUniversalCsvText,
  parseUniversalPdfText,
  parseUniversalSpreadsheetRows,
} from '../../../../lib/listinoUniversalImport';

const supabase = supabaseAdmin;

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

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const listinoName = formData.get('listinoName') as string | null;
    const profileId = formData.get('profileId') as string | null;
    const listinoId = formData.get('listinoId') as string | null;

    if (!file || !profileId) return NextResponse.json({ error: 'Missing file or profileId' }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const ext = file.name.split('.').pop()?.toLowerCase();
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
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = (pdfParseModule as any).default || pdfParseModule;
      const pdfData = await pdfParse(Buffer.from(arrayBuffer));
      parsed = parseUniversalPdfText(pdfData.text || '');
      sourceDiagnostics = [
        {
          sourceName: file.name,
          selected: true,
          parsedRows: parsed.summary.parsedRows,
          totalRows: parsed.summary.totalRows,
          score: parsed.summary.parsedRows > 0 ? 100 : 0,
          reason: parsed.summary.parsedRows > 0 ? null : 'PDF senza testo utile o senza prezzi riconoscibili',
        },
      ];
    } else {
      parsed = parseUniversalCsvText(Buffer.from(arrayBuffer).toString('utf-8'));
      sourceDiagnostics = [
        {
          sourceName: file.name,
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
            ? 'Nessuna voce valida trovata nel PDF. Se e un PDF scansito o fotografico, serve OCR oppure un PDF con testo selezionabile.'
            : 'Nessuna riga valida trovata nel file. Verifica che esistano almeno una colonna descrizione e una colonna prezzo.',
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

    const itemsToInsert = [] as any[];
    for (const row of parsed.items) {
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
      summary: parsed.summary,
      sourceDiagnostics,
    });
  } catch (err: any) {
    console.error('Upload listini error:', err);
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
