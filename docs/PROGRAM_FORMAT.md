# Formato della programmazione

Ogni settimana è un file `data/weeks/<numero>.json`. Lo script
`node scripts/build-program.mjs` li valida e genera `data/program.json` (il file letto dall'app).
Non modificare `data/program.json` a mano.

## Settimana

```json
{
  "program": "Hybrid ProGram E",
  "number": 20,
  "publishedAt": "2026-10-25",
  "notes": [
    "Paragrafo di testo delle note del coach.",
    { "callout": "<b>Evidenza</b> in arancione." },
    { "callout": "<b>Evidenza</b> neutra.", "neutral": true }
  ],
  "sessions": [ ... ]
}
```

- `number`: intero, uguale al nome del file.
- `publishedAt`: data `AAAA-MM-GG`.
- `notes`: se identiche alla settimana precedente l'app le mostra compresse ("Invariate dalla settimana N").
  Nei `callout` è ammesso solo `<b>`.

## Sessione

```json
{
  "id": "run",
  "tab": "Run",
  "icon": "run",
  "title": "Ripetute 400",
  "summary": "10–12×400 m in Z4",
  "optional": true,
  "blocks": [ ... ]
}
```

- `id`: **stabile** e unico nella settimana; i progressi degli utenti sono legati a questo valore.
  Convenzione: `run`, `metcon`, `bike`, `forza`, `swim`, `row` (slug minuscolo della `tab`).
  Se una sessione cambia titolo resta lo stesso `id`.
- `tab`: etichetta corta della navbar (max ~7 caratteri).
- `icon`: `run`, `kb` (metcon), `bike`, `bar` (forza), `swim`, `row`, `ski`, `gym`.
  Determina anche la disciplina nei grafici (run=Corsa, bike=Bici, swim=Nuoto, bar/gym=Forza, kb=Metcon, row/ski=Row & ski).
- `optional`: `true` solo per le sessioni facoltative (ometti altrimenti).

## Blocco

Campi tutti facoltativi tranne `title`:

| Campo | Contenuto |
|---|---|
| `title` | Titolo del blocco (es. "Run work") |
| `badge` | Etichetta a destra (es. "Obbligatorio", "Facoltativo", "AMRAP 12′") |
| `note` | Nota del coach in corsivo, con icona |
| `ladder` | Array di numeri per scale di ripetizioni, es. `[18,15,12,9,6,3]` |
| `table` | `{ "cols": ["", "Rx", "Scaled"], "rows": [["Thruster","40 kg","30 kg"]] }` |
| `lines` | Righe dell'allenamento (vedi sotto) |
| `levels` | `{ "Élite": [righe], "Scaled": [righe], "Beginner": [righe] }` — selettore di livello; con `m` mostra il totale metri |
| `loads` | `[{ "n": "Wall ball", "rx": "9 kg", "sc": "6 kg" }]` |
| `callout` | Evidenza in fondo al blocco (ammesso `<b>`) |
| `calcs` | Calcolatori personali (vedi sotto) |
| `score` | Tipo di score e categorie per la classifica (vedi sotto); `false` per togliere Score e Classifica dalla card |

### Riga (`lines`, `levels`)

```json
{ "pre": "A", "q": "4×", "t": "1 km", "z": "Z4", "r": "2′ rest", "s": "oppure passo 10 km", "chips": ["Z2"], "m": 400 }
```

- `t` (obbligatorio): esercizio/distanza. `q`: quantità a sinistra in arancione. `pre`: lettera della sezione.
- `z`: zona o percentuale, diventa un chip colorato (Z2, Z3, Z4, Z5, "Z2–Z3", "75%"...).
  Le righe con percentuale mostrano automaticamente il confronto con la settimana precedente
  se esiste una riga con lo stesso `t`.
- `r`: recupero/dettaglio. `s`: alternativa in grigio. `chips`: chip aggiuntivi. `m`: metri (nuoto).

### Score e classifica (`score`)

Ogni card ha i pulsanti **Score** e **Classifica**. Il tipo di score si indica così:

```json
{ "type": "time", "divisions": ["Rx", "Scaled"] }
```

| `type` | Cosa inserisce l'atleta | Vince |
|---|---|---|
| `time` | tempo (minuti e secondi) | il più basso |
| `pace` | passo medio al km | il più basso |
| `amrap` | round + ripetizioni | il più alto |
| `load` | carico in kg | il più alto |
| `reps` | ripetizioni (EMOM, max reps) | il più alto |
| `watts` | potenza media | il più alto |
| `distance` | metri | il più alto |

- `divisions` (facoltativo): categorie con classifiche separate, es. `["Rx", "Scaled"]` o
  `["Élite", "Regular", "Beginner"]`. Senza, l'app usa i livelli del blocco (`levels`), oppure
  Rx/Scaled se ci sono carichi scalati, altrimenti una classifica unica.
- `label` (facoltativo): nome dello score mostrato all'atleta, es. `"Tempo totale"`.
- Senza `score` il tipo viene dedotto: For time → `time`, AMRAP → `amrap`, EMOM → `reps`,
  Strength/Bilanciere → `load`, Bike/FTP → `watts`, Run/Corsa → `pace`, altrimenti `time`.
  Metti sempre `score` esplicito su test e benchmark.
- Gli score sono legati a `settimana + id sessione + posizione del blocco`: dopo la pubblicazione
  non riordinare i blocchi di una sessione.

### Calcolatore (`calcs`)

Passo (es. dal passo 10 km):
```json
{ "kind": "pace", "key": "p10k", "label": "Il tuo passo 10 km",
  "outs": [{ "label": "Passo 400 · −10″", "off": -10 }] }
```

Percentuale (FTP, massimali):
```json
{ "key": "ftp", "label": "La tua FTP", "unit": "W",
  "outs": [{ "label": "80% FTP", "pct": 80 }, { "label": "85% FTP", "pct": 85 }] }
```

- `key` identifica il valore inserito dall'atleta, che viene salvato nel suo account e riproposto
  ogni settimana: **riusa sempre le stesse chiavi** per la stessa grandezza
  (`p10k` passo 10 km, `phm` passo mezza, `pm` passo maratona, `ftp`, `bw` peso corporeo, massimali `rm-back-squat`, `rm-bench-press`; nuovi massimali con lo stesso schema `rm-<esercizio>`).
  Controlla le chiavi già usate con `grep -ho '"key": "[^"]*"' data/weeks/*.json | sort | uniq -c`.
- `off`: secondi da sommare al passo (negativo = più veloce). `pct`: percentuale.
