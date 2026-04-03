export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { registerSchema, validateRequest } from '../../../../lib/validations';
import { rateLimitAuth } from '../../../../lib/rate-limit';

const supabase = supabaseAdmin;

async function sendWelcomeEmail(email: string, name?: string) {
  // Try Resend API first
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_test_key_optional') {
    try {
      const html = `
        <h2 style="color: #dc2626;">Benvenuto in QuoteApp!</h2>
        <p>Ciao ${name || 'utente'},</p>
        <p>Grazie per esserti registrato. Il tuo account è stato creato con successo e puoi iniziare a creare preventivi subito.</p>
        <p><strong>Prossimi passi:</strong></p>
        <ul>
          <li>Completa il tuo profilo aziendale</li>
          <li>Carica i tuoi listini prezzi</li>
          <li>Inizia a creare preventivi</li>
        </ul>
        <p>Se hai domande, contattaci pure!</p>
        <p>Cordiali saluti,<br>Il team di QuoteApp</p>
      `;
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'noreply@quoteapp.it',
          to: email,
          subject: 'Benvenuto su QuoteApp - Account creato',
          html,
        }),
      });
      if (response.ok) {
        console.log('Welcome email sent via Resend to', email);
        return;
      }
    } catch (e) {
      console.warn('Resend email failed, skipping:', e);
    }
  }
  
  // Log that email sending was skipped (development mode)
  console.log('Email sending skipped for', email, '(RESEND_API_KEY not configured or dev mode)');
}

export async function POST(req: Request) {
  try {
    // Rate limit: 10 requests per minute per IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rl = rateLimitAuth(ip);
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

    // Create user via admin API and mark email confirmed so user can log in immediately
    const { data, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    } as any);

    if (createErr) {
      console.error('createUser error', createErr);
      return NextResponse.json({ error: createErr.message || 'Failed to create user' }, { status: 500 });
    }

    const user = (data as any)?.user;
    if (!user) return NextResponse.json({ error: 'User creation returned no user' }, { status: 500 });

    // Upsert profile
    await supabase.from('profiles').upsert({
      id: user.id,
      email,
      country_code: country_code || null,
      language: language || null,
      onboarding_completed: false,
      material_markup_vat_percent: 0,
    });

    // Record legal acceptances if provided
    if (Array.isArray(legalAccepted)) {
      for (const doc of legalAccepted) {
        try {
          await supabase.from('legal_acceptances').insert({ user_id: user.id, document_id: doc.id, document_version: doc.version });
        } catch (e) { /* ignore */ }
      }
    }

    // Send welcome email if possible
    try { await sendWelcomeEmail(email); } catch (e) { console.warn('welcome email failed', e); }

    return NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
  } catch (err: any) {
    console.error('register error', err);
    return NextResponse.json({ error: err.message || 'internal' }, { status: 500 });
  }
}
