import { NextResponse } from 'next/server';
import { sendEmailSchema, validateRequest } from '../../../../lib/validations';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validation = validateRequest(sendEmailSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { to, subject, html } = validation.data;

    // Resend / SendGrid / SMTP - placeholder
    const apiKey = process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY;
    if (apiKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'noreply@quoteapp.com',
          to: [to],
          subject,
          html,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
    } else {
      console.log('Email would be sent:', { to, subject });
      // Simulate success for development
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
