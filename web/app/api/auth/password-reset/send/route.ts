import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../../../lib/supabase-server';
import { createHash, randomBytes } from 'crypto';
import { NextResponse } from 'next/server';

const supabase = supabaseAdmin;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Using manual HTTP request for email (Resend, SendGrid, Mailgun, or SMTP)
// Adjust based on your email service
async function sendResetEmail(email: string, resetUrl: string): Promise<void> {
  // Option 1: Using Resend (recommended for Next.js)
  if (process.env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
        to: email,
        subject: 'Password Reset Request',
        html: `
          <h2>Password Reset Request</h2>
          <p>Click the link below to reset your password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" style="
            display: inline-block;
            padding: 10px 20px;
            background-color: #007bff;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin: 10px 0;
          ">Reset Password</a>
          <p>Or visit: ${resetUrl}</p>
          <p>If you did not request this, ignore this email.</p>
        `,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to send email via Resend');
    }
    return;
  }

  // Option 2: Standard SMTP via fetch (you can use your own service)
  throw new Error('Email service not configured. Please set RESEND_API_KEY or implement your email service.');
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Find user by email
    const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) {
      console.error('Failed to list users:', userError);
      return NextResponse.json(
        { error: 'Failed to process request' },
        { status: 500 }
      );
    }

    const user = userData.users.find((u) => u.email === email);
    if (!user) {
      // Don't reveal if email exists (security)
      return NextResponse.json(
        { message: 'If this email exists, a password reset link has been sent' },
        { status: 200 }
      );
    }

    // Generate reset token
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    // Store token in database
    const { error: insertError } = await supabase
      .from('password_reset_tokens')
      .insert({
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error('Failed to insert reset token:', insertError);
      return NextResponse.json(
        { error: 'Failed to process request' },
        { status: 500 }
      );
    }

    // Send email with reset link
    const resetUrl = new URL('/auth/reset-password', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
    resetUrl.searchParams.append('token', rawToken);
    resetUrl.searchParams.append('email', email);

    try {
      await sendResetEmail(email, resetUrl.toString());
    } catch (emailError: any) {
      console.error('Failed to send email:', emailError);
      return NextResponse.json(
        { error: 'Failed to send reset email' },
        { status: 500 }
      );
    }

    // Log audit
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'password_reset_requested',
      resource_type: 'auth',
      created_at: new Date(),
    });

    return NextResponse.json(
      { message: 'If this email exists, a password reset link has been sent' },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Password reset error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
