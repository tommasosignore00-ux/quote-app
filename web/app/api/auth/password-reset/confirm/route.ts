import { rateLimitAuth } from '../../../../../lib/rate-limit';
import { supabaseAdmin } from '../../../../../lib/supabase-server';
import { createHash } from 'crypto';
import { NextResponse } from 'next/server';

const supabase = supabaseAdmin;
const INVALID_LINK = 'Il link non è valido o è scaduto. Richiedine uno nuovo.';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token, email, newPassword } = body;

    if (!token || !email || !newPassword) {
      return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 });
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    const rl = await rateLimitAuth(`reset-confirm:${ip}`);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Troppe richieste. Riprova tra poco.' },
        { status: 429, headers: rl.headers }
      );
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return NextResponse.json(
        { error: 'La password deve avere almeno 8 caratteri' },
        { status: 400 }
      );
    }

    if (typeof token !== 'string' || typeof email !== 'string') {
      return NextResponse.json({ error: INVALID_LINK }, { status: 400 });
    }

    // Atomic: of two concurrent requests with the same token, only one gets a user.
    const { data: userId, error: consumeError } = await supabase.rpc(
      'consume_password_reset_token',
      { p_token_hash: hashToken(token), p_email: email.trim() }
    );
    if (consumeError) {
      console.error('Reset token check failed:', consumeError.code);
      return NextResponse.json(
        { error: 'Operazione non riuscita. Riprova.' },
        { status: 500 }
      );
    }
    if (!userId) {
      return NextResponse.json({ error: INVALID_LINK }, { status: 400 });
    }
    const user = { id: userId as string };

    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });
    if (updateError) {
      console.error('Failed to update password:', updateError.status);
      return NextResponse.json(
        { error: 'Operazione non riuscita. Richiedi un nuovo link.' },
        { status: 500 }
      );
    }

    // A stolen session must not survive a password reset.
    const { error: revokeError } = await supabase.rpc('revoke_user_sessions', {
      p_user_id: user.id,
    });
    if (revokeError) console.error('Could not revoke sessions:', revokeError.code);

    // Update password_changed_at on profile
    await supabase
      .from('profiles')
      .update({
        password_changed_at: new Date(),
      })
      .eq('id', user.id);

    // Log audit
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'password_reset_completed',
      resource_type: 'auth',
      created_at: new Date(),
    });

    return NextResponse.json({ message: 'Password aggiornata' }, { status: 200 });
  } catch (err: any) {
    console.error('Password reset confirmation failed');
    return NextResponse.json(
      { error: 'Operazione non riuscita. Riprova.' },
      { status: 500 }
    );
  }
}
