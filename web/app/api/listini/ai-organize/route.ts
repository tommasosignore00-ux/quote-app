import { NextResponse } from 'next/server';
import {
  getRequestUser,
  unauthorizedResponse,
  forbiddenResponse,
  isOwnProfile,
} from '../../../../lib/apiAuth';
import OpenAI from 'openai';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { resolveImportPricing } from '../../../../lib/listinoPricing';
import {
  LISTINO_SOURCE_BUCKET,
  getListinoSourceMetadata,
} from '../../../../lib/listinoSourceStorage';
import type { UniversalImportResult } from '../../../../lib/listinoUniversalImport';
import {
  processListinoImport,
  type ProcessListinoImportResult,
} from '../../../../lib/listinoImportShared';
import {
  reportDebugEvent,
  getActiveDebugRunId,
} from '../../../../lib/listinoDebugShared';
import { bulkGenerateEmbeddingsForListino } from '../../../../lib/bulkGenerateEmbeddings';
import {
  applyListinoCategories,
  fetchAllListinoRows,
  normalizeListinoDescriptionKey,
  saveListinoItems,
} from '../../../../lib/listinoItemsStore';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
const supabase = supabaseAdmin;

type AiCategoryResponse = {
  items?: Array<{
    id?: string;
    category?: string;
  }>;
};

function chunkArray<T>(items: T[], size: number): T[][];
function chunkArray<T>(items: T[], size: number): Array<T[]> {
  const chunks: Array<T[]> = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function normalizeCategory(value: unknown): string | null {
  const text = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!text) return null;
  return text.slice(0, 80);
}

const CATEGORIZE_CHUNK_SIZE = 80;
const CATEGORIZE_CONCURRENCY = 4;
const MAX_KNOWN_CATEGORIES = 60;

async function fetchListinoRows(params: { listinoId: string; profileId: string }) {
  const rows = await fetchAllListinoRows(params);
  return rows.filter((row) => row.description?.trim());
}

async function categorizeChunk(params: {
  listinoName: string;
  chunk: Array<{ id: string; description: string; category: string | null }>;
  knownCategories?: string[];
}): Promise<Array<{ id: string; category: string }>> {
  if (!openai) throw new Error('OPENAI_API_KEY missing');
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_AGENT_MODEL || 'gpt-4o-mini',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Sei un assistente che organizza voci di prezzari. Per ogni voce devi restituire una categoria breve e coerente in italiano. ' +
          'Usa categorie di 1-4 parole, senza codici, senza spiegazioni, senza inventare dettagli tecnici. ' +
          'Se esiste gia una categoria valida, puoi mantenerla o migliorarla leggermente. ' +
          'Restituisci solo JSON nel formato {"items":[{"id":"...","category":"..."}]}.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          listino_name: params.listinoName,
          instructions: [
            'Raggruppa le voci in categorie utili per un utente che deve scegliere materiali durante un lavoro.',
            'Mantieni categorie coerenti tra voci simili.',
            'Se il listino suggerisce un dominio specifico, usalo come contesto.',
            'Se una delle known_categories va bene, riusala identica (stesse parole e maiuscole) invece di crearne una nuova simile.',
          ],
          known_categories: params.knownCategories || [],
          items: params.chunk.map((item) => ({
            id: item.id,
            description: item.description,
            current_category: item.category,
          })),
        }),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  let parsed: AiCategoryResponse;
  try {
    parsed = JSON.parse(raw) as AiCategoryResponse;
  } catch (error) {
    throw new Error(`AI ha restituito JSON non valido: ${String(error)}`);
  }

  const allowedIds = new Set(params.chunk.map((item) => item.id));
  return (parsed.items || [])
    .map((item) => ({
      id: String(item.id || ''),
      category: normalizeCategory(item.category) || '',
    }))
    .filter((item) => item.id && item.category && allowedIds.has(item.id));
}

function mostUsedCategories(
  categories: Array<string | null | undefined>,
  limit: number
): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const value of categories) {
    const label = normalizeCategory(value);
    if (!label) continue;
    const key = label.toLowerCase();
    const entry = counts.get(key) || { label, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((entry) => entry.label);
}

// Categorizes every row so that chunks share the same vocabulary: the first chunk
// seeds the categories, the others run in parallel reusing them.
async function categorizeAllRows(params: {
  listinoName: string;
  rows: Array<{ id: string; description: string; category: string | null }>;
}) {
  const chunks = chunkArray(params.rows, CATEGORIZE_CHUNK_SIZE);
  const updates: Array<{ id: string; category: string }> = [];
  if (!chunks.length) return { updates, chunkCount: 0 };

  const seedUpdates = await categorizeChunk({
    listinoName: params.listinoName,
    chunk: chunks[0],
    knownCategories: mostUsedCategories(
      params.rows.map((row) => row.category),
      MAX_KNOWN_CATEGORIES
    ),
  });
  updates.push(...seedUpdates);

  const knownCategories = mostUsedCategories(
    [
      ...seedUpdates.map((item) => item.category),
      ...params.rows.map((row) => row.category),
    ],
    MAX_KNOWN_CATEGORIES
  );

  const rest = chunks.slice(1);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CATEGORIZE_CONCURRENCY, rest.length) }, async () => {
      while (cursor < rest.length) {
        const chunk = rest[cursor++];
        updates.push(
          ...(await categorizeChunk({
            listinoName: params.listinoName,
            chunk,
            knownCategories,
          }))
        );
      }
    })
  );

  // Collapse case-only variants ("Tubi rame" / "tubi rame") onto the first label seen.
  const canonicalLabel = new Map<string, string>();
  for (const update of updates) {
    const key = update.category.toLowerCase();
    if (!canonicalLabel.has(key)) canonicalLabel.set(key, update.category);
    update.category = canonicalLabel.get(key)!;
  }

  return { updates, chunkCount: chunks.length };
}

// Reprocessing a large PDF, saving hundreds of rows and categorizing them can take
// well over the default function timeout on Vercel.
export const maxDuration = 300;

export async function POST(req: Request) {
  const runId = getActiveDebugRunId('ai-organize');
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const { listinoId, profileId: claimedProfileId } = await req.json();
    if (!isOwnProfile(user, claimedProfileId)) return forbiddenResponse();
    const profileId = user.id;
    await reportDebugEvent({
      runId,
      hypothesisId: 'E',
      location: 'web/app/api/listini/ai-organize/route.ts:POST:start',
      msg: '[DEBUG] AI organize request received',
      data: { listinoId, profileId },
    });
    if (!listinoId || !profileId) {
      return NextResponse.json(
        { error: 'listinoId e profileId sono obbligatori' },
        { status: 400 }
      );
    }

    const { data: listino, error: listinoError } = await supabase
      .from('listini')
      .select('id, name')
      .eq('id', listinoId)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (listinoError) {
      return NextResponse.json({ error: listinoError.message }, { status: 500 });
    }
    if (!listino) {
      return NextResponse.json({ error: 'Listino non trovato' }, { status: 404 });
    }

    let sourceRows = await fetchListinoRows({ listinoId, profileId });
    let sourceMetadata = await getListinoSourceMetadata({ profileId, listinoId });
    let candidateItems = sourceMetadata?.candidateItems || [];
    let importedCount = 0;
    let usedStoredSource = false;
    let pricingDiagnostics = sourceMetadata?.pricingDiagnostics || null;

    await reportDebugEvent({
      runId,
      hypothesisId: 'D',
      location: 'web/app/api/listini/ai-organize/route.ts:POST:source-metadata',
      msg: '[DEBUG] Loaded source metadata for AI organize',
      data: {
        sourceRowsCount: sourceRows.length,
        candidateItemsCount: candidateItems.length,
        parsedRows: sourceMetadata?.parsedSummary?.parsedRows ?? null,
        pendingReferenceRows: sourceMetadata?.parsedSummary?.pendingReferenceRows ?? null,
        requiresPricingRules: sourceMetadata?.requiresPricingRules ?? null,
      },
    });

    if (
      !candidateItems.length &&
      sourceMetadata?.storagePath &&
      /pdf/i.test(String(sourceMetadata.mimeType || ''))
    ) {
      await reportDebugEvent({
        runId,
        hypothesisId: 'D',
        location: 'web/app/api/listini/ai-organize/route.ts:POST:stale-source-reprocess',
        msg: '[DEBUG] Reprocessing stored PDF source because metadata has no candidates',
        data: {
          storagePath: sourceMetadata.storagePath,
          fileName: sourceMetadata.fileName,
          sourceRowsCount: sourceRows.length,
        },
      });

      let rebuildResult: ProcessListinoImportResult = {
        ok: false,
        status: 500,
        error: 'reprocess not run',
      };
      try {
        const sourceDownload = await supabase.storage
          .from(LISTINO_SOURCE_BUCKET)
          .download(sourceMetadata.storagePath);

        if (sourceDownload.error) {
          rebuildResult = { ok: false, status: 500, error: sourceDownload.error.message };
        } else {
          const arrayBuffer = await sourceDownload.data.arrayBuffer();
          rebuildResult = await processListinoImport({
            profileId,
            listinoId,
            listinoName: listino.name,
            originalFileName: sourceMetadata.fileName,
            uploadedFileName:
              sourceMetadata.fileName ||
              sourceMetadata.storagePath.split('/').pop() ||
              'source.pdf',
            uploadedFileType: sourceMetadata.mimeType || 'application/pdf',
            arrayBuffer,
            sourceOnly: true,
            runId,
          });
        }
      } catch (downloadErr: any) {
        rebuildResult = {
          ok: false,
          status: 500,
          error: downloadErr?.message || String(downloadErr),
        };
      }

      await reportDebugEvent({
        runId,
        hypothesisId: 'D',
        location:
          'web/app/api/listini/ai-organize/route.ts:POST:stale-source-reprocess-response',
        msg: '[DEBUG] Stored PDF source reprocess completed',
        data: {
          ok: rebuildResult.ok,
          status: rebuildResult.status,
          inserted: rebuildResult.inserted || 0,
          parsedRows: rebuildResult.summary?.parsedRows || 0,
          pendingReferenceRows: rebuildResult.summary?.pendingReferenceRows || 0,
          error: rebuildResult.error || null,
        },
      });

      if (!rebuildResult.ok) {
        return NextResponse.json(
          { error: rebuildResult.error || 'Rigenerazione sorgente PDF non riuscita' },
          { status: rebuildResult.status || 500 }
        );
      }

      importedCount += Number(rebuildResult.inserted || 0);
      // Use the metadata returned by the rebuild: reading metadata.json back right after
      // writing it can return the old cached copy (0 candidates -> "0 voci aggiornate").
      sourceMetadata =
        rebuildResult.storedSource ||
        (await getListinoSourceMetadata({ profileId, listinoId }));
      candidateItems = sourceMetadata?.candidateItems || [];
      pricingDiagnostics =
        sourceMetadata?.pricingDiagnostics || rebuildResult.pricingDiagnostics || null;
      usedStoredSource = Boolean(candidateItems.length || importedCount);
      sourceRows = await fetchListinoRows({ listinoId, profileId });
    }

    if (candidateItems.length) {
      const candidatesWithBasis = candidateItems.filter(
        (item) => item.pricing_basis_unit && (item.pricing_basis_quantity || 0) > 0
      );
      const candidatesWithRuleKey = candidateItems.filter(
        (item) => item.inferred_rule_key
      );
      const candidatesWithPrice = candidateItems.filter((item) => item.unit_price > 0);
      await reportDebugEvent({
        runId,
        hypothesisId: 'A',
        location: 'web/app/api/listini/ai-organize/route.ts:POST:candidate-quality',
        msg: '[DEBUG] Candidate item quality snapshot',
        data: {
          totalCandidates: candidateItems.length,
          withPricingBasis: candidatesWithBasis.length,
          withRuleKey: candidatesWithRuleKey.length,
          withDirectPrice: candidatesWithPrice.length,
          sample: candidateItems.slice(0, 5).map((item) => ({
            description: item.description,
            pricing_basis_unit: item.pricing_basis_unit || null,
            pricing_basis_quantity: item.pricing_basis_quantity || null,
            inferred_rule_key: item.inferred_rule_key || null,
            unit_price: item.unit_price || 0,
          })),
        },
      });
      const parsed: UniversalImportResult = {
        items: candidateItems,
        summary: sourceMetadata?.parsedSummary || {
          totalRows: candidateItems.length,
          parsedRows: candidateItems.length,
          skippedRows: 0,
          normalizedPriceRows: candidateItems.filter((item) => item.unit_price > 0)
            .length,
          unitDetectedRows: candidateItems.filter((item) => item.pricing_basis_unit)
            .length,
          pendingReferenceRows: candidateItems.filter(
            (item) => item.pricing_status === 'needs_reference'
          ).length,
        },
      };

      const pricingResolution = await resolveImportPricing({ profileId, parsed });
      pricingDiagnostics = pricingResolution.diagnostics;
      usedStoredSource = true;

      await reportDebugEvent({
        runId,
        hypothesisId: 'B',
        location: 'web/app/api/listini/ai-organize/route.ts:POST:pricing-resolution',
        msg: '[DEBUG] Pricing resolution completed on PDF candidates',
        data: {
          resolvedCount: pricingResolution.items.length,
          unresolvedCount: pricingResolution.unresolvedItems.length,
          resolvedFromFile: pricingResolution.diagnostics.resolvedFromFile,
          resolvedFromDerived: pricingResolution.diagnostics.resolvedFromDerived,
          resolvedFromRule: pricingResolution.diagnostics.resolvedFromRule,
          recommendedRules: pricingResolution.diagnostics.recommendedRules,
          unresolvedExamples: pricingResolution.diagnostics.unresolvedExamples,
          resolvedSample: pricingResolution.items.slice(0, 5).map((item) => ({
            description: item.description,
            unit_price: item.unit_price,
            pricing_source: item.pricing_source,
            pricing_basis_unit: item.pricing_basis_unit || null,
            inferred_rule_key: item.inferred_rule_key || null,
          })),
        },
      });

      const existingDescriptions = new Set(
        sourceRows.map((row) => normalizeListinoDescriptionKey(row.description))
      );
      const rowsToImport = pricingResolution.items.filter((row) => {
        const key = normalizeListinoDescriptionKey(row.description);
        if (!key || existingDescriptions.has(key)) return false;
        existingDescriptions.add(key);
        return true;
      });

      await reportDebugEvent({
        runId,
        hypothesisId: 'C',
        location: 'web/app/api/listini/ai-organize/route.ts:POST:dedupe-filter',
        msg: '[DEBUG] Candidate rows filtered before insert',
        data: {
          existingRowsCount: sourceRows.length,
          resolvedRowsCount: pricingResolution.items.length,
          rowsToImportCount: rowsToImport.length,
          droppedAsExistingCount: pricingResolution.items.length - rowsToImport.length,
          rowsToImportSample: rowsToImport.slice(0, 5).map((row) => ({
            description: row.description,
            unit_price: row.unit_price,
            pricing_source: row.pricing_source,
          })),
        },
      });

      if (rowsToImport.length) {
        // Only new descriptions are added here: prices already in the listino
        // (possibly edited by the user) are not overwritten by rule-derived ones.
        const saved = await saveListinoItems({
          listinoId,
          profileId,
          items: rowsToImport,
          existingRows: sourceRows,
        });

        importedCount += saved.inserted;

        try {
          await bulkGenerateEmbeddingsForListino({ listinoId });
        } catch (e) {
          console.warn('Failed to trigger bulk embeddings', e);
        }

        sourceRows = await fetchListinoRows({ listinoId, profileId });
      }
    }

    if (!sourceRows.length) {
      await reportDebugEvent({
        runId,
        hypothesisId: 'E',
        location: 'web/app/api/listini/ai-organize/route.ts:POST:empty-response',
        msg: '[DEBUG] AI organize returning without source rows',
        data: {
          importedCount,
          candidateItemsCount: candidateItems.length,
          usedStoredSource,
          pricingDiagnostics,
        },
      });
      return NextResponse.json({
        ok: true,
        updatedCount: importedCount,
        processedCount: candidateItems.length,
        importedCount,
        usedStoredSource,
        aiFeedback: sourceMetadata?.aiFeedback || null,
        pricingDiagnostics,
      });
    }

    // Categories are a nicety: if OpenAI fails the imported items must still be reported.
    let warning: string | null = null;
    let updatedCount = 0;
    let chunkCount = 0;
    try {
      const categorized = await categorizeAllRows({
        listinoName: listino.name,
        rows: sourceRows.map((item) => ({
          id: item.id,
          description: item.description,
          category: item.category || null,
        })),
      });
      chunkCount = categorized.chunkCount;
      updatedCount = await applyListinoCategories({
        listinoId,
        profileId,
        updates: categorized.updates,
      });
    } catch (categorizeError) {
      console.warn('AI categorization failed:', categorizeError);
      warning =
        `Categorie AI non aggiornate: ${(categorizeError as Error).message || 'errore AI'}`.slice(
          0,
          300
        );
    }

    await reportDebugEvent({
      runId,
      hypothesisId: 'E',
      location: 'web/app/api/listini/ai-organize/route.ts:POST:final-response',
      msg: '[DEBUG] AI organize returning final payload',
      data: {
        processedCount: sourceRows.length,
        updatedCount,
        importedCount,
        usedStoredSource,
        pricingDiagnostics,
      },
    });
    return NextResponse.json({
      ok: true,
      processedCount: sourceRows.length,
      updatedCount,
      importedCount,
      usedStoredSource,
      aiFeedback: sourceMetadata?.aiFeedback || null,
      pricingDiagnostics,
      chunkCount,
      warning,
    });
  } catch (err) {
    await reportDebugEvent({
      runId,
      hypothesisId: 'E',
      location: 'web/app/api/listini/ai-organize/route.ts:POST:catch',
      msg: '[DEBUG] AI organize route failed',
      data: {
        error: (err as Error).message || String(err),
      },
    });
    console.error('AI organize listino error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'AI organize failed' },
      { status: 500 }
    );
  }
}
