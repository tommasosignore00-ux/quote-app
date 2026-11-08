import { enforceAiQuota } from '../../../../lib/aiQuota';
import { NextResponse } from 'next/server';
import {
  getRequestUser,
  unauthorizedResponse,
  requireActiveSubscription,
} from '../../../../lib/apiAuth';
import { openai } from '../../../../lib/openaiServer';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../../lib/supabase-server';

const supabase = supabaseAdmin;
const MAX_TEXT_LENGTH = 2000;

export async function POST(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const notEntitled = await requireActiveSubscription(user.id);
    if (notEntitled) return notEntitled;
    const quotaExceeded = await enforceAiQuota(user.id, 'semantic');
    if (quotaExceeded) return quotaExceeded;
    const { text, metadata } = await req.json();
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: 'Testo non valido' }, { status: 400 });
    }

    const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    const resp = await openai.embeddings.create({ model, input: text });
    const embedding = resp.data?.[0]?.embedding;
    if (!embedding) {
      return NextResponse.json({ error: 'no embedding returned' }, { status: 500 });
    }

    // Salva solo se il listino appartiene all'utente
    const listinoId = metadata?.listino_id || null;
    if (listinoId) {
      try {
        const { data: ownListino } = await supabase
          .from('listini')
          .select('id')
          .eq('id', listinoId)
          .eq('profile_id', user.id)
          .maybeSingle();
        if (!ownListino) return NextResponse.json({ embedding });

        const insert = await supabase.from('listini_vettoriali').insert({
          title:
            typeof metadata?.title === 'string' ? metadata.title.slice(0, 300) : null,
          description:
            typeof metadata?.description === 'string'
              ? metadata.description.slice(0, MAX_TEXT_LENGTH)
              : text,
          price: Number.isFinite(Number(metadata?.price)) ? Number(metadata.price) : null,
          listino_id: listinoId,
          profile_id: user.id,
          embedding: embedding,
          created_at: new Date(),
        });
        if (insert.error) console.warn('Embedding insert warning', insert.error);
      } catch (e) {
        console.warn('Could not persist embedding:', e);
      }
    }

    return NextResponse.json({ embedding });
  } catch (err: any) {
    console.error('Embedding error:', err?.status ?? 'unknown');
    return NextResponse.json({ error: 'Elaborazione non riuscita' }, { status: 500 });
  }
}
