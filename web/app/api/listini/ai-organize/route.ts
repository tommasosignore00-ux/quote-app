import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { resolveImportPricing } from '../../../../lib/listinoPricing';
import { getListinoSourceMetadata } from '../../../../lib/listinoSourceStorage';
import type { UniversalImportResult } from '../../../../lib/listinoUniversalImport';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

    const { data: rows, error: rowsError } = await supabase
      .from('listini_vettoriali')
      .select('id, description, category')
      .eq('listino_id', listinoId)
      .eq('profile_id', profileId)
      .order('created_at', { ascending: true });

    if (rowsError) {
      return NextResponse.json({ error: rowsError.message }, { status: 500 });
    }

    let sourceRows = (rows || []).filter((row) => row.description?.trim());
    const sourceMetadata = await getListinoSourceMetadata({ profileId, listinoId });
    const candidateItems = sourceMetadata?.candidateItems || [];
    let importedCount = 0;
    let usedStoredSource = false;
    let pricingDiagnostics = sourceMetadata?.pricingDiagnostics || null;

    if (candidateItems.length) {
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

      const existingDescriptions = new Set(sourceRows.map((row) => normalizeDescriptionKey(row.description)));
      const rowsToImport = pricingResolution.items.filter((row) => {
        const key = normalizeDescriptionKey(row.description);
        if (!key || existingDescriptions.has(key)) return false;
        existingDescriptions.add(key);
        return true;
      });

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

        importedCount = itemsToInsert.length;

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

        const { data: refreshedRows, error: refreshedRowsError } = await supabase
          .from('listini_vettoriali')
          .select('id, description, category')
          .eq('listino_id', listinoId)
          .eq('profile_id', profileId)
          .order('created_at', { ascending: true });

        if (refreshedRowsError) {
          return NextResponse.json({ error: refreshedRowsError.message }, { status: 500 });
        }

        sourceRows = (refreshedRows || []).filter((row) => row.description?.trim());
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
    console.error('AI organize listino error:', err);
    return NextResponse.json({ error: (err as Error).message || 'AI organize failed' }, { status: 500 });
  }
}
