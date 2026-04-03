import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'noreply@quoteapp.it'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const { to, subject, html, pdfBase64, pdfFilename } = await req.json()

    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ error: 'Missing to, subject, or html' }), { status: 400 })
    }

    // Build form data for email with optional PDF attachment
    const formData = new FormData()
    formData.append('from', EMAIL_FROM)
    formData.append('to', to)
    formData.append('subject', subject)
    formData.append('html', html)

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
      return new Response(JSON.stringify({ error: emailData.message || 'Failed to send email' }), { status: 400 })
    }

    return new Response(JSON.stringify({ id: emailData.id, success: true }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
