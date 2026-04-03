import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import OpenAI from 'openai';

const supabase = supabaseAdmin;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { listinoId } = await req.json();
    if (!listinoId) return NextResponse.json({ error: 'listinoId required' }, { status: 400 });

    // Fetch unembedded items
    const { data: rows, error } = await supabase.from('listini_vettoriali').select('id,description').eq('listino_id', listinoId).is('embedding', null).limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    for (const row of rows || []) {
      try {
        const resp = await openai.embeddings.create({ model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small', input: row.description });
        const embedding = resp.data?.[0]?.embedding || null;
        if (embedding) {
          await supabase.from('listini_vettoriali').update({ embedding }).eq('id', row.id);
        }
      } catch (e) {
        console.warn('Embedding error for row', row.id, e);
      }
    }

    return NextResponse.json({ ok: true, processed: rows?.length || 0 });
  } catch (err: any) {
    console.error('bulk generate embeddings error', err);
    return NextResponse.json({ error: err.message || 'failed' }, { status: 500 });
  }
}
