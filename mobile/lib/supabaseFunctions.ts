import { supabase } from '../lib/supabase'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''

/**
 * Header per le Edge Functions: token di sessione dell'utente (non la chiave anon),
 * così la funzione sa chi sta chiamando.
 */
export const getFunctionHeaders = async (extra: Record<string, string> = {}): Promise<Record<string, string>> => {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessione scaduta: effettua di nuovo l\'accesso')
  return { ...extra, apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
}

export const stripeCheckout = async (priceId: 'monthly' | 'yearly' | 'team', userId: string, isFoundingMember?: boolean) => {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-checkout`, {
      method: 'POST',
      headers: await getFunctionHeaders({ 'Content-Type': 'application/json' }),
      // Customer Stripe e sconto founding member vengono decisi dal server
      body: JSON.stringify({ priceId, appType: 'mobile' }),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Checkout failed')
    return data
  } catch (err) {
    throw err
  }
}

/** The server loads the saved revision and its recipient: the client sends only the reference. */
export const sendQuoteEmail = async (lavoroId: string, revision: number, pdfBase64?: string) => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: 'POST',
    headers: await getFunctionHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ lavoroId, revision, pdfBase64 }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Invio email non riuscito')
  return data
}

export const stripePortal = async (customerId: string) => {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-portal`, {
      method: 'POST',
      headers: await getFunctionHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        customerId,
      }),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Portal creation failed')
    return data
  } catch (err) {
    throw err
  }
}
