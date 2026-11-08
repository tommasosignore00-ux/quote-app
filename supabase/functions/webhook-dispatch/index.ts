import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getRequestUser, isInternalCall, jsonResponse } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const MAX_ENDPOINTS_PER_DISPATCH = 5
const DELIVERY_TIMEOUT_MS = 5000

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true
  const [a, b] = parts
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 198 && (b === 18 || b === 19))
  )
}

function isPrivateIpv6(ip: string): boolean {
  const value = ip.toLowerCase().replace(/^\[|\]$/g, '')
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIpv4(mapped[1])
  return (
    value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') ||
    /^fe[89ab]/.test(value) || value.startsWith('ff') || value.startsWith('::ffff:') ||
    value.startsWith('64:ff9b:') || value.startsWith('2001:db8:')
  )
}

/** Only public HTTPS targets on port 443; every resolved address must be public. */
async function isAllowedTarget(rawUrl: string): Promise<boolean> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password) return false

  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false
  if (/^\d+(\.\d+){3}$/.test(host)) return !isPrivateIpv4(host)
  if (host.includes(':') || host.startsWith('[')) return !isPrivateIpv6(host)

  const [v4, v6] = await Promise.all([
    Deno.resolveDns(host, 'A').catch(() => [] as string[]),
    Deno.resolveDns(host, 'AAAA').catch(() => [] as string[]),
  ])
  if (v4.length + v6.length === 0) return false
  return v4.every((ip) => !isPrivateIpv4(ip)) && v6.every((ip) => !isPrivateIpv6(ip))
}

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

    // Un utente può far partire solo i propri webhook
    if (!isInternalCall(req)) {
      const user = await getRequestUser(req)
      if (!user) return jsonResponse({ error: 'Non autenticato' }, 401)
      if (profile_id && profile_id !== user.id) return jsonResponse({ error: 'Accesso negato' }, 403)
    }
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
      .limit(MAX_ENDPOINTS_PER_DISPATCH)

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

      let success = false
      try {
        if (await isAllowedTarget(endpoint.url)) {
          const response = await fetch(endpoint.url, {
            method: 'POST',
            headers,
            body,
            redirect: 'manual',
            signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
          })
          await response.body?.cancel()
          success = response.ok
        }
      } catch {
        success = false
      }

      // The remote status is not stored or returned: it would reveal what the target is.
      await supabase.from('webhook_deliveries').insert({
        webhook_id: endpoint.id,
        event_type,
        payload,
        success,
      })

      results.push(success)
    }

    return new Response(JSON.stringify({ dispatched: results.length }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invio non riuscito' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
