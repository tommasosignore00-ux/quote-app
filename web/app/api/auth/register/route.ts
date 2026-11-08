export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { registerSchema, validateRequest } from '../../../../lib/validations';
import { normalizeCountryCode, normalizeLanguage } from '../../../../lib/constants';
import { rateLimitAuth } from '../../../../lib/rate-limit';

const supabase = supabaseAdmin;

// Same answer for new and existing addresses, so the form cannot probe for accounts.
function acceptedResponse() {
  return NextResponse.json({ ok: true, verificationRequired: true });
}

export async function POST(req: Request) {
  try {
    // Rate limit: 10 requests per minute per IP
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    const rl = await rateLimitAuth(ip);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Troppe richieste. Riprova tra poco.' },
        { status: 429, headers: rl.headers }
      );
    }

    const body = await req.json();
    const validation = validateRequest(registerSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { email, password, country_code, language, legalAccepted } = validation.data;

    // signUp sends the verification email and, with confirmations on, gives the same
    // answer for addresses that already exist (a user with no identities).
    const publicClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data, error: signUpError } = await publicClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/login?verified=1`,
      },
    });

    if (signUpError) {
      console.error('signUp failed:', signUpError.status);
      return acceptedResponse();
    }

    const user = data.user;
    if (!user || (user.identities?.length ?? 0) === 0) {
      return acceptedResponse();
    }

    // The profile row comes from the signup trigger.
    await supabase
      .from('profiles')
      .update({
        // App disponibile solo in Italia
        country_code: normalizeCountryCode(country_code),
        language: normalizeLanguage(language),
        onboarding_completed: false,
        material_markup_vat_percent: 0,
      })
      .eq('id', user.id);

    // Record legal acceptances if provided
    if (Array.isArray(legalAccepted)) {
      for (const doc of legalAccepted) {
        try {
          await supabase.from('legal_acceptances').insert({
            user_id: user.id,
            document_id: doc.id,
            document_version: doc.version,
          });
        } catch (e) {
          /* ignore */
        }
      }
    }

    return acceptedResponse();
  } catch {
    console.error('register failed');
    return NextResponse.json(
      { error: 'Registrazione non riuscita. Riprova tra poco.' },
      { status: 500 }
    );
  }
}
