import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../../lib/supabase-server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = supabaseAdmin;

export async function POST(req: Request) {
  try {
    const { query, k = 8 } = await req.json();
    if (!query) return NextResponse.json({ error: 'query required' }, { status: 400 });

    // Create embedding for query
    const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    const resp = await openai.embeddings.create({ model, input: query });
    const qEmbedding = resp.data?.[0]?.embedding;
    if (!qEmbedding) return NextResponse.json({ error: 'no embedding returned' }, { status: 500 });

    // Call Postgres function to perform k-NN search (function must be added via migration)
    const { data, error } = await supabase.rpc('search_listini', { query_embedding: qEmbedding, limit_k: k });
    if (error) {
      console.error('Search RPC error:', error);
      return NextResponse.json({ error: error.message || 'Search failed' }, { status: 500 });
    }

    return NextResponse.json({ results: data });
  } catch (err: any) {
    console.error('Semantic search error:', err);
    return NextResponse.json({ error: err.message || 'Semantic search failed' }, { status: 500 });
  }
}
