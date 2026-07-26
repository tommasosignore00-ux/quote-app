import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { resolveImportPricing } from '../../../../lib/listinoPricing';
import { getListinoSourceMetadata } from '../../../../lib/listinoSourceStorage';
import type { UniversalImportResult } from '../../../../lib/listinoUniversalImport';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = supabaseAdmin;
const DEBUG_SERVER_FALLBACK_URL = 'http://127.0.0.1:7777/event';
const DEBUG_SESSION_ID = 'pdf-no-material';

async function reportDebugEvent(event: {
  runId: 'pre-fix' | 'post-fix';
  hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E';
  location: string;
  msg: string;
  data?: Record<string, unknown>;
}) {
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
        runId: 'post-fix',
        hypothesisId: event.hypothesisId,
        location: event.location,
        msg: event.msg,
        data: event.data || {},
        ts: Date.now(),
      }),
    });
  } catch {}
}

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
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return null;
  return text.slice(0, 80);
}

function normalizeDescriptionKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

async function fetchListinoRows(params: { listinoId: string; profileId: string }) {
  const { data, error } = await supabase
    .from('listini_vettoriali')
    .select('id, description, category')
    .eq('listino_id', params.listinoId)
    .eq('profile_id', params.profileId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).filter((row) => row.description?.trim());
}

async function categorizeChunk(params: {
  listinoName: string;
  chunk: Array<{ id: string; description: string; category: string | null }>;
}): Promise<Array<{ id: string; category: string }>> {
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
          ],
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

  return (parsed.items || [])
    .map((item) => ({
      id: String(item.id || ''),
      category: normalizeCategory(item.category) || '',
    }))
    .filter((item) => item.id && item.category);
}

export async function POST(req: Request) {
  try {
    const { listinoId, profileId } = await req.json();
    // #region debug-point E:route-start
    await reportDebugEvent({
      runId: 'pre-fix',
      hypothesisId: 'E',
      location: 'web/app/api/listini/ai-organize/route.ts:POST:start',
      msg: '[DEBUG] AI organize request received',
      data: { listinoId, profileId },
    });
    // #endregion
    if (!listinoId || !profileId) {
      return NextResponse.json({ error: 'listinoId e profileId sono obbligatori' }, { status: 400 });
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

    // #region debug-point D:source-metadata
    await reportDebugEvent({
      runId: 'pre-fix',
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
    // #endregion

    if (
      !candidateItems.length &&
      sourceMetadata?.storagePath &&
      /pdf/i.test(String(sourceMetadata.mimeType || ''))
    ) {
      // #region debug-point D:stale-source-reprocess
      await reportDebugEvent({
        runId: 'pre-fix',
        hypothesisId: 'D',
        location: 'web/app/api/listini/ai-organize/route.ts:POST:stale-source-reprocess',
        msg: '[DEBUG] Reprocessing stored PDF source because metadata has no candidates',
        data: {
          storagePath: sourceMetadata.storagePath,
          fileName: sourceMetadata.fileName,
          sourceRowsCount: sourceRows.length,
        },
      });
      // #endregion

      const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
      const rebuildResponse = await fetch(`${origin}/api/listini/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          listinoId,
          listinoName: listino.name,
          storagePath: sourceMetadata.storagePath,
          fileName: sourceMetadata.fileName,
          originalFileName: sourceMetadata.fileName,
          mimeType: sourceMetadata.mimeType,
          sourceOnly: true,
        }),
      });

      const rebuildPayload = await rebuildResponse.json().catch(() => ({}));

      // #region debug-point D:stale-source-reprocess-response
      await reportDebugEvent({
        runId: 'pre-fix',
        hypothesisId: 'D',
        location: 'web/app/api/listini/ai-organize/route.ts:POST:stale-source-reprocess-response',
        msg: '[DEBUG] Stored PDF source reprocess completed',
        data: {
          ok: rebuildResponse.ok,
          status: rebuildResponse.status,
          inserted: rebuildPayload?.inserted || 0,
          parsedRows: rebuildPayload?.summary?.parsedRows || 0,
          pendingReferenceRows: rebuildPayload?.summary?.pendingReferenceRows || 0,
          error: rebuildPayload?.error || null,
        },
      });
      // #endregion

      if (!rebuildResponse.ok) {
        return NextResponse.json(
          { error: rebuildPayload?.error || 'Rigenerazione sorgente PDF non riuscita' },
          { status: 500 }
        );
      }

      importedCount += Number(rebuildPayload?.inserted || 0);
      sourceMetadata = await getListinoSourceMetadata({ profileId, listinoId });
      candidateItems = sourceMetadata?.candidateItems || [];
      pricingDiagnostics = sourceMetadata?.pricingDiagnostics || rebuildPayload?.pricingDiagnostics || null;
      usedStoredSource = Boolean(candidateItems.length || importedCount);
      sourceRows = await fetchListinoRows({ listinoId, profileId });
    }

    if (candidateItems.length) {
      const candidatesWithBasis = candidateItems.filter((item) => item.pricing_basis_unit && (item.pricing_basis_quantity || 0) > 0);
      const candidatesWithRuleKey = candidateItems.filter((item) => item.inferred_rule_key);
      const candidatesWithPrice = candidateItems.filter((item) => item.unit_price > 0);
      // #region debug-point A:candidate-quality
      await reportDebugEvent({
        runId: 'pre-fix',
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
      // #endregion
      const parsed: UniversalImportResult = {
        items: candidateItems,
        summary: sourceMetadata?.parsedSummary || {
          totalRows: candidateItems.length,
          parsedRows: candidateItems.length,
          skippedRows: 0,
          normalizedPriceRows: candidateItems.filter((item) => item.unit_price > 0).length,
          unitDetectedRows: candidateItems.filter((item) => item.pricing_basis_unit).length,
          pendingReferenceRows: candidateItems.filter((item) => item.pricing_status === 'needs_reference').length,
        },
      };

      const pricingResolution = await resolveImportPricing({ profileId, parsed });
      pricingDiagnostics = pricingResolution.diagnostics;
      usedStoredSource = true;

      // #region debug-point B:pricing-resolution
      await reportDebugEvent({
        runId: 'pre-fix',
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
      // #endregion

      const existingDescriptions = new Set(sourceRows.map((row) => normalizeDescriptionKey(row.description)));
      const rowsToImport = pricingResolution.items.filter((row) => {
        const key = normalizeDescriptionKey(row.description);
        if (!key || existingDescriptions.has(key)) return false;
        existingDescriptions.add(key);
        return true;
      });

      // #region debug-point C:dedupe-filter
      await reportDebugEvent({
        runId: 'pre-fix',
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
      // #endregion

      if (rowsToImport.length) {
        const itemsToInsert = rowsToImport.map((row) => ({
          listino_id: listinoId,
          profile_id: profileId,
          description: row.description.trim(),
          unit_price: row.unit_price,
          markup_percent: row.markup_percent,
          category: row.category || null,
          embedding: null,
          created_at: new Date().toISOString(),
        }));

        const batchSize = 200;
        for (let i = 0; i < itemsToInsert.length; i += batchSize) {
          const batch = itemsToInsert.slice(i, i + batchSize);
          const { error } = await supabase.from('listini_vettoriali').insert(batch);
          if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
          }
        }

        importedCount += itemsToInsert.length;

        try {
          const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
          await fetch(`${origin}/api/embeddings/bulk-generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ listinoId }),
          });
        } catch (e) {
          console.warn('Failed to trigger bulk embeddings', e);
        }

        sourceRows = await fetchListinoRows({ listinoId, profileId });
      }
    }

    if (!sourceRows.length) {
      // #region debug-point E:empty-response
      await reportDebugEvent({
        runId: 'pre-fix',
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
      // #endregion
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

    const updates: Array<{ id: string; category: string }> = [];
    const chunks = chunkArray(sourceRows, 80);

    for (const chunk of chunks) {
      const aiItems = await categorizeChunk({
        listinoName: listino.name,
        chunk: chunk.map((item) => ({
          id: item.id,
          description: item.description,
          category: item.category || null,
        })),
      });
      updates.push(...aiItems);
    }

    let updatedCount = 0;
    for (const update of updates) {
      const { error } = await supabase
        .from('listini_vettoriali')
        .update({ category: update.category })
        .eq('id', update.id)
        .eq('listino_id', listinoId)
        .eq('profile_id', profileId);

      if (!error) updatedCount++;
    }

    // #region debug-point E:final-response
    await reportDebugEvent({
      runId: 'pre-fix',
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
    // #endregion
    return NextResponse.json({
      ok: true,
      processedCount: sourceRows.length,
      updatedCount,
      importedCount,
      usedStoredSource,
      aiFeedback: sourceMetadata?.aiFeedback || null,
      pricingDiagnostics,
      chunkCount: chunks.length,
    });
  } catch (err) {
    // #region debug-point E:route-error
    await reportDebugEvent({
      runId: 'pre-fix',
      hypothesisId: 'E',
      location: 'web/app/api/listini/ai-organize/route.ts:POST:catch',
      msg: '[DEBUG] AI organize route failed',
      data: {
        error: (err as Error).message || String(err),
      },
    });
    // #endregion
    console.error('AI organize listino error:', err);
    return NextResponse.json({ error: (err as Error).message || 'AI organize failed' }, { status: 500 });
  }
}
