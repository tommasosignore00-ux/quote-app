import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../../lib/supabase-server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = supabaseAdmin;

export async function POST(req: Request) {
  try {
    const { text, metadata } = await req.json();
    if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });

    const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    const resp = await openai.embeddings.create({ model, input: text });
    const embedding = resp.data?.[0]?.embedding;
    if (!embedding) return NextResponse.json({ error: 'no embedding returned' }, { status: 500 });

    // Insert into listini_vettoriali (or return embedding)
    try {
      const insert = await supabase.from('listini_vettoriali').insert({
        title: (metadata?.title) || null,
        description: (metadata?.description) || text,
        price: metadata?.price || null,
        listino_id: metadata?.listino_id || null,
        embedding: embedding,
        created_at: new Date(),
      });
      if (insert.error) console.warn('Embedding insert warning', insert.error);
    } catch (e) {
      console.warn('Could not persist embedding:', e);
    }

    return NextResponse.json({ embedding });
  } catch (err: any) {
    console.error('Embedding error:', err);
    return NextResponse.json({ error: err.message || 'Embedding failed' }, { status: 500 });
  }
}
