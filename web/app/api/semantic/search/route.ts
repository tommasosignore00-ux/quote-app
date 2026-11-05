import { NextResponse } from 'next/server';
import { getRequestUser, unauthorizedResponse } from '../../../../lib/apiAuth';
import { openai } from '../../../../lib/openaiServer';
import { supabaseAdmin } from '../../../../lib/supabase-server';

const supabase = supabaseAdmin;

export async function POST(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const { query, k = 8 } = await req.json();
    if (!query) return NextResponse.json({ error: 'query required' }, { status: 400 });

    // Create embedding for query
    const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    const resp = await openai.embeddings.create({ model, input: query });
    const qEmbedding = resp.data?.[0]?.embedding;
    if (!qEmbedding)
      {return NextResponse.json({ error: 'no embedding returned' }, { status: 500 });}

    // Call Postgres function to perform k-NN search (function must be added via migration)
    // Solo i listini dell'utente: search_listini non filtra per profilo
    const limitK = Math.min(Math.max(Number(k) || 8, 1), 50);
    const { data, error } = await supabase.rpc('match_listini', {
      query_embedding: qEmbedding,
      match_threshold: 0,
      match_count: limitK,
      p_profile_id: user.id,
    });
    if (error) {
      console.error('Search RPC error:', error);
      return NextResponse.json(
        { error: error.message || 'Search failed' },
        { status: 500 }
      );
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
    console.error('Semantic search error:', err);
    return NextResponse.json(
      { error: err.message || 'Semantic search failed' },
      { status: 500 }
    );
  }
}
