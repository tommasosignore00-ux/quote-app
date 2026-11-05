import { NextResponse } from 'next/server';
import { getRequestUser, unauthorizedResponse, forbiddenResponse, isOwnProfile } from '../../../../lib/apiAuth';
import Stripe from 'stripe';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { checkoutSessionSchema, validateRequest } from '../../../../lib/validations';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabase = supabaseAdmin;

export async function POST(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const body = await req.json();
    const validation = validateRequest(checkoutSessionSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { userId: claimedUserId, companyName, priceId: requestedPlan } = validation.data;
    if (!isOwnProfile(user, claimedUserId)) return forbiddenResponse();
    const userId = user.id;
    const email = user.email;

    // Solo i piani configurati sul server: mai un price id arbitrario dal client
    const planKey = String(requestedPlan).replace(/^price_/i, '').toUpperCase();
    const stripePriceId = ['MONTHLY', 'YEARLY', 'TEAM'].includes(planKey)
      ? process.env[`STRIPE_PRICE_${planKey}`]
      : undefined;
    if (!stripePriceId) {
      return NextResponse.json({ error: 'Piano non valido' }, { status: 400 });
    }

    // Create or update Stripe customer
    let customerId: string | null = null;
    const { data: existing } = await supabase
      .from('profiles')
      .select('stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at')
      .eq('id', userId)
      .single();
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
    const hadSubscriptionBefore = Boolean(
      existing?.stripe_subscription_id ||
      existing?.subscription_status ||
      existing?.trial_ends_at
    );

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      ...(isFoundingMember
        ? { discounts: [{ coupon: 'hiYX4PTU' }] }
        : { allow_promotion_codes: true }),
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscription/cancel`,
      subscription_data: {
        metadata: { userId },
        ...(!hadSubscriptionBefore ? { trial_period_days: 7 } : {}),
      },
    });

    return NextResponse.json({ sessionId: session.id });
  } catch (err: any) {
    console.error('Create checkout session error:', err);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
