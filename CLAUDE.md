# Hybrid ProGram — note per Claude

PWA statica (italiano) pubblicata su https://training.andreagalanti.it. Nessun build step per l'app.

- `index.html` + `assets/app.css` + moduli ES in `assets/`:
  `app.js` (routing, viste, login, profilo), `api.js` (Supabase via REST: auth + tabella `user_state`),
  `store.js` (stato utente con merge per timestamp, cache locale, sync), `charts.js` (analisi e grafici SVG della Home),
  `config.js` (URL e anon key di Supabase).
- Programmazione: sorgenti in `data/weeks/<N>.json` → `node scripts/build-program.mjs` genera `data/program.json`.
  Formato in `docs/PROGRAM_FORMAT.md`. Setup account/pubblicazione in `docs/SETUP.md`.
- Dati utente: Supabase (`supabase/schema.sql`), chiave per sessione `"<settimana>:<id sessione>"`.
  Gli `id` delle sessioni non vanno mai cambiati, altrimenti i progressi si staccano.

## Aggiornamento settimanale della programmazione

Quando l'utente incolla la programmazione di una nuova settimana (o una correzione):
1. Delega **sempre** al subagent `program-updater` passandogli il testo integrale dell'utente.
   Non leggere tu `data/program.json` o i file delle settimane: serve a risparmiare token.
2. Controlla solo il riepilogo del subagent e `git diff --stat`; esegui `npm run check`.
3. Commit (`Programmazione: settimana N`) e push sul branch di lavoro. Riferisci all'utente il riepilogo in poche righe.

## Modifiche al codice

- Dopo modifiche all'app: aggiorna il parametro `?v=` in `index.html` e `CACHE`/`ASSETS` in `sw.js` (stesso numero),
  così i telefoni scaricano la nuova versione.
- Verifica con `npm test` (Playwright + Supabase simulato in `tests/mock-server.mjs`).
- Testi dell'interfaccia in italiano, tono diretto. Commenti nel codice in italiano, brevi.
