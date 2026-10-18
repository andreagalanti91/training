# Setup account e pubblicazione

L'app è statica (HTML/CSS/JS + `data/program.json`) e gira sull'hosting attuale.
Login e dati degli utenti stanno su **Supabase** (piano gratuito sufficiente): la
programmazione e il codice possono essere aggiornati quante volte vuoi senza toccare
i progressi degli atleti.

## 1. Crea il progetto Supabase (una volta, ~10 minuti)

1. Vai su <https://supabase.com>, crea un account e un nuovo progetto (regione: Europe).
2. **SQL Editor → New query**: incolla il contenuto di `supabase/schema.sql` e premi **Run**.
3. **Authentication → Sign In / Providers**:
   - lascia attivo solo **Email** (disattiva gli altri provider);
   - **Confirm email**: attivo (consigliato). Se lo disattivi, l'utente entra subito dopo la registrazione.
   - lunghezza minima password: 8.
4. **Authentication → URL Configuration**:
   - **Site URL**: `https://training.andreagalanti.it`
   - **Redirect URLs**: aggiungi `https://training.andreagalanti.it/**`
5. **Authentication → Emails** (facoltativo ma consigliato): traduci in italiano i modelli
   "Confirm signup" e "Reset password". Per inviare più di qualche email l'ora configura un
   SMTP tuo in **Authentication → Emails → SMTP Settings** (il servizio integrato di Supabase ha
   limiti molto bassi ed è pensato solo per i test).
6. **Project Settings → API**: copia **Project URL** e la chiave **anon / publishable**.

## 2. Collega l'app

Apri `assets/config.js` e incolla i due valori:

```js
window.HPG_CONFIG = {
  supabaseUrl: "https://xxxxxxxx.supabase.co",
  supabaseAnonKey: "eyJhbGciOi..."   // chiave anon/publishable, NON la service_role
};
```

La chiave anon è pubblica per design: ogni utente può leggere e scrivere solo la propria riga
grazie alle regole RLS dello script SQL. Non mettere mai la chiave `service_role` nel sito.

## 3. Pubblica

Carica sull'hosting questi file (stessa struttura di cartelle):

```
index.html  sw.js  manifest.webmanifest  .htaccess
apple-touch-icon.png  icon-192.png  icon-512.png
assets/   data/program.json
```

Le cartelle `scripts/`, `tests/`, `docs/`, `supabase/`, `data/weeks/`, `.claude/` servono solo
in sviluppo e non vanno pubblicate.

### Pubblicazione automatica

Il workflow `.github/workflows/deploy.yml` valida la programmazione e pubblica via FTP a ogni push
sul branch di lavoro (o su `main`). Servono i secret del repository GitHub
(Settings → Secrets and variables → Actions → New repository secret):
`FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`. La cartella del sito viene trovata da sola cercando
`data/program.json`; per forzarla imposta anche `FTP_DIR` (es. `training.andreagalanti.it/`).
Il repository è pubblico: le credenziali vanno **solo** nei secret, mai nei file.

## Dati degli utenti: cosa succede quando aggiorniamo

- **Nuova settimana o modifica della programmazione**: cambia solo `data/program.json`.
  I progressi sono agganciati a `numero settimana + id sessione`, quindi restano al loro posto
  anche se le sessioni vengono riordinate o rinominate (l'`id` non va mai cambiato).
- **Nuova versione dell'app**: il service worker scarica sempre la versione più recente;
  i dati sono sul server e in cache locale per utente, quindi non si perdono.
- **Offline**: le modifiche restano sul dispositivo e vengono inviate appena torna la rete.
  Tra più dispositivi vince la modifica più recente, voce per voce.
- **Primo accesso dopo l'aggiornamento**: le spunte e i valori salvati dalla vecchia versione
  su quel dispositivo vengono importati automaticamente nell'account.
- Ogni utente può scaricare i propri dati da **Profilo → Esporta i miei dati**.

## Sviluppo locale

```bash
npm test          # valida la programmazione + test end-to-end (Playwright) su un Supabase simulato
npm run dev       # app + Supabase simulato su http://localhost:8787
```
