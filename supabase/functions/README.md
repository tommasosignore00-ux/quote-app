# Supabase Edge Functions

## Setup

1. **Crea il file `.env`**:
   ```bash
   cd supabase/functions
   cp .env.example .env
   ```

2. **Aggiungi la tua chiave OpenAI** in `.env`:
   ```
   OPENAI_API_KEY=sk-...
   ```

## Deploy

### Deploy da CLI locale

```bash
# Login a Supabase
npx supabase login

# Link al progetto
npx supabase link --project-ref YOUR_PROJECT_REF

# Deploy function
npx supabase functions deploy voice-process

# Imposta secret OpenAI
npx supabase secrets set OPENAI_API_KEY=sk-...
```

### Deploy da Dashboard

1. Vai su [Supabase Dashboard](https://supabase.com/dashboard) → Functions
2. Crea nuova function `voice-process`
3. Copia il codice da `supabase/functions/voice-process/index.ts`
4. Vai in Settings → Secrets e aggiungi `OPENAI_API_KEY`

## Test

```bash
# Test locale (richiede Deno)
npx supabase functions serve voice-process --env-file supabase/functions/.env

# Test deployed
curl -i --location --request POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/voice-process' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --form 'audio=@test.m4a' \
  --form 'clienti=[]'
```

## Funzioni disponibili

- **voice-process**: Processa audio vocale → trascrizione Whisper → interpretazione GPT-4 → azione strutturata
