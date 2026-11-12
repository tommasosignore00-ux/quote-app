import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminClient, corsHeaders, getRequestUser, jsonResponse } from '../_shared/auth.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'Mastrovoce <noreply@mastrovoce.it>'
// Same values as lib/QuoteTemplate.ts on web and mobile.
const ACCEPTANCE_LINK_MARKER = '<!--QUOTE_ACCEPTANCE_LINK-->'
const ACCEPTANCE_URL_MARKER = 'https://accettazione.invalid/preventivo'

/**
 * Sender shown to the client: the user's company name with the app's sending address
 * ("Rossi Impianti <preventivi@dominio.it>"); replies go to the user (reply_to).
 * Email providers only accept addresses of verified domains, so the address itself
 * cannot be the user's personal mailbox.
 */
async function senderFor(userId: string): Promise<string> {
  const address = (EMAIL_FROM.match(/<([^>]+)>/)?.[1] || EMAIL_FROM).trim()
  const { data } = await adminClient().from('profiles').select('company_name').eq('id', userId).maybeSingle()
  const name = String(data?.company_name || '')
    .replace(/[<>"\r\n\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70)
  return name ? `"${name}" <${address}>` : EMAIL_FROM
}

/**
 * Outlook desktop and other mail apps ignore the <style> block of a quote template:
 * copy its rules onto each element (the block stays for the apps that support it).
 * If inlining fails for any reason the email goes out unchanged.
 */
async function inlineCss(html: string): Promise<string> {
  try {
    const { default: juice } = await import('npm:juice@11.1.1')
    return juice(html, {
      removeStyleTags: false,
      preserveMediaQueries: true,
      applyWidthAttributes: true,
      applyAttributesTableElements: true,
    })
  } catch (err) {
    console.warn('CSS inlining skipped:', (err as Error).message)
    return html
  }
}

const DAILY_EMAIL_LIMIT = 100
const MAX_PDF_BYTES = 8 * 1024 * 1024
const LEGACY_MATCH_WINDOW_MS = 30 * 60 * 1000

type StoredVersion = {
  id: string
  revision: number
  html_content: string | null
  recipient_email: string | null
  public_token: string | null
  sent_at: string | null
  lavori: { profile_id: string; title: string }
}

const VERSION_COLUMNS =
  'id, revision, html_content, recipient_email, public_token, sent_at, lavori!inner(profile_id, title)'

function isEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value)
}

function headerText(value: string, max: number): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Button added to the email only: the stored document stays the plain quote. */
function withAcceptanceLink(html: string, token: string | null, appUrl: string): string {
  if (!token) return html
  const url = `${appUrl.replace(/\/$/, '')}/q/${encodeURIComponent(token)}`
  const block = `<div style="margin:24px 0;text-align:center;font-family:Arial,sans-serif">
    <a href="${url}" style="display:inline-block;background:#1f2937;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Visualizza e accetta il preventivo</a>
    <p style="color:#64748b;font-size:12px;margin-top:8px">Puoi accettarlo o rifiutarlo online, senza registrarti.</p>
  </div>`
  // The company's template decides where the link goes ({{acceptanceLink}} / {{acceptanceUrl}}).
  if (html.includes(ACCEPTANCE_LINK_MARKER) || html.includes(ACCEPTANCE_URL_MARKER)) {
    return html.split(ACCEPTANCE_LINK_MARKER).join(block).split(ACCEPTANCE_URL_MARKER).join(url)
  }
  return html.includes('</body>') ? html.replace('</body>', `${block}</body>`) : `${html}${block}`
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function validPdf(base64: unknown): string | null {
  if (typeof base64 !== 'string' || !base64) return null
  if (base64.length > Math.ceil((MAX_PDF_BYTES * 4) / 3) + 4) return null
  try {
    return atob(base64.slice(0, 8)).startsWith('%PDF-') ? base64 : null
  } catch {
    return null
  }
}

/** Current clients name the revision; builds already in the field send only the address. */
async function findVersion(userId: string, body: Record<string, unknown>): Promise<StoredVersion | null> {
  const admin = adminClient()
  if (typeof body.lavoroId === 'string' && Number.isInteger(body.revision)) {
    const { data } = await admin
      .from('preventivi_versioni')
      .select(VERSION_COLUMNS)
      .eq('lavoro_id', body.lavoroId)
      .eq('revision', body.revision as number)
      .eq('lavori.profile_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data as unknown as StoredVersion | null
  }
  if (isEmail(body.to)) {
    // Transition for old builds: remove once they are retired. Their html is ignored.
    const { data } = await admin
      .from('preventivi_versioni')
      .select(VERSION_COLUMNS)
      .eq('recipient_email', body.to)
      .eq('lavori.profile_id', userId)
      .is('sent_at', null)
      .gte('created_at', new Date(Date.now() - LEGACY_MATCH_WINDOW_MS).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data as unknown as StoredVersion | null
  }
  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await getRequestUser(req)
    if (!user) return jsonResponse({ error: 'Non autenticato' }, 401)

    const appUrl = Deno.env.get('APP_URL')
    if (!RESEND_API_KEY || !appUrl) {
      console.error('send-email is missing RESEND_API_KEY or APP_URL')
      return jsonResponse({ error: 'Invio email non configurato' }, 503)
    }

    const admin = adminClient()
    const { data: entitled, error: entitlementError } = await admin.rpc('profile_is_entitled', {
      p_profile_id: user.id,
    })
    if (entitlementError) return jsonResponse({ error: 'Servizio temporaneamente non disponibile' }, 503)
    if (entitled !== true) {
      return jsonResponse({ error: 'Serve un abbonamento attivo per inviare preventivi.', code: 'SUBSCRIPTION_REQUIRED' }, 402)
    }

    // No working counter means no sending: this endpoint must not become a spam relay.
    const { data: limit, error: limitError } = await admin.rpc('consume_rate_limit', {
      p_key: `email:user:${user.id}`,
      p_limit: DAILY_EMAIL_LIMIT,
      p_window_seconds: 86400,
    })
    const limitRow = Array.isArray(limit) ? limit[0] : limit
    if (limitError || !limitRow) return jsonResponse({ error: 'Servizio temporaneamente non disponibile' }, 503)
    if (!limitRow.allowed) {
      return jsonResponse({ error: 'Hai raggiunto il limite giornaliero di email. Riprova domani.', code: 'EMAIL_DAILY_LIMIT' }, 429)
    }

    const body = (await req.json()) as Record<string, unknown>
    const version = await findVersion(user.id, body)
    if (!version?.html_content) return jsonResponse({ error: 'Preventivo non trovato' }, 404)
    if (version.sent_at) return jsonResponse({ error: 'Questa revisione è già stata inviata' }, 409)
    if (!isEmail(version.recipient_email)) return jsonResponse({ error: 'Destinatario non valido' }, 400)

    const sender = await senderFor(user.id)
    const company = sender.startsWith('"') ? sender.slice(1, sender.indexOf('"', 1)) : ''
    const title = headerText(version.lavori.title, 120)

    const email: Record<string, unknown> = {
      from: sender,
      to: [version.recipient_email],
      subject: headerText(company ? `Preventivo ${company} - ${title}` : `Preventivo - ${title}`, 200),
      html: await inlineCss(withAcceptanceLink(version.html_content, version.public_token, appUrl)),
    }
    if (user.email) email.reply_to = user.email

    if (body.pdfBase64 !== undefined && body.pdfBase64 !== null) {
      const pdf = validPdf(body.pdfBase64)
      if (!pdf) return jsonResponse({ error: 'Allegato PDF non valido o troppo grande' }, 400)
      const name = title.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'documento'
      email.attachments = [{ filename: `Preventivo_${name}_rev${version.revision}.pdf`, content: pdf }]
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(email),
    })
    const emailData = await emailRes.json().catch(() => ({}))

    if (!emailRes.ok) {
      console.error('Resend rejected the email:', emailRes.status, emailData?.name)
      return jsonResponse({ error: 'Invio email non riuscito' }, 502)
    }

    const { error: markError } = await admin
      .from('preventivi_versioni')
      .update({
        sent_via_email: true,
        sent_at: new Date().toISOString(),
        content_sha256: await sha256Hex(version.html_content),
      })
      .eq('id', version.id)
    if (markError) console.error('Could not mark the version as sent:', markError.code)

    return jsonResponse({ id: emailData.id, success: true })
  } catch (err) {
    console.error('send-email failed:', (err as Error).name)
    return jsonResponse({ error: 'Invio email non riuscito' }, 500)
  }
})
