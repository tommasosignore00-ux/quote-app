# Debug Session: browser-pdf-upload
- **Status**: [OPEN]
- **Issue**: Dal browser, cliccando su Carica PDF nella schermata listini compare ancora l'errore "String didn't match the expected string" invece di avviare il nuovo flusso di upload PDF.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-browser-pdf-upload.ndjson

## Reproduction Steps
1. Aprire la dashboard listini dal browser.
2. Verificare se sono visibili i pulsanti separati `Carica CSV/Excel` e `Carica PDF`.
3. Cliccare `Carica PDF`.
4. Selezionare un file PDF.
5. Verificare se l'errore compare prima della request o dopo la risposta API.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Il browser sta caricando ancora un deploy vecchio che non contiene il nuovo pulsante `Carica PDF` e il nuovo handler | High | Low | Rejected: l'utente vede i due pulsanti nuovi |
| B | L'errore avviene nel client prima della request, durante click sul file input o durante la lettura del file | High | Low | Likely: il messaggio resta client-side e non abbiamo evidenza di request fallita lato server |
| C | Il backend riceve la request JSON del PDF ma fallisce nella fase iniziale di parsing/validazione | Medium | Low | Inconclusive |
| D | Il problema dipende da uno specifico browser o da un comportamento del file input nascosto | Medium | Low | Likely: il fix passa da label + input accessibile invece di `click()` su input nascosto |
| E | L'utente sta colpendo un ambiente diverso da quello aggiornato su GitHub | Medium | Low | Rejected: la UI aggiornata e visibile |

## Log Evidence
- Il deploy nuovo e caricato: l'utente vede i due pulsanti separati `Carica CSV/Excel` e `Carica PDF`.
- La sessione browser `browser-pdf-upload` non ha ancora scritto eventi in `.dbg/` dal sito pubblico: questo e compatibile con blocco mixed-content da pagina `https` verso `http://127.0.0.1:7777/event`.
- Prossimo passo: riproduzione su `http://localhost:3000` per ottenere i log client reali.
- Fix applicata in attesa di verifica: upload PDF via label/input accessibile, lettura PDF con fallback `FileReader -> arrayBuffer`, retry automatico multipart se il percorso JSON/base64 fallisce.


- In corso: manca la prova post-fix dell'utente.
