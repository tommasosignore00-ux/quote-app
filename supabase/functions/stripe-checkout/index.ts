import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, jsonResponse } from '../_shared/auth.ts'

// The mobile app no longer sells subscriptions (App Store and Play Store rules):
// subscribing happens on the website only, through web/lib/checkout.ts.
serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  return jsonResponse(
    { error: "L'abbonamento non si attiva dall'app.", code: 'CHECKOUT_MOVED' },
    410
  )
})
