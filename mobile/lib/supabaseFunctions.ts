import { supabase } from '../lib/supabase'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''

export const stripeCheckout = async (priceId: 'monthly' | 'yearly' | 'team', userId: string, isFoundingMember?: boolean) => {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-checkout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        priceId,
        customerId: userId,
        appType: 'mobile',
        isFoundingMember: isFoundingMember || false,
      }),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Checkout failed')
    return data
  } catch (err) {
    throw err
  }
}

export const sendEmail = async (to: string, subject: string, html: string, pdfBase64?: string, pdfFilename?: string) => {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        subject,
        html,
        pdfBase64,
        pdfFilename,
      }),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Email failed')
    return data
  } catch (err) {
    throw err
  }
}

export const stripePortal = async (customerId: string) => {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-portal`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
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
