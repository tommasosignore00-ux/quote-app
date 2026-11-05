import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminClient, corsHeaders, getRequestUser, jsonResponse } from '../_shared/auth.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
const APP_URL = Deno.env.get('APP_URL') || 'http://localhost:3000'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await getRequestUser(req)
    if (!user) return jsonResponse({ error: 'Non autenticato' }, 401)

    // Il customer Stripe si legge dal profilo dell'utente, mai dal client
    const { data: profile } = await adminClient()
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()
    const customerId = profile?.stripe_customer_id

    if (!customerId) {
      return jsonResponse({ error: 'Nessun abbonamento Stripe associato' }, 400)
    }

    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: customerId,
        return_url: `${APP_URL}/subscription`,
      }),
    })

    const portal = await portalRes.json()

    if (!portal.url) {
      return jsonResponse({ error: portal.error?.message || 'Failed to create portal session' }, 400)
    }

    return jsonResponse({ url: portal.url })
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})
