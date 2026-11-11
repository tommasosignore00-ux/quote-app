import { NextResponse } from 'next/server';
import { getRequestUser, unauthorizedResponse } from '../../../../lib/apiAuth';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { syncTeamSeats } from '../../../../lib/teamSeats';

/** The invited person accepts or declines; only acceptance activates the membership. */
export async function POST(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return unauthorizedResponse();

  const { id, accept } = (await req.json().catch(() => ({}))) as {
    id?: unknown;
    accept?: unknown;
  };
  if (typeof id !== 'string' || typeof accept !== 'boolean') {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 });
  }

  const pending = supabaseAdmin.from('team_members');
  if (accept) {
    const { data: accepted, error } = await pending
      .update({ active: true, accepted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('member_id', user.id)
      .is('accepted_at', null)
      .select('team_owner_id');
    if (error) {
      return NextResponse.json({ error: 'Operazione non riuscita' }, { status: 500 });
    }
    // Each accepted user beyond the included ones is a paid seat.
    for (const row of accepted ?? []) await syncTeamSeats(row.team_owner_id);
    return NextResponse.json({ ok: true });
  }
  const { error } = await pending
    .delete()
    .eq('id', id)
    .eq('member_id', user.id)
    .is('accepted_at', null);
  if (error) {
    return NextResponse.json({ error: 'Operazione non riuscita' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
