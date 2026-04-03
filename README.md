# Quote App - Preventivi con IA Vocale

Applicazione web e mobile per la gestione di preventivi con input vocale, ricerca semantica e sincronizzazione real-time.

## Architettura

- **Web**: Next.js 14 (App Router)
- **Mobile**: React Native (Expo)
- **Backend**: Supabase (PostgreSQL + pgvector + Auth)
- **AI**: OpenAI (Whisper + GPT-4)
- **Pagamenti**: Stripe
- **i18n**: 8 lingue (IT, EN, DE, FR, ES, PT, PL, NL) e 14 paesi

## Setup

### Prerequisiti

- Node.js 20+
- Supabase CLI (opzionale per locale)
- Account Supabase, OpenAI, Stripe

### 1. Configura Supabase

1. Crea progetto su [supabase.com](https://supabase.com)
2. Abilita estensione **pgvector** in Database > Extensions
3. Esegui le migration in `supabase/migrations/` nell'ordine
4. Copia URL e anon key da Settings > API

### 2. Variabili d'ambiente

**Web** (`web/.env.local`):
```
# Supabase (obbligatorio)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # per webhook Stripe e RPC

# OpenAI (per voice + AI)
OPENAI_API_KEY=sk-...

# Stripe (per pagamenti)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY=price_...     # ID prezzo Stripe mensile
STRIPE_PRICE_YEARLY=price_...      # ID prezzo Stripe annuale

# Email (opzionale - usa Resend.com)
# Se non configurato, registrazione funziona comunque ma no email di benvenuto
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@quoteapp.it

# App config
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SKIP_SUBSCRIPTION=true # opzionale: salta controllo abbonamento in dev
```

**Mobile** (`mobile/.env`):
```
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_API_URL=http://TUO_IP:3000    # IP della macchina dove gira il web (per voice API)
```


### 4. Avvio

```sh
# Installa tutte le dipendenze (root, web e mobile)
npm install
cd web && npm install
cd ../mobile && npm install
cd ..

# Avvia frontend web (con fix TLS automatico)
npm run web

# Avvia frontend mobile (con fix TLS automatico)
npm run mobile
```

#### ⚠️ Nota su TLS (se sviluppi localmente dietro proxy)

Se ricevi errori `fetch failed` o `unable to get issuer certificate`, è colpa del certificato TLS.

**Soluzione (già implementata):**  
Gli script npm in `web/package.json` e `mobile/package.json` includono `NODE_TLS_REJECT_UNAUTHORIZED=0`  
Questo è **solo per development** e **non va mai in produzione**.

Se prefer ischdi usare una CA bundle:
```bash
# Genera bundle (già presente in ./certs/)
export NODE_EXTRA_CA_CERTS=$(pwd)/certs/ca-bundle.pem
npm run web
```

## Funzionalità

- **Auth**: Registrazione con email + password (Supabase Auth usa bcrypt internamente)
- **Modulo legale dinamico**: Privacy, termini, sicurezza (GDPR, CCPA) in base a nazione, con timestamp e versione
- **Onboarding**: Guida interattiva (pulsante vocale, listini, primo preventivo)
- **Abbonamento Stripe**: 29€/mese, 290€/anno, 7 giorni prova, RLS per accesso
- **Profilo aziendale**: Form intelligente (P.IVA/EIN, IBAN, valute, aliquote) per paese
- **Pulsante vocale**: Registrazione → Whisper → GPT-4 per creare clienti/lavori/voci costo
- **Ricerca semantica**: pgvector su listini, fallback menu se ambiguità
- **Workflow preventivo**: Anteprima → Approvazione → Download/Email, versionamento (Rev. 01, 02...)
