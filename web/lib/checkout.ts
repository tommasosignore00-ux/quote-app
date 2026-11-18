import Stripe from 'stripe';
import { supabaseAdmin } from './supabase-server';

/**
 * The one place that decides what a new subscription costs.
 * Used by the subscription page and by onboarding.
 */

export type CheckoutPlan = 'monthly' | 'yearly' | 'team';

export const TRIAL_DAYS = 14;
/** The founder price goes to the first paying customers, up to this number. */
export const FOUNDER_SLOTS = 50;
/** Team: users included, owner counted. */
export const TEAM_INCLUDED_USERS = 5;
/** Team: most users one team can have, owner counted. */
export const TEAM_MAX_USERS = 10;

const ACTIVE_STATUSES = ['trialing', 'active', 'past_due'];
/** Stripe keeps a checkout open at least 30 minutes: the founder place is held a bit longer. */
const CHECKOUT_MINUTES = 31;
const FOUNDER_HOLD_MINUTES = 35;

export function planPrice(plan: CheckoutPlan, founder: boolean): string | undefined {
  if (plan === 'team') return process.env.STRIPE_PRICE_TEAM;
  if (founder) {
    return plan === 'yearly'
      ? process.env.STRIPE_PRICE_FOUNDER_YEARLY
      : process.env.STRIPE_PRICE_FOUNDER_MONTHLY;
  }
  return plan === 'yearly'
    ? process.env.STRIPE_PRICE_YEARLY
    : process.env.STRIPE_PRICE_MONTHLY;
}

/** Founder places still free: paid founders and open checkouts holding a place are taken. */
export async function founderSlotsLeft(): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('founder_slots_left', {
    p_total: FOUNDER_SLOTS,
  });
  if (error) throw new Error(`founder count failed: ${error.code}`);
  return Number(data) || 0;
}

/** Holds a founder place for this checkout; false when none is left. */
async function reserveFounderSlot(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('reserve_founder_slot', {
    p_profile_id: userId,
    p_total: FOUNDER_SLOTS,
    p_minutes: FOUNDER_HOLD_MINUTES,
  });
  if (error) throw new Error(`founder reservation failed: ${error.code}`);
  return data === true;
}

export type CheckoutResult =
  | { ok: true; url: string; sessionId: string; founder: boolean }
  | { ok: false; status: number; error: string; code?: string };

export async function createSubscriptionCheckout(options: {
  userId: string;
  email: string;
  plan: CheckoutPlan;
  companyName?: string;
  /** The customer chose the founder price instead of the free trial. */
  founderRequested?: boolean;
}): Promise<CheckoutResult> {
  const { userId, email, plan, companyName, founderRequested } = options;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!process.env.STRIPE_SECRET_KEY || !appUrl) {
    return { ok: false, status: 500, error: 'Pagamenti non configurati' };
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select(
      'stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at'
    )
    .eq('id', userId)
    .single();
  if (profileError) {
    return { ok: false, status: 500, error: 'Profilo non disponibile' };
  }

  if (
    profile?.stripe_subscription_id &&
    ACTIVE_STATUSES.includes(profile.subscription_status ?? '')
  ) {
    return {
      ok: false,
      status: 409,
      error: 'Hai già un abbonamento attivo. Puoi cambiarlo dalla pagina Abbonamento.',
      code: 'ALREADY_SUBSCRIBED',
    };
  }

  const firstSubscription = !(
    profile?.stripe_subscription_id ||
    profile?.subscription_status ||
    profile?.trial_ends_at
  );
  // Founders: Pro only, chosen by the customer on a first subscription, with a place held
  // for the time of the checkout. Status ends with the subscription (see the webhook).
  const founder = founderRequested === true && plan !== 'team' && firstSubscription;
  if (founder && !(await reserveFounderSlot(userId))) {
    return {
      ok: false,
      status: 409,
      error:
        'I posti con il prezzo fondatori sono esauriti. Puoi iniziare con la prova gratuita.',
      code: 'FOUNDER_SOLD_OUT',
    };
  }

  const priceId = planPrice(plan, founder);
  if (!priceId) return { ok: false, status: 500, error: 'Piano non configurato' };

  let customerId = profile?.stripe_customer_id || null;
  if (customerId) {
    await stripe.customers.update(customerId, {
      metadata: { userId },
      ...(companyName ? { name: companyName } : {}),
    });
  } else {
    const customer = await stripe.customers.create({
      email,
      metadata: { userId },
      ...(companyName ? { name: companyName } : {}),
    });
    customerId = customer.id;
    await supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', userId);
  }

  // A checkout left open in another tab would create a second paid subscription.
  const open = await stripe.checkout.sessions.list({
    customer: customerId,
    status: 'open',
    limit: 10,
  });
  for (const previous of open.data) {
    await stripe.checkout.sessions.expire(previous.id).catch(() => {});
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_MINUTES * 60,
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: founder ? undefined : true,
    subscription_data: {
      metadata: { userId, founder: founder ? 'true' : 'false' },
      // Founders pay at once and can ask for a refund within 30 days instead.
      ...(firstSubscription && !founder ? { trial_period_days: TRIAL_DAYS } : {}),
    },
    success_url: `${appUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/subscription/cancel`,
  });
  if (!session.url) return { ok: false, status: 500, error: 'Checkout non riuscito' };
  return { ok: true, url: session.url, sessionId: session.id, founder };
}
