DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'legal_documents'
      AND policyname = 'legal_docs_read_anon'
  ) THEN
    CREATE POLICY "legal_docs_read_anon"
      ON public.legal_documents
      FOR SELECT
      TO anon
      USING (true);
  END IF;
END
$$;

INSERT INTO public.legal_documents (type, country_code, version, content, effective_date)
VALUES
(
  'privacy_policy',
  'IT',
  '1.1',
  $privacy$
# Informativa sulla Privacy

_Ultimo aggiornamento: 5 luglio 2026_

## 1. Titolare del trattamento
Il servizio **Quote App** e' gestito dal titolare indicato nei contatti del servizio.

Contatto privacy e supporto: [quote.app.support@gmail.com](mailto:quote.app.support@gmail.com)

Questa versione del documento e' predisposta per la fase di **beta/test e pre-lancio**. Prima dell'apertura commerciale stabile del servizio verranno pubblicati, ove necessari, i dati identificativi completi del titolare e gli eventuali dati fiscali.

## 2. Dati trattati
Possiamo trattare le seguenti categorie di dati:

- dati di registrazione e profilo, come email, nome, lingua, dati aziendali e preferenze;
- dati inseriti nell'app, come clienti, preventivi, fatture, listini, note e allegati o contenuti equivalenti;
- dati tecnici e di sicurezza, come log applicativi, indirizzi IP approssimati, informazioni sul dispositivo o sul browser e dati necessari all'autenticazione;
- dati relativi a pagamenti e abbonamenti, gestiti tramite Stripe; Quote App non memorizza i dati completi della carta;
- comunicazioni inviate al supporto;
- dati di utilizzo e analytics, se gli strumenti relativi vengono effettivamente attivati.

## 3. Finalita' e basi giuridiche
I dati sono trattati per:

- creare e gestire l'account utente;
- fornire le funzioni dell'app, inclusa la generazione e gestione di preventivi e documenti;
- eseguire misure precontrattuali o contrattuali richieste dall'utente;
- gestire pagamenti, prove gratuite, rinnovi, accessi e assistenza;
- prevenire abusi, errori, accessi non autorizzati e frodi;
- adempiere a obblighi di legge;
- migliorare il servizio, anche tramite analisi aggregate o statistiche, quando consentito.

Le basi giuridiche principali sono l'esecuzione del contratto o di misure precontrattuali, l'adempimento di obblighi legali, il legittimo interesse del titolare alla sicurezza e continuita' del servizio e, ove richiesto, il consenso dell'utente.

## 4. Modalita' del trattamento
Il trattamento avviene con strumenti digitali e organizzativi adeguati alla natura del servizio. Adottiamo misure ragionevoli per limitare accessi non autorizzati, perdita dei dati e utilizzi impropri.

## 5. Fornitori e responsabili del trattamento
Per erogare il servizio possiamo utilizzare fornitori terzi, tra cui:

- **Supabase** per database, autenticazione e servizi backend;
- **Vercel** per hosting e distribuzione dell'app web;
- **Stripe** per pagamenti, abbonamenti e gestione fiscale collegata al checkout;
- **Resend** per email transazionali, se e quando attivato;
- **PostHog** o strumenti analoghi per analytics, se e quando attivati.

Tali soggetti trattano dati solo nella misura necessaria a fornire il rispettivo servizio.

## 6. Trasferimenti extra SEE
Alcuni fornitori possono trattare dati anche al di fuori dello Spazio Economico Europeo. In tali casi il trattamento avviene tramite strumenti contrattuali o garanzie ritenute adeguate dal fornitore e dalla normativa applicabile.

## 7. Conservazione dei dati
I dati sono conservati per il tempo necessario alle finalita' per cui sono raccolti, in particolare:

- dati di account e profilo: fino a cancellazione dell'account o cessazione del rapporto, salvo obblighi ulteriori;
- dati di preventivi, clienti e documenti: fino a cancellazione da parte dell'utente o chiusura del servizio, salvo obblighi di conservazione;
- dati di pagamento e fatturazione collegati agli abbonamenti: per i tempi richiesti dalla normativa applicabile o dai provider di pagamento;
- log tecnici e di sicurezza: per periodi limitati e proporzionati alla sicurezza del servizio.

## 8. Cookie e strumenti simili
Il sito e l'app possono utilizzare cookie o tecnologie equivalenti necessari al funzionamento tecnico, all'autenticazione e alla sicurezza. Eventuali strumenti analytics o di tracciamento non strettamente necessari devono essere attivati e gestiti con informativa dedicata e, ove richiesto, con consenso dell'utente.

## 9. Diritti dell'interessato
Nei limiti previsti dalla normativa applicabile, l'utente puo' richiedere:

- accesso ai propri dati;
- rettifica o aggiornamento;
- cancellazione;
- limitazione del trattamento;
- opposizione, quando applicabile;
- portabilita' dei dati;
- revoca del consenso, senza pregiudicare i trattamenti gia' effettuati;
- reclamo all'autorita' competente.

Le richieste possono essere inviate a [quote.app.support@gmail.com](mailto:quote.app.support@gmail.com).

## 10. Dati di terzi caricati dagli utenti
L'utente che inserisce nell'app dati di clienti, collaboratori o altri soggetti garantisce di avere un'idonea base giuridica per farlo e resta responsabile del corretto utilizzo del servizio nei confronti di tali dati.

## 11. Minori
Il servizio non e' progettato per essere utilizzato da minori senza il coinvolgimento di un adulto responsabile.

## 12. Modifiche alla presente informativa
L'informativa puo' essere aggiornata nel tempo. In caso di modifiche rilevanti, la nuova versione verra' resa disponibile nell'app o sul sito con data di aggiornamento.
$privacy$,
  NOW()
),
(
  'terms_of_service',
  'IT',
  '1.1',
  $terms$
# Termini di Servizio

_Ultimo aggiornamento: 5 luglio 2026_

## 1. Oggetto del servizio
**Quote App** e' una piattaforma software che consente la gestione di preventivi, clienti, documenti commerciali, funzionalita' AI e strumenti collegati, via web e, ove disponibile, via mobile.

Questi termini disciplinano l'accesso e l'uso del servizio.

## 2. Stato del progetto
Alla data di questa versione il servizio puo' essere distribuito anche in forma **beta, demo o test controllato**. Alcune funzioni possono essere modificate, sospese o rimosse nel tempo. Prima della commercializzazione stabile saranno aggiornati, ove necessari, i dati completi del fornitore, le condizioni economiche definitive e ogni ulteriore informazione obbligatoria.

## 3. Accettazione dei termini
Usando Quote App, creando un account o proseguendo nell'utilizzo del servizio, l'utente dichiara di aver letto e accettato i presenti termini.

## 4. Account e credenziali
L'utente e' responsabile di:

- fornire dati veritieri e aggiornati;
- custodire con cura le proprie credenziali;
- non condividere l'accesso con soggetti non autorizzati;
- notificare tempestivamente eventuali accessi abusivi o problemi di sicurezza.

Il titolare puo' sospendere o limitare account compromessi o usati in modo anomalo.

## 5. Utilizzo consentito
L'utente si impegna a usare il servizio in modo lecito e conforme alla normativa applicabile. E' vietato, tra l'altro:

- utilizzare il servizio per attivita' fraudolente, ingannevoli o illecite;
- caricare contenuti o dati senza titolo o base giuridica adeguata;
- tentare di aggirare misure di sicurezza, limiti tecnici o controlli del servizio;
- interferire con il funzionamento della piattaforma o con l'uso da parte di altri utenti.

## 6. Dati e contenuti dell'utente
L'utente mantiene la responsabilita' dei dati e contenuti caricati o generati tramite il servizio, inclusi clienti, preventivi, documenti, descrizioni, importi e comunicazioni. L'utente e' tenuto a verificare correttezza, liceita' e aggiornamento dei contenuti prima di inviarli a terzi o usarli a fini commerciali o fiscali.

## 7. Funzioni a pagamento, prova gratuita e rinnovi
Se e quando attivate, alcune funzioni possono richiedere un abbonamento a pagamento.

In tali casi:

- prezzi, periodicita', valuta e funzionalita' incluse sono quelle mostrate nell'app o nel checkout;
- eventuali prove gratuite sono soggette alle condizioni mostrate al momento dell'attivazione;
- i rinnovi possono essere automatici se previsti dal piano sottoscritto;
- la cancellazione dell'abbonamento avviene tramite gli strumenti messi a disposizione nell'area account o nel portale di pagamento;
- eventuali rimborsi sono gestiti secondo la legge applicabile e l'eventuale policy pubblicata al momento della vendita.

Fino alla pubblicazione delle condizioni economiche definitive, la presente versione ha valore prevalentemente informativo per test e pre-lancio.

## 8. Disponibilita' del servizio
Il servizio viene fornito con l'obiettivo di continuita' operativa, ma non si garantisce disponibilita' ininterrotta o assenza totale di errori. Manutenzioni, aggiornamenti, incidenti tecnici o dipendenze da fornitori terzi possono incidere temporaneamente sull'accesso.

## 9. Integrazioni di terze parti
Quote App puo' integrarsi con servizi terzi, tra cui Stripe, Supabase, Resend e altri fornitori tecnici. L'uso di tali integrazioni puo' dipendere anche dai termini e dalle policy dei rispettivi fornitori.

## 10. Proprieta' intellettuale
Il software, l'interfaccia, i marchi, i contenuti proprietari e la documentazione del servizio restano di titolarita' del fornitore o dei rispettivi aventi diritto. I presenti termini non trasferiscono diritti di proprieta' sull'app, salvo il limitato diritto d'uso necessario a fruire del servizio.

## 11. Sospensione o chiusura dell'account
Il titolare puo' sospendere, limitare o chiudere l'accesso al servizio in caso di:

- violazione dei presenti termini;
- uso illecito o rischioso del servizio;
- richieste dell'autorita';
- esigenze tecniche, di sicurezza o organizzative rilevanti.

Quando ragionevolmente possibile, verra' fornito un preavviso adeguato.

## 12. Limitazione di responsabilita'
Nei limiti massimi consentiti dalla legge, il servizio e' fornito "cosi' com'e'" e "secondo disponibilita'". Il titolare non risponde per danni indiretti, perdita di profitto, perdita di opportunita', perdita di dati o interruzioni operative derivanti dall'uso o dall'impossibilita' di usare il servizio, salvo dolo o colpa grave o altri casi inderogabili di legge.

Resta comunque responsabilita' dell'utente verificare il contenuto dei documenti generati prima del loro utilizzo professionale, commerciale, fiscale o contrattuale.

## 13. Privacy
Il trattamento dei dati personali e' descritto nell'Informativa sulla Privacy, che costituisce parte integrante del quadro informativo del servizio.

## 14. Modifiche ai termini
I presenti termini possono essere aggiornati nel tempo. Le nuove versioni saranno pubblicate sul sito o nell'app con indicazione della data di aggiornamento. In caso di modifiche rilevanti potra' essere richiesta una nuova accettazione.

## 15. Legge applicabile
I presenti termini sono regolati dalla legge italiana, fatti salvi gli eventuali diritti inderogabili riconosciuti agli utenti consumatori dalla normativa applicabile.

## 16. Contatti
Per supporto o richieste relative ai presenti termini: [quote.app.support@gmail.com](mailto:quote.app.support@gmail.com)
$terms$,
  NOW()
);
