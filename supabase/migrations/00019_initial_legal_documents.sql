-- Inserisci documenti legali iniziali per l'Italia
INSERT INTO public.legal_documents (type, country_code, version, content, effective_date)
VALUES
(
  'privacy_policy',
  'IT',
  '1.0',
  $quote$# Informativa sulla Privacy

## 1. Introduzione
Questa informativa sulla privacy descrive come raccogliamo, utilizziamo e condividiamo i tuoi dati personali quando usi la nostra applicazione.

## 2. Dati che raccogliamo
- Informazioni di profilo (nome, email, azienda)
- Dati di clienti e preventivi che crei
- Dati di utilizzo dell'applicazione

## 3. Come utilizziamo i tuoi dati
- Per fornirti i servizi dell'applicazione
- Per migliorare i nostri servizi
- Per comunicare con te in merito ai tuoi preventivi

## 4. Condivisione dei dati
Non condividiamo i tuoi dati personali con terze parti, tranne che per i nostri fornitori di servizi necessari per operare (es. Stripe per i pagamenti, Supabase per l'hosting).

## 5. I tuoi diritti
Hai il diritto di:
- Accedere ai tuoi dati
- Modificare i tuoi dati
- Eliminare i tuoi dati
- Richiedere la portabilità dei tuoi dati

## 6. Contatti
Per qualsiasi domanda, contattaci all'indirizzo email: quote.app.support@gmail.com

Ultimo aggiornamento: Luglio 2026$quote$,
  NOW()
),
(
  'terms_of_service',
  'IT',
  '1.0',
  $quote$# Termini di Servizio

## 1. Accettazione dei termini
Usando questa applicazione, accetti questi termini di servizio.

## 2. Utilizzo del servizio
Ti impegni a utilizzare il servizio in modo lecito e conforme alle leggi applicabili.

## 3. Account e sicurezza
Sei responsabile di mantenere le credenziali del tuo account sicure.

## 4. Pagamenti e abbonamenti
Se scegli un abbonamento a pagamento, acconsenti al pagamento delle tariffe applicabili.

## 5. Limitazione di responsabilità
L'applicazione è fornita "così com'è". Non garantiamo che sarà sempre disponibile o priva di errori.

## 6. Modifiche ai termini
Possiamo modificare questi termini in qualsiasi momento. Se continuerai a usare il servizio dopo le modifiche, accetterai i nuovi termini.

Ultimo aggiornamento: Luglio 2026$quote$,
  NOW()
)
ON CONFLICT DO NOTHING;
