/**
 * Punto 43: Webhook management API
 * GET    /api/webhooks - list webhooks
 * POST   /api/webhooks - create webhook
 * DELETE /api/webhooks - delete webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import crypto from 'crypto';

async function getSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );
}

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('webhook_endpoints')
    .select('id, url, events, active, created_at')
    .eq('profile_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { url, events } = body;

  if (!url || !events || !Array.isArray(events)) {
    return NextResponse.json({ error: 'url and events[] required' }, { status: 400 });
  }

  const secret = `whsec_${crypto.randomBytes(32).toString('hex')}`;

  const { data, error } = await supabase.from('webhook_endpoints').insert({
    profile_id: user.id,
    url,
    secret,
    events,
    active: true,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return the secret only on creation — user must save it
  return NextResponse.json({ ...data, secret }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const supabase = await getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('webhook_endpoints')
    .delete()
    .eq('id', id)
    .eq('profile_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
