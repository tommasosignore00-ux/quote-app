import { rateLimitAuth } from '../../../../../lib/rate-limit';
import { supabaseAdmin } from '../../../../../lib/supabase-server';
import { createHash } from 'crypto';
import { NextResponse } from 'next/server';

const supabase = supabaseAdmin;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token, email, newPassword } = body;

    if (!token || !email || !newPassword) {
      return NextResponse.json(
        { error: 'Token, email, and new password are required' },
        { status: 400 }
      );
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    const rl = await rateLimitAuth(`password-reset-confirm:${ip}`);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Troppe richieste. Riprova tra poco.' },
        { status: 429, headers: rl.headers }
      );
    }
    const normalizedEmail = String(email)
      .trim()
      .toLowerCase()
      .replace(/[\\%_]/g, (c) => `\\${c}`);

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Hash the token for lookup
    const tokenHash = hashToken(token);

    // Find the reset token
    const { data: resetTokens, error: queryError } = await supabase
      .from('password_reset_tokens')
      .select('user_id, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .single();

    if (queryError || !resetTokens) {
      console.error('Reset token not found:', queryError);
      return NextResponse.json(
        { error: 'Invalid or expired reset token' },
        { status: 400 }
      );
    }

    // Check expiration
    if (new Date(resetTokens.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Reset token has expired' }, { status: 400 });
    }

    // Check if already used
    if (resetTokens.used_at) {
      return NextResponse.json(
        { error: 'Reset token has already been used' },
        { status: 400 }
      );
    }

    // Find user by email
    // listUsers() restituisce solo la prima pagina (50 utenti): cerchiamo nel profilo
    const { data: profileRow, error: userError } = await supabase
      .from('profiles')
      .select('id, email')
      .ilike('email', normalizedEmail)
      .maybeSingle();
    if (userError) {
      console.error('Failed to look up user:', userError);
      return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
    }

    const user = profileRow ? { id: profileRow.id as string } : null;
    if (!user || user.id !== resetTokens.user_id) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 });
    }

    // Update user password
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });

    if (updateError) {
      console.error('Failed to update password:', updateError);
      return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
    }

    // Mark token as used
    const { error: markError } = await supabase
      .from('password_reset_tokens')
      .update({
        used_at: new Date(),
      })
      .eq('token_hash', tokenHash);

    if (markError) {
      console.error('Failed to mark token as used:', markError);
    }

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

    return NextResponse.json(
      { message: 'Password has been reset successfully' },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Password reset confirmation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
