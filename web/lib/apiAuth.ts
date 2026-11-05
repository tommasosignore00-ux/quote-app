import 'server-only';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabase-server';

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
    if (error || !data?.user) return null;
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
