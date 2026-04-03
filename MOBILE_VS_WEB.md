# Confronto Mobile vs Web - Quote App

## Architettura Comune
- **Backend**: Supabase (auth, database, realtime)
- **Lingue**: 21 lingue i18n
- **Tabelle**: profiles, clienti, lavori, preventivi_dettaglio, listini, etc.

## Differenze Chiave

### Web (Next.js)
- **Framework**: Next.js 14 con App Router
- **Auth**: Supabase server-side + middleware
- **Voice**: browser API (Web Speech/MediaRecorder)
- **PDF/Quote**: rendering lato server o client
- **Deployment**: Vercel/server Node.js
- **Config**: `.env.local` con `NEXT_PUBLIC_*`

### Mobile (React Native Expo)
- **Framework**: Expo SDK 54 con custom dev client
- **Auth**: Supabase client-side
- **Voice**: expo-av → registra audio → POST a backend API
- **PDF/Quote**: genera HTML → expo-file-system + expo-sharing
- **Deployment**: EAS Build → App Store + Play Store
- **Config**: `.env` con `EXPO_PUBLIC_*`

## Funzionalità Mobile ≠ Web

### Voice Recognition
- **Web**: usa `SpeechRecognition` browser (client-side)
- **Mobile**: registra audio → invia a `/api/voice/process` → backend fa speech-to-text

**Problema**: se `EXPO_PUBLIC_API_URL` non raggiungibile dal telefono, il voice NON funziona.

### Quote/Preventivi
- **Web**: preview/rendering diretto (PDF server-side o HTML)
- **Mobile**: genera HTML → salva file → expo-sharing (condividi/email tramite backend)

**Problema**: email richiede backend `/api/quote/send-email` raggiungibile.

### Semantic Search Materiali
- **Entrambi** chiamano `/api/voice/semantic-match` per match listini
- **Problema mobile**: se API non raggiungibile, add costo voice fallisce

## Dipendenze Bloccanti Mobile

### Già installate
✅ expo-av, expo-localization, expo-document-picker, expo-dev-client

### Aggiunte ora
✅ expo-file-system (QuoteScreen salvataggio file)  
✅ expo-sharing (QuoteScreen condivisione)

## Cosa Serve per Far Partire Mobile

1. **Dipendenze** (fatto): `npm install` in `mobile/`
2. **API_URL corretto**:
   - `.env` → `EXPO_PUBLIC_API_URL=http://<IP-Mac>:3000`
   - Non `localhost`, non `https://...`
   - Stesso WiFi Mac-telefono
3. **Backend attivo**: server web su porta 3000 (o altra porta configurata)
4. **Avvio app**:
   - Expo Go (rapido): `npm run start:go`
   - Development Build (se servono moduli nativi custom):
   ```bash
   eas build --profile development --platform android
   # installa .apk sul telefono → scansiona QR da dev server
   ```

## Workflow Corretto

### Test Locale
1. Backend attivo su Mac (porta 3000)
2. Mobile: `cd mobile && npm start`
3. Telefono: custom dev client → scansiona QR (stessa rete WiFi)

### Pubblicazione
1. `eas build --profile production --platform all`
2. `eas submit --platform ios` / `--platform android`

## Riassunto: Mobile Funziona Come Web?

**SI, ma con condizioni**:
- Auth Supabase: ✅ identico
- CRUD clienti/lavori: ✅ identico (Supabase client)
- Listini: ✅ identico
- **Voice**: ⚠️ diverso (mobile richiede backend API)
- **Quote email**: ⚠️ richiede backend API
- **File sharing**: ⚠️ usa expo-sharing (native)

**Conclusione**: Il mobile funziona come il web per le operazioni CRUD Supabase dirette. Per voice e email preventivi serve il backend web raggiungibile dal telefono.
