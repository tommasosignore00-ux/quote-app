-- BOZZA: fuori da supabase/migrations di proposito, cosi' `supabase db push` non la pubblica.
-- Una nuova riga in legal_documents diventa subito l'informativa visibile e chiede a tutti
-- una nuova accettazione. Dopo l'approvazione del legale: compilare i campi tra [ ], togliere
-- il titolo e l'avviso di bozza, poi copiare il file in migrations col numero successivo.
INSERT INTO public.legal_documents (type, country_code, version, content, effective_date)
VALUES (
  'privacy_policy',
  'IT',
  '1.2',
  $privacy$
# Informativa sulla Privacy — BOZZA NON APPROVATA

> **BOZZA v1.2: non pubblicare.** Testo da sottoporre al legale. I periodi di conservazione sono provvisori e i campi tra parentesi quadre vanno compilati.

## 1. Titolare del trattamento
Titolare: **[RAGIONE SOCIALE DEL TITOLARE — DA COMPILARE]**, sede **[INDIRIZZO — DA COMPILARE]**, P.IVA **[P.IVA — DA COMPILARE]**.

Contatto privacy e supporto: [quote.app.support@gmail.com](mailto:quote.app.support@gmail.com)

Responsabile della protezione dei dati: **[DPO, SE NOMINATO — DA COMPILARE]**.

Per i dati dei propri clienti inseriti nell'app, l'impresa che usa il servizio e' titolare e Quote App agisce come responsabile del trattamento **[RUOLI E ACCORDO EX ART. 28 — DA CONFERMARE CON IL LEGALE]**.

## 2. Dati trattati
- dati di registrazione e profilo, come email, dati aziendali e preferenze;
- dati inseriti nell'app, come clienti, preventivi, fatture, listini e note;
- registrazioni vocali e relative trascrizioni, quando si usa la dettatura;
- modelli di preventivo caricati, da usare senza dati reali di clienti;
- per chi risponde a un preventivo tramite link: nome, eventuale nota, data, indirizzo IP e browser;
- dati tecnici e di sicurezza, come log ed errori applicativi;
- dati di pagamento e abbonamento, gestiti tramite Stripe; Quote App non memorizza i dati completi della carta;
- comunicazioni inviate al supporto;
- statistiche di utilizzo, solo con il consenso dell'utente.

## 3. Finalita' e basi giuridiche
I dati sono trattati per fornire il servizio e gestire account, abbonamenti e assistenza (esecuzione del contratto), adempiere a obblighi di legge, garantire sicurezza e prevenire abusi (legittimo interesse) e produrre statistiche di utilizzo (consenso). **[BASI GIURIDICHE — DA CONFERMARE CON IL LEGALE]**

## 4. Dettatura vocale e intelligenza artificiale
Quando si usa la dettatura, l'audio viene inviato a **OpenAI** per la trascrizione. La trascrizione e il contesto strettamente necessario (cliente e lavoro aperti, clienti e lavori nominati nella frase, voci del listino) vengono inviati a OpenAI per interpretare il comando. Il risultato e' una proposta che l'utente conferma. L'app non conserva l'audio dopo l'elaborazione.

Le registrazioni fatte senza connessione restano sul dispositivo fino all'invio e per non piu' di 14 giorni.

Anche i modelli di preventivo caricati e i listini elaborati con l'AI vengono inviati a OpenAI. Dai modelli vengono rimossi automaticamente, prima dell'invio, codici fiscali, partite IVA, IBAN, email e telefoni diversi da quelli dell'azienda. La rimozione automatica puo' non essere completa, per questo l'utente deve caricare documenti senza dati reali.

## 5. Fornitori e responsabili del trattamento
- **Supabase**: database, autenticazione e archiviazione file;
- **Vercel**: hosting dell'app web;
- **OpenAI**: trascrizione vocale, interpretazione dei comandi, conversione dei modelli ed elaborazione dei listini;
- **Sentry**: monitoraggio degli errori;
- **Stripe**: pagamenti e abbonamenti;
- **Resend**: email transazionali;
- **PostHog**: statistiche di utilizzo, solo previo consenso.

## 6. Trasferimenti extra SEE
Alcuni fornitori possono trattare dati fuori dallo Spazio Economico Europeo. **[GARANZIE PER CIASCUN FORNITORE — DA COMPILARE CON IL LEGALE]**

## 7. Conservazione dei dati (periodi provvisori)
- account, clienti e preventivi: fino alla cancellazione da parte dell'utente;
- link pubblico del preventivo: 90 giorni dall'invio;
- IP e browser di chi risponde a un preventivo: 12 mesi dal rifiuto, 10 anni dall'accettazione;
- contenuto delle consegne webhook: 30 giorni;
- registrazioni offline sul dispositivo: 14 giorni;
- fatture: secondo gli obblighi di legge. **[PERIODO — DA FISSARE CON IL LEGALE]**

## 8. Cookie e strumenti simili
Usiamo strumenti tecnici necessari all'autenticazione e alla sicurezza. PostHog si attiva solo se l'utente accetta nel banner e la scelta si puo' cambiare dal Profilo. La pagina del preventivo aperta dal cliente non usa strumenti di analisi.

## 9. Diritti dell'interessato
L'interessato puo' chiedere accesso, rettifica, cancellazione, limitazione, opposizione e portabilita', revocare il consenso e proporre reclamo al Garante per la protezione dei dati personali. Dal Profilo si possono esportare i dati e chiedere la cancellazione dell'account. Un account con fatture non viene cancellato in automatico: in quel caso occorre contattare l'assistenza.

Le richieste possono essere inviate a [quote.app.support@gmail.com](mailto:quote.app.support@gmail.com).

## 10. Dati di terzi caricati dagli utenti
L'utente che inserisce dati di clienti, collaboratori o altri soggetti garantisce di avere un'idonea base giuridica per farlo.

## 11. Minori
Il servizio non e' progettato per essere utilizzato da minori senza il coinvolgimento di un adulto responsabile.

## 12. Modifiche alla presente informativa
In caso di modifiche rilevanti, la nuova versione verra' resa disponibile nell'app o sul sito con la data di aggiornamento.
$privacy$,
  NOW()
);
