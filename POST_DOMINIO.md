# 🌐 Cosa Fare Quando Hai il Dominio

> Queste cose le farai **dopo** aver comprato un dominio (es. `iltuodominio.it`).
> Per ora l'app funziona senza — torna qui quando sei pronto.

---

## 1 — Configura Resend per le Email

1. Vai su https://resend.com → **Domains** → **Add domain**
2. Inserisci il tuo dominio (es. `iltuodominio.it`)
3. Aggiungi i record DNS che Resend ti mostra (1 TXT + 3 CNAME) dal tuo provider DNS
4. Torna su Resend → clicca **Verify** → attendi che diventi verde
5. Vai su **API Keys** → **Create API key** → copia la chiave (`re_...`)
6. Aggiorna i secrets su Supabase (Dashboard → Edge Functions → Manage secrets):
   - `RESEND_API_KEY` → la nuova chiave
   - `EMAIL_FROM` → `noreply@iltuodominio.it`

---

## 2 — Aggiorna APP_URL nei Secrets

Su Supabase Dashboard → Edge Functions → Manage secrets:
- `APP_URL` → `https://iltuodominio.it`

---

## 3 — Aggiorna Supabase Authentication

Su Supabase Dashboard → **Authentication** → **URL Configuration**:
- **Site URL** → `https://iltuodominio.it`
- **Redirect URLs** → aggiungi `https://iltuodominio.it/**` (tieni anche `quoteapp://`)

---

## 4 — Aggiorna URL Referral nel Codice

**File:** `mobile/screens/ProfileScreen.tsx`  
**Riga:** cerca `https://quoteapp.it/register?ref=`  
**Sostituisci con:** `https://iltuodominio.it/register?ref=`

---

## 5 — (Opzionale) Sposta la Privacy Policy

Se vuoi spostare la privacy policy da Google Sites al tuo dominio:

1. Crea la pagina sul tuo sito (es. `https://iltuodominio.it/privacy`)
2. Aggiorna il link nel codice:
   - **File:** `mobile/screens/RegisterScreen.tsx`
   - **Riga:** cerca `https://sites.google.com/view/privacypolicy-quoteapp/home-page`
   - **Sostituisci con:** `https://iltuodominio.it/privacy`

Se tieni la privacy su Google Sites, non devi fare niente.

---

## Checklist

- [ ] Dominio verificato su Resend
- [ ] `RESEND_API_KEY` aggiornata nei secrets
- [ ] `EMAIL_FROM` aggiornata nei secrets
- [ ] `APP_URL` aggiornata nei secrets
- [ ] Site URL aggiornato su Supabase Auth
- [ ] Redirect URL del dominio aggiunto su Supabase Auth
- [ ] URL referral aggiornato in `ProfileScreen.tsx`
- [ ] (Opzionale) Privacy policy spostata e URL aggiornato in `RegisterScreen.tsx`

---

## 6 — Crediti API OpenAI

L'app usa le API OpenAI (Whisper + GPT-4 + Embeddings) per il riconoscimento vocale. Servono crediti a pagamento.

1. Vai su https://platform.openai.com/settings/organization/billing/overview
2. Clicca **Add to credit balance**
3. Aggiungi credito (es. $10-20 per iniziare — bastano per migliaia di comandi vocali)
4. Verifica che la chiave API (`OPENAI_API_KEY` nei secrets Supabase) sia attiva e associata all'organizzazione con credito

> **Costi indicativi:**
> - Whisper (trascrizione): ~$0.006/minuto
> - GPT-4 (interpretazione): ~$0.03-0.06 per comando
> - Embeddings (cache): ~$0.0001 per testo
> 
> Un comando vocale medio costa circa **$0.04**

---

## 7 — Listino Prezzi per i Lavori

L'app supporta un listino prezzi da cui prendere i costi dei lavori. Per usarlo:

1. Vai su Supabase Dashboard → **Table Editor** → tabella `listino`
2. Aggiungi le voci del tuo listino con:
   - **descrizione**: nome del lavoro/materiale (es. "Piastrella ceramica 30x30")
   - **prezzo**: costo unitario (es. `25.00`)
   - **unita**: unità di misura (es. "mq", "pz", "ml", "ora")
   - **categoria**: categoria per raggruppare (es. "Pavimenti", "Idraulica", "Elettricità")
3. Quando l'utente detta un comando vocale come "aggiungi piastrelle", il sistema cerca nel listino una corrispondenza e propone il prezzo salvato

> Più voci inserisci nel listino, più accurato sarà il riconoscimento vocale nel suggerire i prezzi giusti.
