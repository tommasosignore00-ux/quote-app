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
import { scheduleEmbeddingsForListino } from '../../../../lib/bulkGenerateEmbeddings';
import {
  LISTINO_PARSER_VERSION,
  applyGroupPricesToListino,
  loadPricingGroups,
} from '../../../../lib/listinoPricingGroups';
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

const CATEGORIZE_CHUNK_SIZE = 100;
const CATEGORIZE_CONCURRENCY = 8;
// Stop starting new AI chunks after this, so the request ends well before the
// 300 s function limit; the remaining rows keep their category until the next run.
const CATEGORIZE_TIME_BUDGET_MS = 150_000;
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
  deadline: number;
}) {
  const chunks = chunkArray(params.rows, CATEGORIZE_CHUNK_SIZE);
  const updates: Array<{ id: string; category: string }> = [];
  let skippedRows = 0;
  let failedChunks = 0;
  if (!chunks.length) return { updates, chunkCount: 0, skippedRows, failedChunks };

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
        if (Date.now() > params.deadline) {
          skippedRows += chunk.length;
          continue;
        }
        try {
          updates.push(
            ...(await categorizeChunk({
              listinoName: params.listinoName,
              chunk,
              knownCategories,
            }))
          );
        } catch (chunkError) {
          // One failed chunk must not throw away the categories of all the others.
          console.warn('AI categorization chunk failed:', chunkError);
          failedChunks++;
          skippedRows += chunk.length;
        }
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

  return { updates, chunkCount: chunks.length, skippedRows, failedChunks };
}

// Reprocessing a large PDF, saving hundreds of rows and categorizing them can take
// well over the default function timeout on Vercel.
export const maxDuration = 300;

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const { listinoId, profileId: claimedProfileId } = await req.json();
    if (!isOwnProfile(user, claimedProfileId)) return forbiddenResponse();
    const profileId = user.id;
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

    if (
      // Re-read the PDF when it was never parsed or was parsed by an older parser.
      (!candidateItems.length ||
        Number(sourceMetadata?.parserVersion || 1) < LISTINO_PARSER_VERSION) &&
      sourceMetadata?.storagePath &&
      /pdf/i.test(String(sourceMetadata.mimeType || ''))
    ) {
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
          });
        }
      } catch (downloadErr: any) {
        rebuildResult = {
          ok: false,
          status: 500,
          error: downloadErr?.message || String(downloadErr),
        };
      }

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

    // Catalogue without prices: items come only from the "Prezzi per forma" section.
    let pricingGroupsCount = 0;
    let pendingPricingGroups = 0;
    const groupedCandidates = candidateItems.filter((item) => item.pricing_group);
    if (groupedCandidates.length) {
      const groups = await loadPricingGroups({ listinoId, profileId });
      const applied = await applyGroupPricesToListino({
        listinoId,
        profileId,
        candidates: groupedCandidates,
        groups,
      });
      importedCount += applied.inserted;
      pricingGroupsCount = groups.length;
      pendingPricingGroups = applied.pendingGroups;
      usedStoredSource = true;
      pricingDiagnostics = null;
      sourceRows = await fetchListinoRows({ listinoId, profileId });
    }

    if (candidateItems.length && !groupedCandidates.length) {
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

      const existingDescriptions = new Set(
        sourceRows.map((row) => normalizeListinoDescriptionKey(row.description))
      );
      const rowsToImport = pricingResolution.items.filter((row) => {
        const key = normalizeListinoDescriptionKey(row.description);
        if (!key || existingDescriptions.has(key)) return false;
        existingDescriptions.add(key);
        return true;
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

        // Embeddings are generated after the response, so the user doesn't wait for them.
        scheduleEmbeddingsForListino(listinoId);

        sourceRows = await fetchListinoRows({ listinoId, profileId });
      }
    }

    if (!sourceRows.length) {
      return NextResponse.json({
        ok: true,
        updatedCount: importedCount,
        processedCount: candidateItems.length,
        importedCount,
        usedStoredSource,
        aiFeedback: sourceMetadata?.aiFeedback || null,
        pricingDiagnostics,
        pricingGroups: pricingGroupsCount,
        pendingPricingGroups,
      });
    }

    // Categories are a nicety: if OpenAI fails the imported items must still be reported.
    let warning: string | null = null;
    let updatedCount = 0;
    let chunkCount = 0;
    try {
      const categorized = await categorizeAllRows({
        listinoName: listino.name,
        // Items of a catalogue shape keep the shape name as category, always spelled the
        // same: the AI must not rename them ("Piatti laminati" vs "Piatti laminati trafilati").
        rows: sourceRows
          .filter((item) => !item.pricing_group)
          .map((item) => ({
            id: item.id,
            description: item.description,
            category: item.category || null,
          })),
        deadline: startedAt + CATEGORIZE_TIME_BUDGET_MS,
      });
      chunkCount = categorized.chunkCount;
      updatedCount = await applyListinoCategories({
        listinoId,
        profileId,
        updates: categorized.updates,
      });
      if (categorized.skippedRows) {
        warning = `Categorie aggiornate per ${updatedCount} voci; ${categorized.skippedRows} restano con la categoria attuale${
          categorized.failedChunks
            ? ' (alcune richieste AI non sono riuscite)'
            : ' (tempo esaurito)'
        }. Rilancia "Riorganizza con AI" per completarle.`;
      }
    } catch (categorizeError) {
      console.warn('AI categorization failed:', categorizeError);
      warning =
        `Categorie AI non aggiornate: ${(categorizeError as Error).message || 'errore AI'}`.slice(
          0,
          300
        );
    }

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
      pricingGroups: pricingGroupsCount,
      pendingPricingGroups,
    });
  } catch (err) {
    console.error('AI organize listino error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'AI organize failed' },
      { status: 500 }
    );
  }
}
