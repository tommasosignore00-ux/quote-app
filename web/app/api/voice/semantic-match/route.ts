import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '../../../../lib/supabase-server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = supabaseAdmin;

export async function POST(req: Request) {
  try {
    const { query, profileId } = await req.json();
    if (!query || !profileId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

    const embeddingRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    const embedding = embeddingRes.data[0].embedding;

    const { data: items } = await supabase.rpc('match_listini', {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: 5,
      p_profile_id: profileId,
    });

    if (!items || items.length === 0) {
      return NextResponse.json({ item: null, alternatives: [] });
    }

    const itemIds = items.map((item: { id: string }) => item.id).filter(Boolean);
    const { data: metadataRows } = await supabase
      .from('listini_vettoriali')
      .select('id, listino_id, category, listini(name)')
      .in('id', itemIds);

    const metadataMap = new Map(
      (metadataRows || []).map((row) => {
        const relatedListino = row.listini as { name?: string } | { name?: string }[] | null;
        const listinoName = Array.isArray(relatedListino)
          ? relatedListino[0]?.name ?? null
          : relatedListino?.name ?? null;

        return [row.id, { listino_id: row.listino_id, category: row.category, listino_name: listinoName }];
      })
    );

    const normalizedItems = items.map((item: { id: string; [key: string]: unknown }) => ({
      ...item,
      ...(metadataMap.get(item.id) || {}),
    }));

    const best = normalizedItems[0];
    const similarity = best.similarity || 0;
    
    // Accept any match above 0.6 threshold
    if (similarity >= 0.6) {
      return NextResponse.json({ item: best, alternatives: normalizedItems.slice(1, 4) });
    }

    // Return best match even if below threshold (let frontend decide)
    return NextResponse.json({ item: best, alternatives: normalizedItems.slice(1, 4) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
