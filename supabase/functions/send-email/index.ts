import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, getRequestUser, jsonResponse } from '../_shared/auth.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'noreply@quoteapp.it'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Solo utenti autenticati: altrimenti la funzione sarebbe un relay di spam
    const user = await getRequestUser(req)
    if (!user) return jsonResponse({ error: 'Non autenticato' }, 401)

    const { to, subject, html, pdfBase64, pdfFilename } = await req.json()

    if (!to || !subject || !html) {
      return jsonResponse({ error: 'Missing to, subject, or html' }, 400)
    }

    // Build form data for email with optional PDF attachment
    const formData = new FormData()
    formData.append('from', EMAIL_FROM)
    formData.append('to', to)
    formData.append('subject', subject)
    formData.append('html', html)
    if (user.email) formData.append('reply_to', user.email)

    // Add PDF attachment if provided
    if (pdfBase64 && pdfFilename) {
      const binaryString = atob(pdfBase64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      const blob = new Blob([bytes], { type: 'application/pdf' })
      formData.append('attachments', blob, pdfFilename)
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: formData,
    })

    const emailData = await emailRes.json()

    if (!emailRes.ok) {
      // Every response carries CORS headers: without them the browser hides the reason.
      console.error('Resend rejected the email:', emailRes.status, emailData)
      return jsonResponse({ error: emailData.message || 'Failed to send email' }, 400)
    }

    return jsonResponse({ id: emailData.id, success: true })
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})
