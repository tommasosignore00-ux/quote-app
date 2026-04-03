import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { checkoutSessionSchema, validateRequest } from '../../../../lib/validations';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabase = supabaseAdmin;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validation = validateRequest(checkoutSessionSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { userId, email, companyName, priceId } = validation.data;

    // Create or update Stripe customer
    let customerId: string | null = null;
    const { data: existing } = await supabase.from('profiles').select('stripe_customer_id').eq('id', userId).single();
    customerId = existing?.stripe_customer_id || null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { userId },
        name: companyName,
      });
      customerId = customer.id;
      await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', userId);
    } else {
      await stripe.customers.update(customerId, { metadata: { userId }, name: companyName });
    }

    // Check if user is a founding member for coupon discount
    const { data: profileData } = await supabase.from('profiles').select('is_founding_member').eq('id', userId).single();
    const isFoundingMember = profileData?.is_founding_member === true;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: process.env[`STRIPE_PRICE_${priceId.toUpperCase()}`] || priceId, quantity: 1 }],
      ...(isFoundingMember
        ? { discounts: [{ coupon: 'hiYX4PTU' }] }
        : { allow_promotion_codes: true }),
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscription/cancel`,
      subscription_data: {
        trial_period_days: 7,
        metadata: { userId },
      },
    });

    return NextResponse.json({ sessionId: session.id });
  } catch (err: any) {
    console.error('Create checkout session error:', err);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
