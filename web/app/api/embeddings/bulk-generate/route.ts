import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import OpenAI from 'openai';

const supabase = supabaseAdmin;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { listinoId } = await req.json();
    if (!listinoId) return NextResponse.json({ error: 'listinoId required' }, { status: 400 });

    let processed = 0;
    const batchSize = 200;

    while (true) {
      const { data: rows, error } = await supabase
        .from('listini_vettoriali')
        .select('id,description')
        .eq('listino_id', listinoId)
        .is('embedding', null)
        .limit(batchSize);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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

    return NextResponse.json({ ok: true, processed });
  } catch (err: any) {
    console.error('bulk generate embeddings error', err);
    return NextResponse.json({ error: err.message || 'failed' }, { status: 500 });
  }
}
