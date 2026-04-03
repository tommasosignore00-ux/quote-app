import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// Punto 16: Embedding cache helper - check DB cache before calling OpenAI
async function getEmbeddingWithCache(
  supabase: ReturnType<typeof createClient>,
  text: string
): Promise<number[]> {
  const normalised = text.trim().toLowerCase()
  // Simple hash using Web Crypto
  const encoded = new TextEncoder().encode(normalised)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const textHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

  // 1. Check server-side cache
  const { data: cached } = await supabase
    .from('embedding_cache')
    .select('embedding')
    .eq('text_hash', textHash)
    .maybeSingle()

  if (cached?.embedding) {
    // Update last_used_at
    await supabase.from('embedding_cache').update({ last_used_at: new Date().toISOString() }).eq('text_hash', textHash)
    return cached.embedding
  }

  // 2. Call OpenAI Embeddings API
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

  // 3. Cache in DB
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
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Extract user ID from auth header
    const authHeader = req.headers.get('authorization') || ''
    let userId: string | null = null
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user } } = await supabase.auth.getUser(token)
      userId = user?.id || null
    }

    const formData = await req.formData()
    const audio = formData.get('audio') as File
    if (!audio) return new Response(JSON.stringify({ error: 'No audio' }), { status: 400 })

    // Transcribe with Whisper
    const transcriptionFormData = new FormData()
    transcriptionFormData.append('file', audio)
    transcriptionFormData.append('model', 'whisper-1')

    const transcriptionRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: transcriptionFormData,
    })

    const transcription = await transcriptionRes.json()
    const text = transcription.text
    if (!text) return new Response(JSON.stringify({ action: 'none', text: '' }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })

    // Punto 14: Check user command mappings before GPT interpretation
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
        }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }
    }

    const clientiStr = formData.get('clienti') as string | null
    const clienti: { id: string; name: string }[] = clientiStr ? JSON.parse(clientiStr) : []
    const clientiList = clienti.map(c => `- ${c.name} (id: ${c.id})`).join('\n')

    // Interpret command with GPT-4
    const completionRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `Sei un assistente per un'app di preventivi. Interpreta il comando vocale e restituisci JSON con:
- action: "create_cliente" | "create_lavoro" | "add_costo"
- data: oggetto con i campi necessari

Clienti disponibili:
${clientiList || '(nessuno)'}

Per create_lavoro: usa cliente_id se il nome corrisponde a un cliente nella lista, altrimenti cliente_name con il nome completo.
Esempi:
- "Crea cliente Mario Rossi" → {"action":"create_cliente","data":{"name":"Mario Rossi"}}
- "Nuovo lavoro Ristrutturazione bagno per Mario Rossi" → {"action":"create_lavoro","data":{"title":"Ristrutturazione bagno","cliente_id":"UUID_MARIO_ROSSI"}} oppure {"action":"create_lavoro","data":{"title":"Ristrutturazione bagno","cliente_name":"Mario Rossi"}}
- "Aggiungi rubinetto moderno" → {"action":"add_costo","data":{"description":"rubinetto moderno"}}
- "Inserisci 2 piastrelle bianche" → {"action":"add_costo","data":{"description":"piastrelle bianche","quantity":2}}
Rispondi SOLO con JSON valido.`,
          },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
      }),
    })

    const completion = await completionRes.json()
    const content = completion.choices?.[0]?.message?.content || '{}'
    const parsed = JSON.parse(content)

    // Punto 16: Cache embedding for the transcribed text (for future vector similarity search)
    if (parsed.action === 'add_costo' && text) {
      getEmbeddingWithCache(supabase, text).catch(() => {/* non-blocking */})
    }

    return new Response(JSON.stringify({ ...parsed, text }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
