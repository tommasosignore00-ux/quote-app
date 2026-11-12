import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { TEAM_INCLUDED_USERS } from '../../../../lib/checkout';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabase = supabaseAdmin;

type Plan = 'monthly' | 'yearly' | 'team';

const has = (prices: string[], id: string | undefined) =>
  Boolean(id && prices.includes(id));

/** Reads the plan from the price IDs configured on the server; the seat item is skipped. */
function planFromSubscription(subscription: Stripe.Subscription): Plan | null {
  const prices = subscription.items.data.map((item) => item.price.id);
  if (has(prices, process.env.STRIPE_PRICE_TEAM)) return 'team';
  if (
    has(prices, process.env.STRIPE_PRICE_YEARLY) ||
    has(prices, process.env.STRIPE_PRICE_FOUNDER_YEARLY)
  ) {
    return 'yearly';
  }
  if (
    has(prices, process.env.STRIPE_PRICE_MONTHLY) ||
    has(prices, process.env.STRIPE_PRICE_FOUNDER_MONTHLY)
  ) {
    return 'monthly';
  }
  return null;
}

/** Founder price in use, or null. */
function founderPrice(subscription: Stripe.Subscription): number | null {
  const prices = subscription.items.data.map((item) => item.price.id);
  if (has(prices, process.env.STRIPE_PRICE_FOUNDER_MONTHLY)) return 19.99;
  if (has(prices, process.env.STRIPE_PRICE_FOUNDER_YEARLY)) return 199.99;
  return null;
}

/** Team users paid for: the included ones plus the extra seats on the subscription. */
function teamUsers(subscription: Stripe.Subscription): number {
  const seat = subscription.items.data.find(
    (item) => item.price.id === process.env.STRIPE_PRICE_TEAM_SEAT
  );
  return TEAM_INCLUDED_USERS + (seat?.quantity ?? 0);
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

async function findProfile(customerId: string, metadataUserId?: string) {
  const query = supabase.from('profiles').select('id, stripe_subscription_id, email');
  const { data, error } = metadataUserId
    ? await query.eq('id', metadataUserId).maybeSingle()
    : await query.eq('stripe_customer_id', customerId).maybeSingle();
  if (error) throw new Error(`profile lookup failed: ${error.code}`);
  return data;
}

async function audit(userId: string, action: string, changes: Record<string, unknown>) {
  const { error } = await supabase.from('audit_logs').insert({
    user_id: userId,
    action,
    resource_type: 'profiles',
    resource_id: userId,
    changes,
  });
  if (error) console.error('Audit log failed:', error.code);
}

async function applySubscription(eventSubscription: Stripe.Subscription) {
  // Events can arrive out of order: the state always comes from Stripe, not the event.
  const subscription = await stripe.subscriptions.retrieve(eventSubscription.id);
  const customerId = idOf(subscription.customer)!;
  const profile = await findProfile(
    customerId,
    subscription.metadata?.userId || subscription.metadata?.user_id
  );
  if (!profile) return 'No user found for subscription';

  const finished = ['canceled', 'incomplete_expired', 'unpaid'].includes(
    subscription.status
  );
  if (
    finished &&
    profile.stripe_subscription_id &&
    profile.stripe_subscription_id !== subscription.id
  ) {
    return null; // An old subscription ended; the current one is untouched.
  }

  const plan = planFromSubscription(subscription);
  if (!plan && !finished) {
    console.warn('Subscription with an unknown price:', subscription.id);
  }

  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;
  const { error } = await supabase
    .from('profiles')
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      trial_ends_at: finished ? null : trialEnd,
      subscription_period_end: new Date(
        subscription.current_period_end * 1000
      ).toISOString(),
      subscription_cancel_at_period_end: subscription.cancel_at_period_end,
      ...(plan
        ? {
            subscription_plan: plan,
            team_plan: plan === 'team',
            max_team_members: plan === 'team' ? teamUsers(subscription) : 1,
          }
        : {}),
      // A founder is someone whose founder subscription was paid, never a mere sign-up.
      ...(founderPrice(subscription) !== null && subscription.status === 'active'
        ? {
            is_founding_member: true,
            founding_member_locked_price: founderPrice(subscription),
          }
        : {}),
      ...(finished ? { team_plan: false } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.id);
  if (error) throw new Error(`profile update failed: ${error.code}`);

  await audit(profile.id, `subscription_${subscription.status}`, {
    subscription_id: subscription.id,
    status: subscription.status,
    plan,
    trial_end: trialEnd,
  });
  return null;
}

async function handleDeleted(eventSubscription: Stripe.Subscription) {
  // Only the subscription on record ends access.
  const { data, error } = await supabase
    .from('profiles')
    .update({
      subscription_status: 'canceled',
      trial_ends_at: null,
      team_plan: false,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', eventSubscription.id)
    .select('id');
  if (error) throw new Error(`profile update failed: ${error.code}`);
  for (const row of data || []) {
    await audit(row.id, 'subscription_canceled', {
      subscription_id: eventSubscription.id,
    });
  }
}

async function handleInvoice(invoice: Stripe.Invoice, action: string) {
  // The endpoint's newer API version omits this field from the event payload;
  // retrieving with the SDK's pinned version returns it.
  const current = await stripe.invoices.retrieve(invoice.id);
  const subscriptionId = idOf(current.subscription);
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await applySubscription(subscription);
  }
  const profile = await findProfile(idOf(invoice.customer)!);
  if (profile) {
    await audit(profile.id, action, {
      invoice_id: invoice.id,
      amount: action === 'payment_failed' ? invoice.amount_due : invoice.amount_paid,
      currency: invoice.currency,
    });
  }
}

/** Sender until the domain is verified on Resend: EMAIL_FROM wins when set. */
const EMAIL_FROM = process.env.EMAIL_FROM || 'Mastrovoce <noreply@mastrovoce.it>';

const euro = (cents: number) =>
  (cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

const romeDate = (date: Date) =>
  date.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Rome',
  });

/** What the next renewal charges, read from the subscription itself. */
function renewalSummary(subscription: Stripe.Subscription) {
  const amount = subscription.items.data.reduce(
    (sum, item) => sum + (item.price.unit_amount ?? 0) * (item.quantity ?? 1),
    0
  );
  const yearly = subscription.items.data.some(
    (item) => item.price.recurring?.interval === 'year'
  );
  const plan = planFromSubscription(subscription);
  const planName = plan === 'team' ? 'Team' : plan === 'yearly' ? 'Annuale' : 'Mensile';
  return { amount, period: yearly ? "all'anno" : 'al mese', planName };
}

/** A courtesy email: a failure must not make Stripe retry the event. */
async function sendAccountEmail(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  }).catch(() => console.warn('Account email not sent'));
}

const subscriptionPageUrl = () =>
  `${process.env.NEXT_PUBLIC_APP_URL || 'https://project-cadu1.vercel.app'}/dashboard/subscription`;

async function quotesSentSince(profileId: string, since: Date): Promise<number | null> {
  const { count, error } = await supabase
    .from('preventivi_versioni')
    .select('id, lavori!inner(profile_id)', { count: 'exact', head: true })
    .eq('lavori.profile_id', profileId)
    .gte('sent_at', since.toISOString());
  return error ? null : (count ?? 0);
}

async function handleTrialWillEnd(subscription: Stripe.Subscription) {
  const profile = await findProfile(
    idOf(subscription.customer)!,
    subscription.metadata?.userId || subscription.metadata?.user_id
  );
  if (!profile) return;
  const ends = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
  await audit(profile.id, 'trial_will_end', {
    subscription_id: subscription.id,
    trial_end: ends?.toISOString(),
  });
  if (!profile.email || !ends) return;

  const { amount, period, planName } = renewalSummary(subscription);
  const started = subscription.trial_start
    ? new Date(subscription.trial_start * 1000)
    : null;
  const quotes = started ? await quotesSentSince(profile.id, started) : null;
  const date = romeDate(ends);
  const link = subscriptionPageUrl();
  await sendAccountEmail(
    profile.email,
    `La prova di Mastrovoce termina il ${date}`,
    `<p>La tua prova gratuita termina il <strong>${date}</strong>.</p>` +
      `<p>Da quel giorno parte il piano ${planName}: <strong>${euro(amount)} ${period}</strong>, addebitati sulla carta che hai inserito. Puoi disdire quando vuoi.</p>` +
      (quotes !== null
        ? `<p>Durante la prova hai inviato ${quotes} ${quotes === 1 ? 'preventivo' : 'preventivi'}.</p>`
        : '') +
      `<p>Per continuare non devi fare nulla. Per disdire, entra in Mastrovoce dal sito e apri la pagina Abbonamento: <a href="${link}">${link}</a>. Se disdici prima del ${date}, non paghi nulla.</p>`
  );
}

async function handlePaymentFailedEmail(invoice: Stripe.Invoice) {
  const profile = await findProfile(idOf(invoice.customer)!);
  if (!profile?.email) return;
  const link = subscriptionPageUrl();
  await sendAccountEmail(
    profile.email,
    'Mastrovoce: il pagamento non è andato a buon fine',
    `<p>Non siamo riusciti ad addebitare ${euro(invoice.amount_due)} sulla tua carta.</p>` +
      `<p>Stripe riproverà nei prossimi giorni e intanto puoi continuare a usare Mastrovoce. Per aggiornare la carta, entra in Mastrovoce dal sito e apri la pagina Abbonamento: <a href="${link}">${link}</a>.</p>`
  );
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    console.error('Webhook signature or secret missing');
    return NextResponse.json({ error: 'Missing configuration' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const { data: claimed, error: claimError } = await supabase.rpc('claim_stripe_event', {
    p_event_id: event.id,
    p_event_type: event.type,
    p_payload: event.data.object,
    p_event_created_at: new Date(event.created * 1000).toISOString(),
  });
  if (claimError) {
    console.error('Could not claim webhook event:', claimError.code);
    return NextResponse.json({ error: 'Storage unavailable' }, { status: 500 });
  }
  if (claimed !== true) return NextResponse.json({ received: true, duplicate: true });

  try {
    let note: string | null = null;
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        note = await applySubscription(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoice(event.data.object as Stripe.Invoice, 'payment_succeeded');
        break;
      case 'invoice.payment_failed':
        await handleInvoice(event.data.object as Stripe.Invoice, 'payment_failed');
        await handlePaymentFailedEmail(event.data.object as Stripe.Invoice);
        break;
    }

    await supabase
      .from('stripe_webhook_events')
      .update({ processed_at: new Date().toISOString(), error_message: note })
      .eq('stripe_event_id', event.id);
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = (err as Error).message.slice(0, 500);
    console.error('Webhook processing error:', message);
    await supabase
      .from('stripe_webhook_events')
      .update({ error_message: message })
      .eq('stripe_event_id', event.id);
    return NextResponse.json({ error: 'Webhook processing error' }, { status: 500 });
  }
}
