import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { getRequestUser, unauthorizedResponse, forbiddenResponse } from '../../../../lib/apiAuth';
import { bulkGenerateEmbeddingsForListino } from '../../../../lib/bulkGenerateEmbeddings';

export async function POST(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const { listinoId } = await req.json();
    if (!listinoId) return NextResponse.json({ error: 'listinoId required' }, { status: 400 });

    const { data: listino } = await supabaseAdmin
      .from('listini')
      .select('id')
      .eq('id', listinoId)
      .eq('profile_id', user.id)
      .maybeSingle();
    if (!listino) return forbiddenResponse();

    const result = await bulkGenerateEmbeddingsForListino({ listinoId });
    if (!result.ok && result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, processed: result.processed });
  } catch (err: any) {
    console.error('bulk generate embeddings error', err);
    return NextResponse.json({ error: err.message || 'failed' }, { status: 500 });
  }
}
