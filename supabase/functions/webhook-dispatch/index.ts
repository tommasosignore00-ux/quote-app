import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { profile_id, event_type, payload } = await req.json()
    if (!profile_id || !event_type) {
      return new Response(JSON.stringify({ error: 'Missing profile_id or event_type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Fetch active webhook endpoints for this user and event
    const { data: endpoints } = await supabase
      .from('webhook_endpoints')
      .select('*')
      .eq('profile_id', profile_id)
      .eq('active', true)
      .contains('events', [event_type])

    const results = []

    for (const endpoint of endpoints || []) {
      const body = JSON.stringify({
        event: event_type,
        data: payload,
        timestamp: new Date().toISOString(),
      })

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      // HMAC-SHA256 signature if secret is configured
      if (endpoint.secret) {
        const encoder = new TextEncoder()
        const key = await crypto.subtle.importKey(
          'raw',
          encoder.encode(endpoint.secret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        )
        const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
        const hexSig = Array.from(new Uint8Array(signature))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')
        headers['X-Webhook-Signature'] = hexSig
      }

      let responseStatus = 0
      let success = false

      try {
        const response = await fetch(endpoint.url, {
          method: 'POST',
          headers,
          body,
        })
        responseStatus = response.status
        success = response.ok
      } catch {
        responseStatus = 0
        success = false
      }

      // Log delivery
      await supabase.from('webhook_deliveries').insert({
        webhook_id: endpoint.id,
        event_type,
        payload,
        response_status: responseStatus,
        success,
      })

      results.push({ endpoint_id: endpoint.id, success, status: responseStatus })
    }

    return new Response(JSON.stringify({ dispatched: results.length, results }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
