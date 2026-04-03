# 🛠️ Cosa Devi Fare — Guida Passo Passo

> Tutto il codice è già scritto. Qui sotto ci sono **solo le cose che devi configurare tu** su servizi esterni, dashboard e file di configurazione.
>
> Segui i passi nell'ordine esatto. Ogni passo ha le istruzioni precise da seguire.

---

## INDICE

| # | Cosa fai | Tempo stimato |
|---|----------|---------------|
| [1](#1--migrazione-database) | Applichi la migrazione DB | 2 min |
| [2](#2--deploy-edge-functions) | Deploy delle Edge Functions | 5 min |
| [3](#3--crea-prodotto-e-prezzi-su-stripe) | Crei prodotto e prezzi su Stripe | 10 min |
| [4](#4--aggiorna-i-price-id-nel-codice) | Aggiorni 3 stringhe nel codice con i Price ID reali | 2 min |
| [5](#5--aggiungi-il-piano-team-a-stripe-checkout) | Aggiungi il piano team alla Edge Function | 5 min |
| [6](#6--imposta-i-secrets-supabase) | Imposti tutti i secrets/env | 5 min |
| [7](#7--crea-il-file-env-per-lapp-mobile) | Crei il file .env per l'app | 1 min |
| [8](#8--configura-deep-linking) | Configuri il deep linking | 3 min |
| [9](#9--configura-supabase-per-produzione) | Configuri Supabase per produzione | 3 min |
| [10](#10--configura-resend-per-le-email) | Configuri Resend per le email | 10 min |
| [11](#11--pubblica-la-privacy-policy) | Pubblichi la privacy policy GDPR | 15 min |
| [12](#12--aggiorna-gli-url-nel-codice) | Sostituisci 2 URL placeholder nel codice | 2 min |
| [13](#13--schedula-pulizia-cache-embedding) | Scheduli un cron job per pulizia cache | 3 min |
| [14](#14--opzionale-metered-billing) | (Opzionale) Colleghi gli overage a Stripe | post-lancio |
| [15](#15--opzionale-coupon-founding-member) | (Opzionale) Crei il coupon founding member | 5 min |
| [16](#16--checklist-finale) | Verifichi tutto con la checklist | 5 min |

> I punti 5 (Smartwatch) e 6 (Widget Home) richiedono sviluppo nativo e sono descritti in fondo come riferimento futuro.
---

## 16 — Checklist Finale

Spunta ogni voce dopo averla completata:

### Obbligatori per il lancio

- [ ] Migrazione 00015 applicata (passo 1)
- [ ] 5 colonne verificate con la query di controllo
- [ ] `voice-process` deployata (passo 2)
- [ ] `webhook-dispatch` deployata (passo 2)
- [ ] Prodotto Stripe creato con 3 prezzi (passo 3)
- [ ] Price ID reali inseriti in `SubscriptionScreen.tsx` (passo 4)
- [ ] Piano `team` aggiunto a `stripe-checkout/index.ts` (passo 5a)
- [ ] Tipo `'team'` aggiunto a `supabaseFunctions.ts` (passo 5b)
- [ ] `stripe-checkout` ri-deployata (passo 5c)
- [ ] `OPENAI_API_KEY` impostata (passo 6)
- [ ] `STRIPE_SECRET_KEY` impostata (passo 6)
- [ ] `STRIPE_PRICE_MONTHLY` impostata (passo 6)
- [ ] `STRIPE_PRICE_YEARLY` impostata (passo 6)
- [ ] `STRIPE_PRICE_TEAM` impostata (passo 6)
- [ ] `APP_URL` impostata (passo 6)
- [ ] `RESEND_API_KEY` impostata (passo 6)
- [ ] `EMAIL_FROM` impostata (passo 6)
- [ ] File `mobile/.env` creato (passo 7)
- [ ] `"scheme": "quoteapp"` aggiunto a `mobile/app.json` (passo 8a)
- [ ] Intent filter Android aggiunto (passo 8b)
- [ ] Site URL + Redirect URLs configurati su Supabase (passo 9)
- [ ] Dominio verificato su Resend (passo 10)
- [ ] Privacy policy pubblicata online (passo 11)
- [ ] URL privacy aggiornato in `RegisterScreen.tsx` (passo 12a)
- [ ] URL referral aggiornato in `ProfileScreen.tsx` (passo 12b)
- [ ] Cron job cache embedding attivo (passo 13)

### Opzionali / Post-lancio

- [ ] Metered billing Stripe per overage (passo 14)
- [ ] Coupon Founding Member su Stripe (passo 15)
- [ ] Smartwatch WearOS/watchOS (sviluppo nativo)
- [ ] Widget Home Screen iOS/Android (sviluppo nativo)

---

## Riferimento — Punti Nativi (Fase Futura)

### Punto 5 — Smartwatch

> L'obiettivo è avere un pulsante "Registra" sullo smartwatch che avvia la registrazione vocale sull'app mobile del telefono.

#### Prerequisiti

- Deep linking funzionante (passo 8 completato)
- Configurazione linking in `App.tsx` (vedi sotto "Prerequisito comune" dopo il punto 6)

---

#### 5A — watchOS (Apple Watch)

**1. Crea il target Watch in Xcode:**
- Apri `mobile/ios/QuoteApp.xcworkspace` in Xcode
- **File** → **New** → **Target** → **watchOS** → **App** (SwiftUI)
- Product Name: `QuoteAppWatch`
- Bundle ID: `com.quoteapp.mobile.watchkitapp`
- Language: **Swift**, Interface: **SwiftUI**
- Xcode creerà la cartella `mobile/ios/QuoteAppWatch/`

**2. Crea l'interfaccia Watch (`ContentView.swift`):**

```swift
import SwiftUI
import WatchConnectivity

struct ContentView: View {
    @StateObject private var connector = PhoneConnector()
    
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: connector.isRecording ? "mic.fill" : "mic")
                .font(.system(size: 48))
                .foregroundColor(connector.isRecording ? .red : .blue)
            
            Button(action: {
                connector.toggleRecording()
            }) {
                Text(connector.isRecording ? "Stop" : "Registra")
                    .font(.headline)
            }
            .buttonStyle(.borderedProminent)
            .tint(connector.isRecording ? .red : .blue)
            
            if !connector.isReachable {
                Text("iPhone non raggiungibile")
                    .font(.caption)
                    .foregroundColor(.orange)
            }
        }
    }
}
```

**3. Crea il connector (`PhoneConnector.swift`):**

```swift
import WatchConnectivity
import Combine

class PhoneConnector: NSObject, ObservableObject, WCSessionDelegate {
    @Published var isRecording = false
    @Published var isReachable = false
    
    override init() {
        super.init()
        if WCSession.isSupported() {
            let session = WCSession.default
            session.delegate = self
            session.activate()
        }
    }
    
    func toggleRecording() {
        let command = isRecording ? "stop_recording" : "start_recording"
        WCSession.default.sendMessage(
            ["action": command],
            replyHandler: { reply in
                DispatchQueue.main.async {
                    self.isRecording = reply["recording"] as? Bool ?? false
                }
            },
            errorHandler: { error in
                print("Watch send error: \(error)")
            }
        )
    }
    
    // MARK: - WCSessionDelegate
    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async {
            self.isReachable = session.isReachable
        }
    }
    
    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async {
            self.isReachable = session.isReachable
        }
    }
    
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        if let recording = message["recording"] as? Bool {
            DispatchQueue.main.async {
                self.isRecording = recording
            }
        }
    }
}
```

**4. Installa il bridge lato React Native:**

```bash
cd mobile
npm install react-native-watch-connectivity
cd ios && pod install
```

**5. Aggiungi il listener in `App.tsx`** (dentro il componente principale):

```typescript
import { watchEvents } from 'react-native-watch-connectivity';

useEffect(() => {
  const unsubscribe = watchEvents.on('message', (message) => {
    if (message.action === 'start_recording') {
      // Naviga alla Dashboard e avvia registrazione
      navigationRef.navigate('Dashboard', { startVoice: true });
      // Rispondi al watch
      watchEvents.sendMessage({ recording: true });
    }
    if (message.action === 'stop_recording') {
      // Invia evento per fermare la registrazione
      DeviceEventEmitter.emit('stopVoiceRecording');
      watchEvents.sendMessage({ recording: false });
    }
  });
  return () => unsubscribe();
}, []);
```

---

#### 5B — WearOS (Android)

**1. Crea il modulo Wear in Android Studio:**
- Apri `mobile/android/` in Android Studio
- **File** → **New** → **Module** → **Wear OS** → **Blank Activity (Compose)**
- Module name: `wear`
- Package name: `com.quoteapp.wear`
- Minimum SDK: API 30

**2. Aggiungi la dipendenza in `mobile/android/settings.gradle`:**

```gradle
include ':wear'
```

**3. Aggiungi Wearable API in `mobile/android/wear/build.gradle`:**

```gradle
dependencies {
    implementation 'com.google.android.gms:play-services-wearable:18.1.0'
    implementation 'androidx.wear.compose:compose-material:1.3.0'
    implementation 'androidx.wear.compose:compose-foundation:1.3.0'
}
```

**4. Crea l'interfaccia (`mobile/android/wear/src/main/.../MainActivity.kt`):**

```kotlin
@Composable
fun RecordButton() {
    var isRecording by remember { mutableStateOf(false) }
    val context = LocalContext.current
    
    Button(
        onClick = {
            isRecording = !isRecording
            val action = if (isRecording) "start_recording" else "stop_recording"
            sendMessageToPhone(context, action)
        },
        colors = ButtonDefaults.buttonColors(
            backgroundColor = if (isRecording) Color.Red else MaterialTheme.colors.primary
        ),
        modifier = Modifier.size(ButtonDefaults.LargeButtonSize)
    ) {
        Icon(
            painter = painterResource(
                if (isRecording) R.drawable.ic_mic_off else R.drawable.ic_mic
            ),
            contentDescription = "Registra"
        )
    }
}

private fun sendMessageToPhone(context: Context, action: String) {
    val nodeClient = Wearable.getNodeClient(context)
    nodeClient.connectedNodes.addOnSuccessListener { nodes ->
        for (node in nodes) {
            Wearable.getMessageClient(context).sendMessage(
                node.id,
                "/voice_command",
                action.toByteArray()
            )
        }
    }
}
```

**5. Aggiungi il listener lato telefono (`mobile/android/app/src/.../WearListenerService.kt`):**

```kotlin
package com.quoteapp.mobile

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import android.content.Intent

class WearListenerService : WearableListenerService() {
    override fun onMessageReceived(event: MessageEvent) {
        if (event.path == "/voice_command") {
            val action = String(event.data)
            // Lancia l'app con deep link
            val intent = Intent(
                Intent.ACTION_VIEW,
                android.net.Uri.parse("quoteapp://dashboard?startVoice=${action == "start_recording"}")
            ).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            startActivity(intent)
        }
    }
}
```

**6. Registra il service in `mobile/android/app/src/main/AndroidManifest.xml`:**

```xml
<service
    android:name=".WearListenerService"
    android:exported="true">
    <intent-filter>
        <action android:name="com.google.android.gms.wearable.MESSAGE_RECEIVED" />
        <data
            android:scheme="wear"
            android:host="*"
            android:pathPrefix="/voice_command" />
    </intent-filter>
</service>
```

---

### Punto 6 — Widget Home Screen

> L'obiettivo è un widget 1×1 sulla home del telefono che con un tap apre l'app e avvia direttamente la registrazione vocale.

#### Prerequisiti

- Deep linking funzionante (passo 8 completato)
- Configurazione linking in `App.tsx` (vedi sotto "Prerequisito comune")

---

#### 6A — iOS (WidgetKit)

**1. Crea il target Widget in Xcode:**
- Apri `mobile/ios/QuoteApp.xcworkspace`
- **File** → **New** → **Target** → **Widget Extension**
- Product Name: `QuoteWidget`
- ❌ Deseleziona "Include Configuration Intent"
- Xcode creerà la cartella `mobile/ios/QuoteWidget/`

**2. Sostituisci il contenuto di `QuoteWidget.swift`:**

```swift
import WidgetKit
import SwiftUI

struct QuoteWidgetEntry: TimelineEntry {
    let date: Date
}

struct QuoteWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> QuoteWidgetEntry {
        QuoteWidgetEntry(date: Date())
    }
    func getSnapshot(in context: Context, completion: @escaping (QuoteWidgetEntry) -> Void) {
        completion(QuoteWidgetEntry(date: Date()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<QuoteWidgetEntry>) -> Void) {
        let entry = QuoteWidgetEntry(date: Date())
        // Aggiorna ogni ora (non serve dato che è statico)
        let timeline = Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(3600)))
        completion(timeline)
    }
}

struct QuoteWidgetEntryView: View {
    var entry: QuoteWidgetEntry
    
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.blue, Color.blue.opacity(0.7)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            
            VStack(spacing: 8) {
                Image(systemName: "mic.fill")
                    .font(.system(size: 32))
                    .foregroundColor(.white)
                Text("Registra")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
            }
        }
        .widgetURL(URL(string: "quoteapp://dashboard?startVoice=true"))
    }
}

@main
struct QuoteWidget: Widget {
    let kind = "QuoteWidget"
    
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: QuoteWidgetProvider()) { entry in
            QuoteWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("QuoteApp")
        .description("Registra un preventivo vocale")
        .supportedFamilies([.systemSmall])
    }
}
```

**3. Aggiungi l'App Group (opzionale, serve se vuoi condividere dati):**
- Target `QuoteApp` → Signing & Capabilities → + App Groups → `group.com.quoteapp.mobile`
- Stesso per target `QuoteWidget`

---

#### 6B — Android (AppWidgetProvider)

**1. Crea il layout del widget (`mobile/android/app/src/main/res/layout/widget_voice.xml`):**

```xml
<?xml version="1.0" encoding="utf-8"?>
<RelativeLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/widget_background"
    android:padding="8dp">

    <ImageView
        android:id="@+id/widget_mic_icon"
        android:layout_width="48dp"
        android:layout_height="48dp"
        android:layout_centerInParent="true"
        android:src="@android:drawable/ic_btn_speak_now"
        android:contentDescription="Registra" />

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_below="@id/widget_mic_icon"
        android:layout_centerHorizontal="true"
        android:text="Registra"
        android:textColor="#FFFFFF"
        android:textSize="12sp"
        android:layout_marginTop="4dp" />
</RelativeLayout>
```

**2. Crea il background drawable (`mobile/android/app/src/main/res/drawable/widget_background.xml`):**

```xml
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <corners android:radius="16dp" />
    <gradient
        android:startColor="#2563EB"
        android:endColor="#1D4ED8"
        android:angle="135" />
</shape>
```

**3. Crea il provider (`mobile/android/app/src/main/.../VoiceWidgetProvider.kt`):**

```kotlin
package com.quoteapp.mobile

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

class VoiceWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (widgetId in appWidgetIds) {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("quoteapp://dashboard?startVoice=true")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            val pendingIntent = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            
            val views = RemoteViews(context.packageName, R.layout.widget_voice)
            views.setOnClickPendingIntent(R.id.widget_mic_icon, pendingIntent)
            
            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }
}
```

**4. Crea il file info (`mobile/android/app/src/main/res/xml/widget_voice_info.xml`):**

```xml
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="40dp"
    android:minHeight="40dp"
    android:updatePeriodMillis="0"
    android:initialLayout="@layout/widget_voice"
    android:resizeMode="none"
    android:widgetCategory="home_screen"
    android:previewImage="@android:drawable/ic_btn_speak_now"
    android:description="@string/app_name" />
```

**5. Registra il widget in `AndroidManifest.xml`:**

```xml
<receiver
    android:name=".VoiceWidgetProvider"
    android:exported="true">
    <intent-filter>
        <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
    </intent-filter>
    <meta-data
        android:name="android.appwidget.provider"
        android:resource="@xml/widget_voice_info" />
</receiver>
```

---

### Prerequisito comune — Aggiungere Deep Linking a React Navigation

> Sia lo smartwatch che il widget inviano `quoteapp://dashboard?startVoice=true`. Per farlo funzionare, React Navigation deve mappare gli URL ai screen.

**1. Modifica `mobile/App.tsx` — aggiungi la config `linking`:**

```typescript
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

const linking = {
  prefixes: ['quoteapp://'],
  config: {
    screens: {
      Dashboard: {
        path: 'dashboard',
        parse: {
          startVoice: (value: string) => value === 'true',
        },
      },
    },
  },
};

// Nel JSX:
<NavigationContainer ref={navigationRef} linking={linking}>
  {/* stack navigator esistente */}
</NavigationContainer>
```

**2. Gestisci `startVoice` in `DashboardScreen.tsx`:**

```typescript
const route = useRoute();
const startVoice = (route.params as any)?.startVoice;

useEffect(() => {
  if (startVoice) {
    // Avvia la registrazione automaticamente dopo un breve delay
    setTimeout(() => {
      voiceButtonRef.current?.startRecording();
    }, 500);
  }
}, [startVoice]);
```

> Questo rende funzionante il deep link `quoteapp://dashboard?startVoice=true` sia dal widget che dallo smartwatch.

---

## Stato Codice — Riepilogo

| Punto | Feature | Codice | Da fare manualmente |
|-------|---------|--------|---------------------|
| 4 | Carousel Fallback | ✅ Fatto | — |
| 5 | Smartwatch | ❌ | Sviluppo nativo |
| 6 | Widget Home | ❌ | Sviluppo nativo |
| 14 | Command Mapping | ✅ Fatto | — |
| 16 | Embedding Cache | ✅ Fatto | Solo cron job (passo 13) |
| 22 | Reverse Charge UE | ✅ Fatto | — |
| 23 | Lingua Cliente PDF | ✅ Fatto | — |
| 24 | Multi-Valuta | ✅ Fatto | — |
| 25 | US Sales Tax | ✅ Fatto | — |
| 27 | GDPR | ✅ Fatto | Privacy policy (passo 11) |
| 31 | Tiering UI | ✅ Fatto | Price ID Stripe (passi 3-4) |
| 33 | Metered Billing | ✅ Fatto (contatore) | Stripe metered (passo 14, opzionale) |
| 35 | Affiliazione | ✅ Fatto | URL referral (passo 12b) |
| 39 | Founding Member | ✅ Fatto | Coupon Stripe (passo 15, opzionale) |
| 41 | Team Roles | ✅ Fatto | Piano Team Stripe (passi 3-5) |
| 43 | Webhooks | ✅ Fatto | Deploy Edge Function (passo 2) |
