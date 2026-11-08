import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getRequestUser, unauthorizedResponse } from '@/lib/apiAuth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rate-limit';
import { findLeftovers, removeAccountFiles } from '@/lib/accountData';

export const dynamic = 'force-dynamic';

// A stolen phone or an open tab must not be enough to erase an account.
const FRESH_SIGN_IN_MINUTES = 15;

// TODO(legale): regola PROVVISORIA finché il legale non fissa la conservazione delle
// fatture. Oggi un account con fatture non viene mai cancellato in automatico.
const BLOCK_WHEN_INVOICES_EXIST = true;

const ACTIVE_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'paused',
]);

async function cancelStripeSubscriptions(profile: {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}) {
  if (!profile.stripe_customer_id && !profile.stripe_subscription_id) return;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  const ids = new Set<string>();
  if (profile.stripe_subscription_id) ids.add(profile.stripe_subscription_id);
  if (profile.stripe_customer_id) {
    const list = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: 'all',
      limit: 100,
    });
    for (const subscription of list.data) {
      if (ACTIVE_STATUSES.has(subscription.status)) ids.add(subscription.id);
    }
  }

  for (const id of ids) {
    try {
      await stripe.subscriptions.cancel(id);
    } catch (err) {
      // Already gone on Stripe: a retry after a partial failure must get through.
      const code = (err as { code?: string }).code;
      const status = (err as { statusCode?: number }).statusCode;
      if (code !== 'resource_missing' && status !== 404) throw err;
    }
  }
}

export async function POST(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return unauthorizedResponse();

  const limit = await rateLimit(`account-delete:${user.id}`, {
    maxRequests: 5,
    windowMs: 3_600_000,
  });
  if (!limit.success) {
    return NextResponse.json(
      { error: 'Troppi tentativi. Riprova più tardi.' },
      { status: 429 }
    );
  }

  const signedInAt = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0;
  if (Date.now() - signedInAt > FRESH_SIGN_IN_MINUTES * 60_000) {
    return NextResponse.json(
      {
        code: 'REAUTH_REQUIRED',
        error: `Per sicurezza esci, accedi di nuovo e riprova entro ${FRESH_SIGN_IN_MINUTES} minuti.`,
      },
      { status: 403 }
    );
  }

  try {
    if (BLOCK_WHEN_INVOICES_EXIST) {
      const { count, error } = await supabaseAdmin
        .from('fatture')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', user.id);
      if (error) throw new Error(error.message);
      if (count) {
        return NextResponse.json(
          {
            code: 'HAS_INVOICES',
            error:
              `Il tuo account contiene ${count === 1 ? 'una fattura' : `${count} fatture`}, che potrebbero dover essere conservate per legge, quindi non possiamo eliminarlo in automatico. ` +
              "Scarica prima l'export dei tuoi dati e poi scrivi all'assistenza: ti aiuteremo a completare la cancellazione.",
          },
          { status: 409 }
        );
      }
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    // Billing first: if anything fails later the user can retry, and is not charged
    // for an account that no longer exists.
    if (profile) await cancelStripeSubscriptions(profile);
    await removeAccountFiles(user.id);

    // Not linked by a cascade: these rows keep billing data and IP addresses.
    if (profile?.stripe_customer_id) {
      await supabaseAdmin
        .from('stripe_webhook_events')
        .delete()
        .eq('payload->>customer', profile.stripe_customer_id);
    }
    await supabaseAdmin.from('audit_logs').delete().eq('user_id', user.id);

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error(deleteError.message);

    const leftovers = await findLeftovers(user.id);
    if (leftovers.length) {
      console.error('Account deletion left rows in:', leftovers.join(', '));
    }

    // Records that a deletion happened, and nothing about who asked for it.
    const { error: auditError } = await supabaseAdmin.from('audit_logs').insert({
      user_id: null,
      action: 'account_deleted',
      resource_type: 'account',
      resource_id: null,
    });
    if (auditError) console.error('Account deletion audit row not written');

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(
      'Account deletion failed:',
      err instanceof Error ? err.name : 'unknown'
    );
    return NextResponse.json(
      {
        error:
          "Non è stato possibile eliminare l'account. Riprova o scrivi all'assistenza.",
      },
      { status: 500 }
    );
  }
}
