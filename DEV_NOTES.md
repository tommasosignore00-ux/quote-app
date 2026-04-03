Notes per sviluppo locale
Notes per sviluppo locale

Problemi noti e soluzioni permanenti suggerite:

1) Errore TLS durante chiamate a Supabase (UNABLE_TO_GET_ISSUER_CERT_LOCALLY)
- Ho rimosso la disabilitazione globale di TLS e ora il codice carica opzionalmente
  un bundle di certificati PEM se `SUPABASE_CA_BUNDLE` è impostato. Questa è una
  soluzione più sicura rispetto a disabilitare la verifica TLS.

Come risolvere in modo permanente (scegli una):
- Metodo A (consigliato): ottenere un file PEM contenente i certificati CA attendibili
  e impostare `SUPABASE_CA_BUNDLE` o `NODE_EXTRA_CA_CERTS` nell'ambiente del server.
  Esempio (macOS):
  ```bash
  # salva il bundle come /Users/you/certs/ca-bundle.pem
  export SUPABASE_CA_BUNDLE=/Users/you/certs/ca-bundle.pem
  # oppure
  export NODE_EXTRA_CA_CERTS=/Users/you/certs/ca-bundle.pem
  cd web
  npm run dev
  ```

- Metodo B: installare/aggiornare i certificati di sistema macOS (Keychain/System Roots)
  in modo che Node/OpenSSL li riconosca. Su macOS moderno questo è il metodo più pulito.

Note: non immettere mai disabilitazioni TLS nel codice di produzione.

2) ENOWORKSPACES con `npm`
- Il progetto è un monorepo: evita di eseguire comandi `npm install` dalla root se la
  configurazione richiede un package manager che supporti workspaces (pnpm/yarn).

Esempi comandi per sviluppo (macOS / bash/zsh):

Per avviare solo la web app (locale):
```bash
cd web
npm install
npm run dev
```

Se vuoi installare dall'intera monorepo con supporto workspace (consigliato usare pnpm):
```bash
# installa pnpm se non lo hai
npm install -g pnpm
pnpm install
pnpm -w run dev # o i comandi workspace appropriati
```

Guida rapida a generare un bundle PEM (esempio):
```bash
# scarica root/intermediate certs da CA attendibili e concatenali in ca-bundle.pem
curl -o root.pem https://example.com/root.pem
curl -o intermediate.pem https://example.com/intermediate.pem
cat root.pem intermediate.pem > /Users/you/certs/ca-bundle.pem
```

Se vuoi, posso aiutarti a:
- generare un bundle PEM dalle CA necessarie (se mi fornisci gli URL dei certificati),
- o aggiungere il caricamento del bundle in tutti gli endpoint server-side del progetto.

Rimuovi ogni workaround insicuro prima del deploy in produzione.
