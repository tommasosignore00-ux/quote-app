import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const OPENAI_TRANSCRIBE_MODEL = Deno.env.get('OPENAI_TRANSCRIBE_MODEL') || 'whisper-1'
const OPENAI_AGENT_MODEL = Deno.env.get('OPENAI_AGENT_MODEL') || 'gpt-4o-mini'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const voiceAgentSystemPrompt = `Sei l'agente AI operativo di un'app per preventivi.

RUOLO
Interpreta input vocale/testuale e restituisci SOLO JSON operativo. Nessun testo extra.

CONTESTO DISPONIBILE
Ricevi un oggetto "CONTESTO APP (JSON)" con:
- lingua app e lingua input
- azienda (country, locale, currency, defaultVatRate)
- currentCustomer, currentJob, currentQuote
- existingCustomers, existingJobs
- eventuale catalogItems (listino)

OBIETTIVO
Trasformare il comando utente in un piano sicuro e immediatamente eseguibile per:
- clienti
- lavori
- voci di preventivo
- traduzione contenuti di preventivo

REGOLE CRITICHE
1. Non inventare mai dati mancanti (prezzi, clienti, codici, quantita).
2. Se currentCustomer/currentJob/currentQuote esistono, usali come riferimento primario.
3. Se esiste listino (catalogItems), usalo come fonte preferita per descrizioni coerenti.
4. Se il match listino non e certo, mantieni description testuale e NON inventare unitPrice.
5. Se mancano dati essenziali, usa intent="clarification_needed" con domande brevi.
6. Per translate_quote traduci SOLO testo; non alterare numeri, importi, quantita, aliquote.
7. Adatta lingua e terminologia al paese/locale aziendale.
8. In presenza di piu azioni, usa intent="mixed" e valorizza comunque il blocco legacy piu utile subito.

PRIORITA LEGACY (fondamentale)
- Se richiesta principale e creare cliente -> legacy.action="create_cliente" con data.name.
- Se richiesta principale e creare lavoro -> legacy.action="create_lavoro" con data.title e cliente_id o cliente_name.
- Se richiesta principale e aggiungere/modificare voce costo -> legacy.action="add_costo" con almeno data.description.
- Se non eseguibile subito -> legacy.action="none".

SCHEMA RISPOSTA OBBLIGATORIO
{
  "intent": "create_customer" | "update_customer" | "create_job" | "update_job" | "create_quote" | "update_quote" | "add_quote_items" | "edit_quote_items" | "remove_quote_items" | "translate_quote" | "mixed" | "clarification_needed",
  "summary": string | null,
  "legacy": {
    "action": "create_cliente" | "create_lavoro" | "add_costo" | "none",
    "data": object
  },
  "customer": {
    "action": "create" | "update" | "none",
    "id": string | null,
    "name": string | null
  },
  "job": {
    "action": "create" | "update" | "none",
    "id": string | null,
    "title": string | null,
    "customerId": string | null,
    "customerName": string | null
  },
  "quote": {
    "action": "create" | "update" | "none",
    "jobId": string | null,
    "customerId": string | null,
    "items": [
      {
        "description": string | null,
        "quantity": number | null,
        "unit": string | null,
        "unitPrice": number | null,
        "vatRate": number | null
      }
    ]
  },
  "translation": {
    "targetLanguage": string | null,
    "translatedText": string | null
  },
  "clarification": {
    "needed": boolean,
    "questions": string[]
  }
}

VINCOLI FINALI
- Output in JSON valido.
- Nessun commento, markdown o spiegazione fuori JSON.
- Meglio null che dato inventato.`

async function getEmbeddingWithCache(
  supabase: ReturnType<typeof createClient>,
  text: string
): Promise<number[]> {
  const normalised = text.trim().toLowerCase()
  const encoded = new TextEncoder().encode(normalised)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const textHash = hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('')

  const { data: cached } = await supabase
    .from('embedding_cache')
    .select('embedding')
    .eq('text_hash', textHash)
    .maybeSingle()

  if (cached?.embedding) {
    await supabase.from('embedding_cache').update({ last_used_at: new Date().toISOString() }).eq('text_hash', textHash)
    return cached.embedding
  }

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'text-embedding-ada-002', input: normalised }),
  })
  const json = await res.json()
  const embedding: number[] = json.data?.[0]?.embedding || []

  if (embedding.length > 0) {
    await supabase.from('embedding_cache').upsert({
      text_hash: textHash,
      text_content: normalised,
      embedding,
      last_used_at: new Date().toISOString(),
    }, { onConflict: 'text_hash' })
  }

  return embedding
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const authHeader = req.headers.get('authorization') || ''
    let userId: string | null = null
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user } } = await supabase.auth.getUser(token)
      userId = user?.id || null
    }

    const formData = await req.formData()
    const audio = formData.get('audio') as File | null
    if (!audio) {
      return new Response(JSON.stringify({ error: 'No audio' }), { status: 400, headers: corsHeaders })
    }

    const transcriptionFormData = new FormData()
    transcriptionFormData.append('file', audio)
    transcriptionFormData.append('model', OPENAI_TRANSCRIBE_MODEL)

    const transcriptionRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: transcriptionFormData,
    })
    const transcription = await transcriptionRes.json()
    const text = String(transcription.text || '').trim()

    if (!text) {
      return new Response(JSON.stringify({ action: 'none', data: {}, text: '', agent: null }), { headers: corsHeaders })
    }

    if (userId) {
      const { data: mapping } = await supabase
        .from('user_command_mappings')
        .select('mapped_description, listino_item_id')
        .eq('profile_id', userId)
        .ilike('raw_text', `%${text.toLowerCase()}%`)
        .order('usage_count', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (mapping) {
        return new Response(JSON.stringify({
          action: 'add_costo',
          data: { description: mapping.mapped_description, listino_item_id: mapping.listino_item_id },
          text,
          mapped: true,
          agent: {
            intent: 'add_quote_items',
            summary: 'Comando risolto da una correzione utente salvata.',
            legacy: {
              action: 'add_costo',
              data: { description: mapping.mapped_description, listino_item_id: mapping.listino_item_id },
            },
          },
        }), { headers: corsHeaders })
      }
    }

    const context = buildVoiceAgentContext(formData)
    const completionRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_AGENT_MODEL,
        messages: [
          { role: 'system', content: voiceAgentSystemPrompt },
          {
            role: 'user',
            content: [
              'Analizza l\'input utente e il contesto reale dell\'app.',
              'Restituisci solo JSON coerente con lo schema richiesto.',
              '',
              'INPUT UTENTE:',
              text,
              '',
              'CONTESTO APP (JSON):',
              JSON.stringify(context, null, 2),
            ].join('\n'),
          },
        ],
        response_format: { type: 'json_object' },
      }),
    })

    const completion = await completionRes.json()
    const content = completion.choices?.[0]?.message?.content || '{}'
    const rawAgent = JSON.parse(content)
    const legacy = toLegacyAction(rawAgent, context)

    if (legacy.action === 'add_costo' && text) {
      getEmbeddingWithCache(supabase, text).catch(() => {})
    }

    return new Response(JSON.stringify({
      action: legacy.action,
      data: legacy.data,
      text,
      agent: {
        ...rawAgent,
        legacy,
      },
      raw: rawAgent,
    }), { headers: corsHeaders })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})

function buildVoiceAgentContext(formData: FormData) {
  const contextFromClient = parseJsonField(formData, 'context')
  if (contextFromClient) {
    return {
      appLanguage: contextFromClient.appLanguage ?? null,
      selectedInputLanguage: contextFromClient.selectedInputLanguage ?? null,
      company: contextFromClient.company ?? null,
      userIntentMode: contextFromClient.userIntentMode ?? 'voice_or_text',
      currentCustomer: contextFromClient.currentCustomer ?? null,
      currentJob: contextFromClient.currentJob ?? null,
      currentQuote: contextFromClient.currentQuote ?? null,
      existingCustomers: contextFromClient.existingCustomers ?? [],
      existingJobs: contextFromClient.existingJobs ?? [],
      catalogItems: contextFromClient.catalogItems ?? [],
    }
  }

  const legacyCustomers = parseJsonField(formData, 'clienti') || []
  const existingJobs = parseJsonField(formData, 'lavori') || []
  const catalogItems = parseJsonField(formData, 'catalogItems') || []
  const currentCustomer = parseJsonField(formData, 'currentCustomer')
  const currentJob = parseJsonField(formData, 'currentJob')
  const currentQuote = parseJsonField(formData, 'currentQuote')

  return {
    appLanguage: getStringField(formData, 'appLanguage') || getStringField(formData, 'selectedLanguage') || null,
    selectedInputLanguage: getStringField(formData, 'inputLanguage') || getStringField(formData, 'selectedLanguage') || null,
    userIntentMode: 'voice_or_text',
    company: {
      name: getStringField(formData, 'companyName') || null,
      country: getStringField(formData, 'companyCountry') || null,
      locale: getStringField(formData, 'companyLocale') || null,
      currency: getStringField(formData, 'companyCurrency') || null,
      vatMode: getStringField(formData, 'vatMode') || null,
      defaultVatRate: getNumberField(formData, 'defaultVatRate'),
    },
    currentCustomer: currentCustomer || null,
    currentJob: currentJob || null,
    currentQuote: currentQuote || null,
    existingCustomers: legacyCustomers.map((customer: { id: string; name: string }) => ({
      id: customer.id,
      name: customer.name,
      companyName: customer.name,
    })),
    existingJobs,
    catalogItems,
  }
}

function toLegacyAction(agent: any, context: any) {
  const explicit = agent?.legacy
  if (explicit?.action) {
    return {
      action: explicit.action,
      data: explicit.data || {},
    }
  }

  const intent = String(agent?.intent || '')
  const customerName = agent?.customer?.name || agent?.job?.customerName || null
  const customerId = agent?.customer?.id || agent?.job?.customerId || context?.currentCustomer?.id || null
  const jobTitle = agent?.job?.title || null
  const firstItem = Array.isArray(agent?.quote?.items) ? agent.quote.items[0] : null

  if (intent === 'create_customer' && customerName) {
    return {
      action: 'create_cliente',
      data: { name: customerName },
    }
  }

  if (intent === 'create_job' && jobTitle) {
    return {
      action: 'create_lavoro',
      data: {
        title: jobTitle,
        cliente_id: customerId,
        cliente_name: customerId ? undefined : customerName,
      },
    }
  }

  if ((intent === 'add_quote_items' || intent === 'edit_quote_items' || intent === 'mixed') && firstItem?.description) {
    return {
      action: 'add_costo',
      data: {
        description: firstItem.description,
        quantity: firstItem.quantity ?? 1,
        unit: firstItem.unit ?? null,
        unit_price: firstItem.unitPrice ?? null,
        vat_rate: firstItem.vatRate ?? null,
      },
    }
  }

  return {
    action: 'none',
    data: {},
  }
}

function parseJsonField(formData: FormData, key: string) {
  const raw = formData.get(key)
  if (typeof raw !== 'string' || !raw.trim()) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function getStringField(formData: FormData, key: string) {
  const raw = formData.get(key)
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function getNumberField(formData: FormData, key: string) {
  const value = getStringField(formData, key)
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
