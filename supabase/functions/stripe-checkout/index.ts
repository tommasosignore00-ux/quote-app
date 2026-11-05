import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminClient, corsHeaders, getRequestUser, jsonResponse } from '../_shared/auth.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
const STRIPE_PRICE_MONTHLY = Deno.env.get('STRIPE_PRICE_MONTHLY')
const STRIPE_PRICE_YEARLY = Deno.env.get('STRIPE_PRICE_YEARLY')
const STRIPE_PRICE_TEAM = Deno.env.get('STRIPE_PRICE_TEAM')
const APP_URL = Deno.env.get('APP_URL') || 'http://localhost:3000'

async function stripePost(path: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  })
  return await res.json()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await getRequestUser(req)
    if (!user) return jsonResponse({ error: 'Non autenticato' }, 401)

    const { priceId } = await req.json()

    // Solo i piani configurati sul server: mai un price id arbitrario dal client
    const finalPriceId =
      priceId === 'monthly' ? STRIPE_PRICE_MONTHLY
      : priceId === 'yearly' ? STRIPE_PRICE_YEARLY
      : priceId === 'team' ? STRIPE_PRICE_TEAM
      : undefined
    if (!finalPriceId) return jsonResponse({ error: 'Piano non valido' }, 400)

    const supabase = adminClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at, is_founding_member, company_name')
      .eq('id', user.id)
      .single()

    // Customer Stripe dell'utente (creato se manca), con userId nei metadata per il webhook
    let customerId: string | null = profile?.stripe_customer_id || null
    if (!customerId) {
      const customer = await stripePost('customers', {
        ...(user.email ? { email: user.email } : {}),
        ...(profile?.company_name ? { name: profile.company_name } : {}),
        'metadata[userId]': user.id,
      })
      if (!customer.id) {
        return jsonResponse({ error: customer.error?.message || 'Creazione cliente Stripe non riuscita' }, 400)
      }
      customerId = customer.id as string
      await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
    }

    const hadSubscriptionBefore = Boolean(
      profile?.stripe_subscription_id || profile?.subscription_status || profile?.trial_ends_at
    )
    // Lo sconto founding member si decide dal profilo, non dal client
    const isFoundingMember = profile?.is_founding_member === true

    const checkout = await stripePost('checkout/sessions', {
      customer: customerId,
      'line_items[0][price]': finalPriceId,
      'line_items[0][quantity]': '1',
      mode: 'subscription',
      success_url: `${APP_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/subscription/cancel`,
      locale: 'it',
      'subscription_data[metadata][userId]': user.id,
      ...(!hadSubscriptionBefore ? { 'subscription_data[trial_period_days]': '7' } : {}),
      ...(isFoundingMember ? { 'discounts[0][coupon]': 'hiYX4PTU' } : { allow_promotion_codes: 'true' }),
    })

    if (!checkout.url) {
      return jsonResponse({ error: checkout.error?.message || 'Failed to create checkout' }, 400)
    }

    return jsonResponse({ url: checkout.url, sessionId: checkout.id })
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})
