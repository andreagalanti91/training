/* Validazione di una settimana della programmazione: usata da scripts/build-program.mjs,
   dalla dashboard del coach (coach.html) e nei test. Nessuna dipendenza. */
export const ICONS = ["run", "kb", "bike", "bar", "swim", "row", "ski", "gym"];
const LINE_KEYS = ["pre", "q", "t", "z", "r", "s", "chips", "m"];
const BLOCK_KEYS = ["title", "badge", "note", "ladder", "table", "lines", "levels", "loads", "callout", "calcs", "score"];
// Tipi di score accettati (vedi assets/scores.js: PROFILES e sinonimi).
const SCORE_TYPES = ["run", "bike", "emom", "amrap", "fortime", "strength", "swim", "erg", "load", "distance",
  "time", "pace", "watts", "reps", "rounds", "notes", "note", "row", "ski"];
let errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const isStr = v => typeof v === "string" && v.trim() !== "";
export const slug = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "s";

function checkLine(l, where) {
  if (!l || typeof l !== "object") return err(where, "riga non valida");
  if (!isStr(l.t)) err(where, "manca il testo 't'");
  for (const k of Object.keys(l)) if (!LINE_KEYS.includes(k)) err(where, `chiave sconosciuta '${k}'`);
  if (l.m !== undefined && typeof l.m !== "number") err(where, "'m' deve essere un numero (metri)");
  if (l.chips !== undefined && !Array.isArray(l.chips)) err(where, "'chips' deve essere un array");
}

function checkBlock(b, where) {
  if (!isStr(b.title)) err(where, "manca 'title'");
  for (const k of Object.keys(b)) if (!BLOCK_KEYS.includes(k)) err(where, `chiave sconosciuta '${k}'`);
  (b.lines || []).forEach((l, i) => checkLine(l, `${where} riga ${i + 1}`));
  if (b.levels) {
    if (typeof b.levels !== "object" || Array.isArray(b.levels)) err(where, "'levels' deve essere un oggetto { livello: [righe] }");
    else for (const [k, L] of Object.entries(b.levels)) {
      if (!Array.isArray(L) || !L.length) err(where, `livello '${k}' vuoto`);
      else L.forEach((l, i) => checkLine(l, `${where} livello ${k} riga ${i + 1}`));
    }
  }
  if (b.ladder && (!Array.isArray(b.ladder) || !b.ladder.every(n => typeof n === "number" || isStr(n)))) err(where, "'ladder' deve essere un array di numeri");
  if (b.table && (!Array.isArray(b.table.cols) || !Array.isArray(b.table.rows) || b.table.rows.some(r => !Array.isArray(r) || r.length !== b.table.cols.length)))
    err(where, "'table' deve avere cols e rows della stessa lunghezza");
  if (b.score !== undefined && b.score !== false) {
    const sc = b.score;
    if (!sc || typeof sc !== "object" || Array.isArray(sc)) err(where, "'score' deve essere un oggetto { type, divisions } oppure false");
    else {
      if (!SCORE_TYPES.includes(sc.type)) err(where, `score.type '${sc.type}' non valido (${SCORE_TYPES.join(", ")})`);
      if (sc.divisions !== undefined && (!Array.isArray(sc.divisions) || !sc.divisions.every(isStr))) err(where, "score.divisions deve essere un array di nomi (es. [\"Rx\", \"Scaled\"])");
      for (const k of Object.keys(sc)) if (!["type", "divisions", "label"].includes(k)) err(where, `chiave sconosciuta in score: '${k}'`);
    }
  }
  (b.loads || []).forEach((l, i) => { if (!isStr(l.n) || !isStr(l.rx)) err(`${where} carico ${i + 1}`, "servono 'n' e 'rx'"); });
  (b.calcs || []).forEach((c, i) => {
    const w = `${where} calcolatore ${i + 1}`;
    if (!isStr(c.key) || !isStr(c.label)) err(w, "servono 'key' e 'label'");
    if (!["pace", "pct"].includes(c.kind ?? "pct")) err(w, "'kind' deve essere 'pace' o 'pct'");
    if (c.kind !== "pace" && !isStr(c.unit)) err(w, "manca 'unit' (es. kg, W)");
    if (!Array.isArray(c.outs) || !c.outs.length) err(w, "manca 'outs'");
    else c.outs.forEach((o, j) => {
      if (!isStr(o.label)) err(`${w} out ${j + 1}`, "manca 'label'");
      if (c.kind === "pace" ? typeof o.off !== "number" : typeof o.pct !== "number") err(`${w} out ${j + 1}`, c.kind === "pace" ? "serve 'off' (secondi)" : "serve 'pct' (numero)");
    });
  });
}

function checkWeekInto(w, file) {
  const where = file;
  if (!Number.isInteger(w.number) || w.number < 1) err(where, "'number' deve essere un intero ≥ 1");
  if (!isStr(w.program)) err(where, "manca 'program'");
  if (w.publishedAt && !/^\d{4}-\d{2}-\d{2}$/.test(w.publishedAt)) err(where, "'publishedAt' deve essere AAAA-MM-GG");
  if (w.notes && !Array.isArray(w.notes)) err(where, "'notes' deve essere un array");
  if (!Array.isArray(w.sessions) || !w.sessions.length) return err(where, "nessuna sessione");
  const ids = new Set();
  w.sessions.forEach((s, i) => {
    const sw = `${where} sessione ${i + 1}`;
    if (!isStr(s.title)) err(sw, "manca 'title'");
    if (!isStr(s.tab)) err(sw, "manca 'tab' (etichetta corta per la navbar)");
    if (!ICONS.includes(s.icon)) err(sw, `icona '${s.icon}' non valida (${ICONS.join(", ")})`);
    let id = s.id || slug(s.tab || s.title);
    if (ids.has(id)) { let n = 2; while (ids.has(`${id}-${n}`)) n++; id = `${id}-${n}`; }
    ids.add(id); s.id = id;
    if (!Array.isArray(s.blocks) || !s.blocks.length) err(sw, "nessun blocco");
    else s.blocks.forEach((b, bi) => checkBlock(b, `${sw} blocco ${bi + 1}`));
  });
}


// Restituisce l'elenco degli errori (vuoto se la settimana è valida). Assegna gli id mancanti.
export function checkWeek(w, where = "settimana") {
  errors = [];
  if (!w || typeof w !== "object" || Array.isArray(w)) return [`${where}: non è un oggetto settimana`];
  checkWeekInto(w, where);
  return errors;
}

// Chiavi dei calcolatori usate in una settimana (per avvisare quando ne nasce una nuova).
export const calcKeys = w => (w.sessions || []).flatMap(s => (s.blocks || []).flatMap(b => (b.calcs || []).map(c => c.key)));
