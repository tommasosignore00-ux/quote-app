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
import { rateLimit } from '../../../lib/rate-limit';

const MAX_WEBHOOKS = 10;

/**
 * Same rules as the dispatcher (supabase/functions/webhook-dispatch), checked at save
 * time too: https on 443, no credentials, no local or private addresses. The dispatcher
 * also resolves the name before each delivery.
 */
function isAcceptableWebhookUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 500) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || (url.port && url.port !== '443')) return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return false;
  }
  // IP literals are refused: a webhook points at a named service.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return false;
  return true;
}

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limit = await rateLimit(`webhook-create:${user.id}`, {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.success) {
    return NextResponse.json(
      { error: 'Troppe richieste. Riprova più tardi.' },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { url, events } = body as { url?: unknown; events?: unknown };

  if (
    !isAcceptableWebhookUrl(url) ||
    !Array.isArray(events) ||
    events.length === 0 ||
    events.length > 20 ||
    !events.every((event) => typeof event === 'string' && event.length <= 64)
  ) {
    return NextResponse.json(
      { error: 'Indirizzo non valido: serve un https pubblico, ed eventi validi.' },
      { status: 400 }
    );
  }

  const { count } = await supabase
    .from('webhook_endpoints')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', user.id);
  if ((count ?? 0) >= MAX_WEBHOOKS) {
    return NextResponse.json(
      { error: `Puoi avere al massimo ${MAX_WEBHOOKS} webhook.` },
      { status: 409 }
    );
  }

  const secret = `whsec_${crypto.randomBytes(32).toString('hex')}`;

  const { data, error } = await supabase
    .from('webhook_endpoints')
    .insert({
      profile_id: user.id,
      url,
      secret,
      events,
      active: true,
    })
    .select()
    .single();

  if (error) {
    console.error('Webhook create failed:', error.code);
    return NextResponse.json({ error: 'Salvataggio non riuscito' }, { status: 500 });
  }

  // Return the secret only on creation — user must save it
  return NextResponse.json({ ...data, secret }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const supabase = await getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
