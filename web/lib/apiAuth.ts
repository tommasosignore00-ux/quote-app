import 'server-only';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabase-server';

/** A user with a verified authenticator must have completed it in this session. */
function needsSecondFactor(user: User, accessToken?: string): boolean {
  if (!user.factors?.some((factor) => factor.status === 'verified')) return false;
  try {
    const claims = JSON.parse(
      Buffer.from(accessToken!.split('.')[1], 'base64url').toString()
    );
    return claims.aal !== 'aal2';
  } catch {
    return true;
  }
}

/**
 * Restituisce l'utente autenticato che sta chiamando l'API, oppure null.
 *
 * Accetta due modalità:
 * - header `Authorization: Bearer <access_token>` (app mobile)
 * - cookie di sessione Supabase (app web, stessa origine)
 *
 * Le route che usano `supabaseAdmin` bypassano la RLS: devono SEMPRE
 * chiamare questa funzione e usare `user.id` come profilo, mai un
 * `profileId`/`userId` preso dal body o dalla query string.
 */
export async function getRequestUser(req: Request): Promise<User | null> {
  const authHeader = req.headers.get('authorization') || '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);
    if (error || !data?.user || needsSecondFactor(data.user, bearer)) return null;
    return data.user;
  }

  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {
            // Le route API non devono riscrivere i cookie di sessione.
          },
        },
      }
    );
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    const { data: session } = await supabase.auth.getSession();
    if (needsSecondFactor(data.user, session.session?.access_token)) return null;
    return data.user;
  } catch {
    return null;
  }
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
}

export function forbiddenResponse() {
  return NextResponse.json({ error: 'Accesso negato' }, { status: 403 });
}

/**
 * Verifica che un eventuale profileId/userId passato dal client coincida con
 * l'utente autenticato. Se il client non lo passa, va bene comunque.
 */
export function isOwnProfile(user: User, claimedId: unknown): boolean {
  if (claimedId === undefined || claimedId === null || claimedId === '') return true;
  return String(claimedId) === user.id;
}

/**
 * Returns a response when the user may not use paid features, otherwise null.
 * The rule lives in the database function profile_is_entitled. An unavailable
 * check denies access: these routes spend money on every call.
 */
export async function requireActiveSubscription(
  profileId: string
): Promise<NextResponse | null> {
  const { data, error } = await supabaseAdmin.rpc('profile_is_entitled', {
    p_profile_id: profileId,
  });
  if (error) {
    console.error('Entitlement check failed:', error.code);
    return NextResponse.json(
      { error: 'Servizio temporaneamente non disponibile. Riprova tra poco.' },
      { status: 503 }
    );
  }
  if (data !== true) {
    return NextResponse.json(
      {
        error: 'Serve un abbonamento attivo per usare questa funzione.',
        code: 'SUBSCRIPTION_REQUIRED',
      },
      { status: 402 }
    );
  }
  return null;
}
