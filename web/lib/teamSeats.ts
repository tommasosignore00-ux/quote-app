import Stripe from 'stripe';
import { supabaseAdmin } from './supabase-server';
import { TEAM_INCLUDED_USERS } from './checkout';

/**
 * Puts on the owner's Stripe subscription one "extra user" seat for every accepted
 * member beyond the included users (owner counted). Stripe prorates the change.
 * Never throws: a failure is logged and the next change corrects it.
 */
export async function syncTeamSeats(ownerId: string): Promise<void> {
  try {
    const seatPrice = process.env.STRIPE_PRICE_TEAM_SEAT;
    if (!seatPrice || !process.env.STRIPE_SECRET_KEY) return;

    const [{ data: owner }, { count }] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('stripe_subscription_id, team_plan')
        .eq('id', ownerId)
        .single(),
      supabaseAdmin
        .from('team_members')
        .select('id', { count: 'exact', head: true })
        .eq('team_owner_id', ownerId)
        .eq('active', true)
        .not('accepted_at', 'is', null),
    ]);
    if (!owner?.stripe_subscription_id || owner.team_plan !== true) return;

    const extra = Math.max(0, (count ?? 0) + 1 - TEAM_INCLUDED_USERS);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const subscription = await stripe.subscriptions.retrieve(
      owner.stripe_subscription_id
    );
    const item = subscription.items.data.find((entry) => entry.price.id === seatPrice);

    if (extra === 0) {
      if (item)
        {await stripe.subscriptionItems.del(item.id, {
          proration_behavior: 'create_prorations',
        });}
    } else if (!item) {
      await stripe.subscriptionItems.create({
        subscription: subscription.id,
        price: seatPrice,
        quantity: extra,
        proration_behavior: 'create_prorations',
      });
    } else if (item.quantity !== extra) {
      await stripe.subscriptionItems.update(item.id, {
        quantity: extra,
        proration_behavior: 'create_prorations',
      });
    }
  } catch (err) {
    console.error('Team seat sync failed:', (err as Error).message?.slice(0, 200));
  }
}
