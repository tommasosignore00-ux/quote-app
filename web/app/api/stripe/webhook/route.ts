import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../../lib/supabase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Service role client for webhook processing (no RLS)
const supabase = supabaseAdmin;

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
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const now = new Date();

  try {
    // Log webhook event
    await supabase
      .from('stripe_webhook_events')
      .insert({
        stripe_event_id: event.id,
        event_type: event.type,
        payload: event.data.object as any,
        created_at: now,
      });

    // Handle subscription events
    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const userId = subscription.metadata?.userId || subscription.metadata?.user_id;

      if (!userId) {
        // Try to find user by customer id
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (!profile) {
          console.error('No user found for subscription', subscription.id);
          await supabase
            .from('stripe_webhook_events')
            .update({
              error_message: 'No user found for subscription',
              processed_at: now,
            })
            .eq('stripe_event_id', event.id);
          return NextResponse.json({ received: true });
        }
      }

      const trialEnd = subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null;

      // Update profile with subscription data
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          subscription_status: subscription.status as any,
          trial_expires_at: trialEnd,
          updated_at: now,
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Failed to update profile on subscription:', updateError);
        await supabase
          .from('stripe_webhook_events')
          .update({
            error_message: updateError.message,
            processed_at: now,
          })
          .eq('stripe_event_id', event.id);
        return NextResponse.json({ received: true });
      }

      // Log audit
      await supabase.from('audit_logs').insert({
        user_id: userId,
        action: `subscription_${subscription.status}`,
        resource_type: 'profiles',
        resource_id: userId,
        changes: {
          subscription_id: subscription.id,
          status: subscription.status,
          trial_end: trialEnd,
        },
        created_at: now,
      });
    }

    // Handle subscription cancellation
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const userId = subscription.metadata?.userId || subscription.metadata?.user_id;

      if (!userId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (!profile) {
          console.error('No user found for deleted subscription', subscription.id);
          return NextResponse.json({ received: true });
        }
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          subscription_status: 'canceled' as any,
          trial_expires_at: null,
          updated_at: now,
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Failed to cancel subscription:', updateError);
        return NextResponse.json({ received: true });
      }

      // Log audit
      await supabase.from('audit_logs').insert({
        user_id: userId,
        action: 'subscription_canceled',
        resource_type: 'profiles',
        resource_id: userId,
        changes: {
          subscription_id: subscription.id,
          canceled_at: now,
        },
        created_at: now,
      });
    }

    // Handle payment succeeded
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;

      // Fetch customer to get user_id
      const customer = await stripe.customers.retrieve(customerId) as any;
      const userId = customer?.metadata?.userId || customer?.metadata?.user_id;

      if (userId) {
        await supabase.from('audit_logs').insert({
          user_id: userId,
          action: 'payment_succeeded',
          resource_type: 'profiles',
          resource_id: userId,
          changes: {
            invoice_id: invoice.id,
            amount_paid: invoice.amount_paid,
            currency: invoice.currency,
          },
          created_at: now,
        });
      }
    }

    // Handle payment failed
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;

      // Fetch customer to get user_id
      const customer = await stripe.customers.retrieve(customerId) as any;
      const userId = customer?.metadata?.userId || customer?.metadata?.user_id;

      if (userId) {
        // Update subscription status to past_due
        await supabase
          .from('profiles')
          .update({
            subscription_status: 'past_due' as any,
            updated_at: now,
          })
          .eq('id', userId);

        // Log audit
        await supabase.from('audit_logs').insert({
          user_id: userId,
          action: 'payment_failed',
          resource_type: 'profiles',
          resource_id: userId,
          changes: {
            invoice_id: invoice.id,
            amount_attempted: invoice.amount_due,
            currency: invoice.currency,
          },
          created_at: now,
        });
      }
    }

    // Mark as processed
    await supabase
      .from('stripe_webhook_events')
      .update({
        processed_at: now,
      })
      .eq('stripe_event_id', event.id);

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('Webhook processing error:', err);

    // Log error
    await supabase
      .from('stripe_webhook_events')
      .update({
        error_message: err.message,
        processed_at: now,
      })
      .eq('stripe_event_id', event.id);

    return NextResponse.json(
      { error: 'Webhook processing error' },
      { status: 500 }
    );
  }
}
