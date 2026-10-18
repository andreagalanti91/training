# Hybrid ProGram

Web app (PWA) della programmazione Hybrid ProGram: https://training.andreagalanti.it

- Accesso e registrazione con email e password (Supabase), dati di ogni atleta salvati nel suo account.
- Home con analisi: aderenza, serie di settimane complete, attività per settimana e disciplina,
  calendario degli allenamenti, carico (durata × RPE), insight automatici.
- Una scheda per ogni allenamento con calcolatori personali (passi, % FTP, % massimali).
- Programmazione settimanale in `data/weeks/`, validata da `scripts/build-program.mjs`.

Documentazione: [setup e pubblicazione](docs/SETUP.md) · [formato della programmazione](docs/PROGRAM_FORMAT.md).

```bash
npm run dev    # app + Supabase simulato su http://localhost:8787
npm test       # validazione + test end-to-end
```
