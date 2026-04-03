import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
const STRIPE_PRICE_MONTHLY = Deno.env.get('STRIPE_PRICE_MONTHLY')
const STRIPE_PRICE_YEARLY = Deno.env.get('STRIPE_PRICE_YEARLY')
const STRIPE_PRICE_TEAM = Deno.env.get('STRIPE_PRICE_TEAM')
const APP_URL = Deno.env.get('APP_URL') || 'http://localhost:3000'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const { priceId, customerId, appType, isFoundingMember } = await req.json()
    
    if (!priceId || !customerId) {
      return new Response(JSON.stringify({ error: 'Missing priceId or customerId' }), { status: 400 })
    }

    // Determine price based on priceId or use provided one
    const finalPriceId = priceId === 'monthly' ? STRIPE_PRICE_MONTHLY : priceId === 'yearly' ? STRIPE_PRICE_YEARLY : priceId === 'team' ? STRIPE_PRICE_TEAM : priceId

    // Create Stripe checkout session
    const checkoutRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: customerId,
        'line_items[0][price]': finalPriceId,
        'line_items[0][quantity]': '1',
        mode: 'subscription',
        success_url: `${APP_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL}/subscription/cancel`,
        locale: 'it',
        ...(isFoundingMember ? { 'discounts[0][coupon]': 'hiYX4PTU' } : { allow_promotion_codes: 'true' }),
      }),
    })

    const checkout = await checkoutRes.json()

    if (!checkout.url) {
      return new Response(JSON.stringify({ error: checkout.error?.message || 'Failed to create checkout' }), { status: 400 })
    }

    return new Response(JSON.stringify({ url: checkout.url, sessionId: checkout.id }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
