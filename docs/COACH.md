# Dashboard coach

Pagina: **https://training.andreagalanti.it/coach.html** (da computer; funziona anche su tablet).
Il coach incolla la programmazione come la scrive agli atleti, l'IA la imposta, lui controlla l'anteprima e pubblica.
Tutto gratuito: Supabase (piano Free) + Google Gemini (piano gratuito).

## Attivazione (una volta sola)

### 1. Chiave gratuita di Google Gemini
1. Vai su https://aistudio.google.com/apikey con un account Google (va bene quello del coach o il tuo).
2. **Create API key** → scegli/crea un progetto → copia la chiave. Non serve carta di credito.

### 2. Salvare la chiave su Supabase
1. Supabase → progetto **Training App** → **Edge Functions** → **Secrets** (o *Project Settings → Edge Functions*).
2. **Add new secret**: nome `GEMINI_API_KEY`, valore = la chiave copiata → **Save**.
3. (Facoltativo) secret `GEMINI_MODEL` per cambiare modello; senza, usa `gemini-flash-latest`.

La chiave resta sul server: non finisce mai nell'app né nel repository.

### 3. Abilitare il coach
1. Il coach crea il suo account nell'app (https://training.andreagalanti.it) come un atleta.
2. Supabase → **SQL Editor** → incolla ed esegui (con la sua email):
   ```sql
   insert into public.coaches (user_id)
   select id from auth.users where email = 'email-del-coach@esempio.it'
   on conflict do nothing;
   ```
3. Nell'app, nella sidebar (desktop) o nel Profilo, compare **Dashboard coach**.

Per togliere l'accesso: `delete from public.coaches where user_id = (select id from auth.users where email = '...');`

## Uso settimanale (coach)

1. **+ Nuova settimana** (il numero è già quello successivo; controlla la data).
2. Incolla il testo → **Imposta con IA** (fino a un minuto). Subito dopo parte da sola la **verifica**
   che confronta testo e risultato voce per voce.
3. Guarda a destra l'**anteprima**: è l'app vera, come la vedranno gli atleti sul telefono.
4. Leggi **Controlli**:
   - rosso = errore da correggere (la pubblicazione è bloccata se il formato non è valido);
   - giallo = da controllare (discrepanze, sessioni nuove, nuovi calcolatori);
   - arancione = dubbi dell'IA su punti ambigui del testo.
5. Correggi **a parole** (es. "il back squat è al 75%, non al 77.5%") → **Correggi**.
   Per modifiche di precisione c'è la scheda **JSON**.
6. **Pubblica ora**, oppure **Programma…** (es. domenica alle 20:00), oppure **Salva bozza**.

Correzioni dopo la pubblicazione: apri la settimana, modifica, **Pubblica modifiche**.
Ogni salvataggio conserva la versione precedente (**Storico delle versioni**).
**Ritira** nasconde una settimana agli atleti senza perdere i loro progressi.

### Se l'IA non risponde
Limite gratuito raggiunto o servizio giù: apri *"IA non disponibile? Usa ChatGPT o Claude a mano"*,
**Copia istruzioni**, incollale in una chat gratuita, incolla la risposta e **Usa questa risposta**.
Controlli e anteprima funzionano allo stesso modo.

## Come funziona (tecnico)

- `public.program_weeks` (`supabase/program.sql`): una riga per settimana, bozza/pubblicata/programmata.
  L'app unisce `data/program.json` e le settimane pubblicate del database: **a parità di numero vince il database**.
- `public.coaches` + funzione `is_coach()`: solo i coach scrivono (RLS). Gli atleti leggono solo le pubblicate.
- `public.program_history`: versione precedente salvata a ogni modifica (trigger).
- Funzione `supabase/functions/program-ai` (Edge Function, `verify_jwt` disattivato: controlla lei che l'utente sia coach)
  inoltra a Gemini le istruzioni generate da `docs/PROGRAM_FORMAT.md` + `docs/AI_RULES.md`
  (`node scripts/build-ai-prompt.mjs` → `assets/ai-prompt.js`).
- Controlli in `assets/program-check.js`: gli stessi della validazione su GitHub.
- Anteprima: `index.html?preview` legge la bozza da `localStorage["hpg-preview"]`.

Aggiornare la funzione dopo una modifica: Supabase CLI `supabase functions deploy program-ai --no-verify-jwt`
(oppure chiedilo a Claude, che la pubblica tramite le API di gestione).

## Limiti del piano gratuito
- Gemini: limiti al minuto e al giorno (si vedono in AI Studio); una settimana usa 2–3 richieste.
  Sul piano gratuito Google può usare i testi inviati per migliorare i suoi modelli.
- Supabase Free: il progetto va in pausa dopo 7 giorni senza attività sul database
  (con atleti attivi non succede); arriva un'email di avviso prima.
