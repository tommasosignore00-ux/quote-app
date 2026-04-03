import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
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

    const best = items[0];
    const similarity = best.similarity || 0;
    
    // Accept any match above 0.6 threshold
    if (similarity >= 0.6) {
      return NextResponse.json({ item: best, alternatives: items.slice(1, 4) });
    }

    // Return best match even if below threshold (let frontend decide)
    return NextResponse.json({ item: best, alternatives: items.slice(1, 4) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
