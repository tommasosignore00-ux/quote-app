import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Content-Type': 'application/json',
}

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

/**
 * Utente autenticato dal token di sessione (Authorization: Bearer <access_token>).
 * La chiave anon NON identifica un utente: in quel caso restituisce null.
 */
export async function getRequestUser(req: Request): Promise<User | null> {
  const token = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!token) return null
  const { data, error } = await adminClient().auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

/** Per job interni (cron): service role key oppure header x-cron-secret = CRON_SECRET. */
export function isInternalCall(req: Request): boolean {
  const token = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (token && SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) return true
  const cronSecret = Deno.env.get('CRON_SECRET')
  return Boolean(cronSecret && req.headers.get('x-cron-secret') === cronSecret)
}
