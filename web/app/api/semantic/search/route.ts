import { enforceAiQuota } from '../../../../lib/aiQuota';
import { NextResponse } from 'next/server';
import {
  getRequestUser,
  unauthorizedResponse,
  requireActiveSubscription,
} from '../../../../lib/apiAuth';
import { openai } from '../../../../lib/openaiServer';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { getListinoProfileIds } from '../../../../lib/listinoAccess';

const supabase = supabaseAdmin;
const MAX_QUERY_LENGTH = 500;

export async function POST(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const notEntitled = await requireActiveSubscription(user.id);
    if (notEntitled) return notEntitled;
    const quotaExceeded = await enforceAiQuota(user.id, 'semantic');
    if (quotaExceeded) return quotaExceeded;
    const { query, k = 8 } = await req.json();
    if (typeof query !== 'string' || !query.trim() || query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json({ error: 'Ricerca non valida' }, { status: 400 });
    }

    // Create embedding for query
    const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    const resp = await openai.embeddings.create({ model, input: query });
    const qEmbedding = resp.data?.[0]?.embedding;
    if (!qEmbedding) {
      return NextResponse.json({ error: 'no embedding returned' }, { status: 500 });
    }

    // Call Postgres function to perform k-NN search (function must be added via migration)
    // Solo i listini dell'utente: search_listini non filtra per profilo
    const limitK = Math.min(Math.max(Number(k) || 8, 1), 50);
    const { data, error } = await supabase.rpc('match_listini_profiles', {
      query_embedding: qEmbedding,
      match_threshold: 0,
      match_count: limitK,
      p_profile_ids: await getListinoProfileIds(user.id),
    });
    if (error) {
      console.error('Search RPC error:', error.code);
      return NextResponse.json({ error: 'Ricerca non riuscita' }, { status: 500 });
    }

    const itemIds = (data || []).map((item: { id: string }) => item.id).filter(Boolean);
    const { data: metadataRows } = await supabase
      .from('listini_vettoriali')
      .select('id, listino_id, category, listini(name)')
      .in('id', itemIds);

    const metadataMap = new Map(
      (metadataRows || []).map((row) => {
        const relatedListino = row.listini as
          { name?: string } | { name?: string }[] | null;
        const listinoName = Array.isArray(relatedListino)
          ? (relatedListino[0]?.name ?? null)
          : (relatedListino?.name ?? null);

        return [
          row.id,
          {
            listino_id: row.listino_id,
            category: row.category,
            listino_name: listinoName,
          },
        ];
      })
    );

    return NextResponse.json({
      results: (data || []).map((item: { id: string; [key: string]: unknown }) => ({
        ...item,
        ...(metadataMap.get(item.id) || {}),
      })),
    });
  } catch (err: any) {
    console.error('Semantic search error:', err?.status ?? 'unknown');
    return NextResponse.json({ error: 'Ricerca non riuscita' }, { status: 500 });
  }
}
