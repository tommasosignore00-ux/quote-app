import { supabaseAdmin } from './supabase-server';
import OpenAI from 'openai';

const supabase = supabaseAdmin;
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function bulkGenerateEmbeddingsForListino(params: { listinoId: string }) {
  const { listinoId } = params;
  if (!listinoId) {
    return { ok: false, processed: 0, error: 'listinoId required' };
  }
  if (!openai) {
    return { ok: false, processed: 0, error: 'OPENAI_API_KEY missing' };
  }

  let processed = 0;
  const batchSize = 200;

  while (true) {
    const { data: rows, error } = await supabase
      .from('listini_vettoriali')
      .select('id,description')
      .eq('listino_id', listinoId)
      .is('embedding', null)
      .limit(batchSize);

    if (error) return { ok: false, processed, error: error.message };
    if (!rows?.length) break;

    for (const row of rows) {
      try {
        const resp = await openai.embeddings.create({
          model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
          input: row.description,
        });
        const embedding = resp.data?.[0]?.embedding || null;
        if (embedding) {
          await supabase.from('listini_vettoriali').update({ embedding }).eq('id', row.id);
        }
        processed++;
      } catch (e) {
        console.warn('Embedding error for row', row.id, e);
      }
    }
  }

  return { ok: true, processed };
}
