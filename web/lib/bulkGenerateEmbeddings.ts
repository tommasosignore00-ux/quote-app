import { supabaseAdmin } from './supabase-server';
import OpenAI from 'openai';

const supabase = supabaseAdmin;
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const FETCH_BATCH_SIZE = 200;
// One embeddings request carries many descriptions instead of one call per row.
const EMBED_BATCH_SIZE = 100;
const UPDATE_CONCURRENCY = 10;

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

export async function bulkGenerateEmbeddingsForListino(params: { listinoId: string }) {
  const { listinoId } = params;
  if (!listinoId) {
    return { ok: false, processed: 0, error: 'listinoId required' };
  }
  if (!openai) {
    return { ok: false, processed: 0, error: 'OPENAI_API_KEY missing' };
  }

  let processed = 0;
  let failed = 0;
  // Rows whose embedding failed stay NULL: without skipping them the loop would
  // fetch the same rows forever and the upload request would never return.
  const failedIds = new Set<string>();

  while (true) {
    let query = supabase
      .from('listini_vettoriali')
      .select('id,description')
      .eq('listino_id', listinoId)
      .is('embedding', null)
      .order('id', { ascending: true })
      .limit(FETCH_BATCH_SIZE);

    if (failedIds.size) {
      query = query.not('id', 'in', `(${Array.from(failedIds).join(',')})`);
    }

    const { data: rows, error } = await query;

    if (error) return { ok: false, processed, failed, error: error.message };
    if (!rows?.length) break;

    const processedBefore = processed;
    for (let i = 0; i < rows.length; i += EMBED_BATCH_SIZE) {
      const chunk = rows.slice(i, i + EMBED_BATCH_SIZE);
      let embeddings: Array<number[] | null> = [];
      try {
        const resp = await openai.embeddings.create({
          model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
          input: chunk.map((row) => String(row.description || '').slice(0, 8000) || ' '),
        });
        embeddings = chunk.map(
          (_, index) => resp.data?.find((d) => d.index === index)?.embedding || null
        );
      } catch (e) {
        console.warn('Embedding batch error for listino', listinoId, e);
        embeddings = chunk.map(() => null);
      }

      await runWithConcurrency(
        chunk.map((row, index) => ({ row, embedding: embeddings[index] })),
        UPDATE_CONCURRENCY,
        async ({ row, embedding }) => {
          if (!embedding) {
            failedIds.add(row.id);
            failed++;
            return;
          }
          const { error: updateError } = await supabase
            .from('listini_vettoriali')
            .update({ embedding })
            .eq('id', row.id);
          if (updateError) {
            failedIds.add(row.id);
            failed++;
          } else {
            processed++;
          }
        }
      );
    }

    // A whole round without progress means the provider is failing: stop and let a
    // later run (upload, ai-organize or /api/embeddings/bulk-generate) retry.
    if (processed === processedBefore || failedIds.size > 500) break;
  }

  return { ok: true, processed, failed };
}
