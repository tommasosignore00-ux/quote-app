# Quote App Mobile

App React Native con Expo per la gestione preventivi.

## Setup

1. Installa dipendenze:
   ```bash
   cd mobile
   npm install
   ```

2. Configura `.env`:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://coqfepebhigdeevppdbr.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<tua-chiave>
   ```

   Nota: `EXPO_PUBLIC_API_URL` non e piu necessario per il flusso standard. Le funzioni voice/email/checkout usano Supabase Edge Functions.

## Workflow Test & Pubblicazione

### ✅ Test rapido con Expo Go (consigliato per iniziare)

1. Avvia Expo in tunnel:
   ```bash
   npm run start:go
   ```
2. Apri Expo Go sul telefono e scansiona il QR.

Note:
- Se sei sulla stessa Wi-Fi, puoi usare anche `npm run start:go:lan`.
- Il web locale su porta 3000 serve solo se vuoi testare separatamente il frontend web.

### ✅ Test avanzato con Development Build (quando servono moduli nativi custom)

1. Installa EAS CLI (se non l'hai):
   ```bash
   npm install -g eas-cli
   ```

2. Login EAS:
   ```bash
   eas login
   ```

3. Build per development:
   ```bash
   # iOS (serve account Apple Developer)
   eas build --profile development --platform ios

   # Android
   eas build --profile development --platform android
   ```

4. Installa il file .apk (Android) o .ipa (iOS) sul telefono
5. Avvia il dev server:
   ```bash
   npm start
   ```
6. Scansiona il QR code dall'app installata

### 🚀 Pubblicazione su Store

#### Preview/Test interno
```bash
eas build --profile preview --platform all
```

#### Produzione
```bash
# Build
eas build --profile production --platform all

# Submit
eas submit --platform ios
eas submit --platform android
```

## Dipendenze principali

- `expo-dev-client`: custom dev client
- `expo-av`: audio/voice recording
- `expo-file-system` + `expo-sharing`: gestione file/preventivi
- `@supabase/supabase-js`: backend
- `react-navigation`: navigazione
- `i18next`: internazionalizzazione (21 lingue)

## Struttura

- `screens/`: auth, dashboard, profilo, preventivi, listini
- `components/`: VoiceButton
- `lib/`: i18n, supabase client, QuoteTemplate
- `locales/`: traduzioni (21 lingue)

## Note

- Voice button registra audio e lo invia al backend per riconoscimento vocale
- Preventivi: genera HTML locale e invia via email tramite backend
- Sync realtime con Supabase per clienti/lavori/costi
