import { NextResponse } from 'next/server';
import { getRequestUser, unauthorizedResponse } from '../../../lib/apiAuth';
import { supabaseAdmin } from '../../../lib/supabase-server';
import { rateLimit } from '../../../lib/rate-limit';
import { TEAM_MAX_USERS } from '../../../lib/checkout';
import { syncTeamSeats } from '../../../lib/teamSeats';

// Members and pending invitations, the owner excluded.
const MAX_TEAM_MEMBERS = TEAM_MAX_USERS - 1;

const ROLE_PERMISSIONS: Record<string, Record<string, boolean>> = {
  admin: {
    can_create_quotes: true,
    can_edit_quotes: true,
    can_manage_clients: true,
    can_manage_listini: true,
    can_view_reports: true,
  },
  technician: {
    can_create_quotes: true,
    can_edit_quotes: true,
    can_manage_clients: false,
    can_manage_listini: false,
    can_view_reports: false,
  },
  readonly: {
    can_create_quotes: false,
    can_edit_quotes: false,
    can_manage_clients: false,
    can_manage_listini: false,
    can_view_reports: true,
  },
};

// Same answer whether or not the address has an account.
const INVITE_RESPONSE = {
  ok: true,
  message:
    "Se l'indirizzo è registrato, la persona troverà l'invito nel proprio profilo.",
};

/** The owner's members and the invitations addressed to the caller. */
export async function GET(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return unauthorizedResponse();

  const [owned, received] = await Promise.all([
    supabaseAdmin
      .from('team_members')
      .select(
        'id, member_id, role, active, accepted_at, member:member_id(email, company_name)'
      )
      .eq('team_owner_id', user.id)
      .or('active.eq.true,accepted_at.is.null'),
    supabaseAdmin
      .from('team_members')
      .select('id, role, owner:team_owner_id(company_name)')
      .eq('member_id', user.id)
      .is('accepted_at', null),
  ]);
  if (owned.error || received.error) {
    return NextResponse.json({ error: 'Caricamento non riuscito' }, { status: 500 });
  }
  return NextResponse.json({ members: owned.data, invitations: received.data });
}

export async function POST(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return unauthorizedResponse();

  const limit = await rateLimit(`team-invite:${user.id}`, {
    maxRequests: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.success) {
    return NextResponse.json(
      { error: 'Troppi inviti. Riprova più tardi.' },
      { status: 429 }
    );
  }

  const { email, role } = (await req.json().catch(() => ({}))) as {
    email?: unknown;
    role?: unknown;
  };
  if (typeof email !== 'string' || !email.includes('@') || email.length > 254) {
    return NextResponse.json({ error: 'Email non valida' }, { status: 400 });
  }
  const permissions = typeof role === 'string' ? ROLE_PERMISSIONS[role] : undefined;
  if (!permissions) {
    return NextResponse.json({ error: 'Ruolo non valido' }, { status: 400 });
  }

  const [{ data: entitled }, { data: owner }, { count }] = await Promise.all([
    supabaseAdmin.rpc('profile_is_entitled', { p_profile_id: user.id }),
    supabaseAdmin.from('profiles').select('team_plan').eq('id', user.id).single(),
    supabaseAdmin
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .eq('team_owner_id', user.id)
      .or('active.eq.true,accepted_at.is.null'),
  ]);
  if (entitled !== true || owner?.team_plan !== true) {
    return NextResponse.json(
      { error: 'Il tuo piano non include il team.', code: 'TEAM_PLAN_REQUIRED' },
      { status: 402 }
    );
  }
  if ((count ?? MAX_TEAM_MEMBERS) >= MAX_TEAM_MEMBERS) {
    return NextResponse.json(
      { error: `Il Team arriva al massimo a ${TEAM_MAX_USERS} utenti, tu compreso.` },
      { status: 409 }
    );
  }

  const normalized = email
    .trim()
    .toLowerCase()
    .replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: invited } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .ilike('email', normalized)
    .maybeSingle();
  if (!invited || invited.id === user.id) return NextResponse.json(INVITE_RESPONSE);

  const { error } = await supabaseAdmin.from('team_members').upsert(
    {
      team_owner_id: user.id,
      member_id: invited.id,
      role,
      permissions,
      active: false,
      accepted_at: null,
      invited_at: new Date().toISOString(),
    },
    { onConflict: 'team_owner_id,member_id' }
  );
  if (error) {
    console.error('Team invite failed:', error.code);
    return NextResponse.json({ error: 'Invito non riuscito' }, { status: 500 });
  }
  return NextResponse.json(INVITE_RESPONSE);
}

/** Removes a member or withdraws an invitation. */
export async function DELETE(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return unauthorizedResponse();
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Membro non indicato' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('team_members')
    .delete()
    .eq('id', id)
    .eq('team_owner_id', user.id);
  if (error) {
    return NextResponse.json({ error: 'Operazione non riuscita' }, { status: 500 });
  }
  await syncTeamSeats(user.id);
  return NextResponse.json({ ok: true });
}
