import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '../../../../lib/supabase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabase = supabaseAdmin;

const TEAM_INCLUDED_MEMBERS = 5;

type Plan = 'monthly' | 'yearly' | 'team';

/** Reads the plan from the price IDs configured on the server; metered items are skipped. */
function planFromSubscription(subscription: Stripe.Subscription): Plan | null {
  const prices = subscription.items.data.map((item) => item.price.id);
  if (process.env.STRIPE_PRICE_TEAM && prices.includes(process.env.STRIPE_PRICE_TEAM))
    {return 'team';}
  if (process.env.STRIPE_PRICE_YEARLY && prices.includes(process.env.STRIPE_PRICE_YEARLY))
    {return 'yearly';}
  if (
    process.env.STRIPE_PRICE_MONTHLY &&
    prices.includes(process.env.STRIPE_PRICE_MONTHLY)
  )
    {return 'monthly';}
  return null;
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
  if (!plan && !finished)
    {console.warn('Subscription with an unknown price:', subscription.id);}

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
      ...(plan
        ? {
            subscription_plan: plan,
            team_plan: plan === 'team',
            max_team_members: plan === 'team' ? TEAM_INCLUDED_MEMBERS : 1,
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
  const subscriptionId = idOf(invoice.subscription);
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

  if (!profile.email || !ends || !process.env.RESEND_API_KEY) return;
  const date = ends.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Rome',
  });
  // A missing courtesy email must not make Stripe retry the event.
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'noreply@quoteapp.it',
      to: profile.email,
      subject: `Il periodo di prova di Mastrovoce termina il ${date}`,
      html: `<p>Il tuo periodo di prova termina il ${date}. Da quel giorno l'abbonamento si rinnova in automatico.</p><p>Se preferisci non continuare, puoi disdire dalla pagina Abbonamento dell'app.</p>`,
    }),
  }).catch(() => console.warn('Trial reminder not sent'));
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
