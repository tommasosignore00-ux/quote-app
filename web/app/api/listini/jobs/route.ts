import { NextResponse } from 'next/server';
import { getRequestUser, unauthorizedResponse } from '../../../../lib/apiAuth';
import { supabaseAdmin } from '../../../../lib/supabase-server';

/** Status of a background listini job started with ?async=1. */
export async function GET(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return unauthorizedResponse();
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'id è obbligatorio' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('listino_jobs')
    .select('id, kind, status, http_status, result, created_at, updated_at')
    .eq('id', id)
    .eq('profile_id', user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Lavoro non trovato' }, { status: 404 });
  return NextResponse.json({ ok: true, job: data });
}
