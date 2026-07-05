import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const { userId, email, plan } = await req.json();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const priceId = plan === 'team'
      ? process.env.STRIPE_PRICE_TEAM
      : plan === 'yearly'
        ? process.env.STRIPE_PRICE_YEARLY
        : process.env.STRIPE_PRICE_MONTHLY;

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'STRIPE_SECRET_KEY not configured on Vercel' }, { status: 500 });
    }
    if (!priceId) return NextResponse.json({ error: 'Price not configured' }, { status: 500 });
    if (!appUrl) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL not configured on Vercel' }, { status: 500 });
    }
    if (!userId || !email || !plan) {
      return NextResponse.json({ error: 'Missing checkout payload' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: { userId },
      },
      customer_email: email,
      success_url: `${appUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/subscription/cancel`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout route error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
