import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
const APP_URL = Deno.env.get('APP_URL') || 'http://localhost:3000'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: { 
        'Access-Control-Allow-Origin': '*', 
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' 
      } 
    })
  }

  try {
    const { customerId } = await req.json()
    
    if (!customerId) {
      return new Response(
        JSON.stringify({ error: 'Missing customerId' }), 
        { status: 400 }
      )
    }

    // Create Stripe Customer Portal session
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
      return new Response(
        JSON.stringify({ error: portal.error?.message || 'Failed to create portal session' }), 
        { status: 400 }
      )
    }

    return new Response(JSON.stringify({ url: portal.url }), {
      headers: { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
      },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
      },
    })
  }
})
