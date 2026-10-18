#!/usr/bin/env node
// Valida le settimane in data/weeks/*.json e genera data/program.json (il file letto dall'app).
// Uso: node scripts/build-program.mjs [--check]
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEEKS_DIR = join(ROOT, "data", "weeks");
const OUT = join(ROOT, "data", "program.json");
const CHECK_ONLY = process.argv.includes("--check");

const ICONS = ["run", "kb", "bike", "bar", "swim", "row", "ski", "gym"];
const LINE_KEYS = ["pre", "q", "t", "z", "r", "s", "chips", "m"];
const BLOCK_KEYS = ["title", "badge", "note", "ladder", "table", "lines", "levels", "loads", "callout", "calcs"];
const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const isStr = v => typeof v === "string" && v.trim() !== "";
const slug = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "s";

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

function checkWeek(w, file) {
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

const files = readdirSync(WEEKS_DIR).filter(f => /^\d+\.json$/.test(f));
const weeks = [];
for (const f of files) {
  let w;
  try { w = JSON.parse(readFileSync(join(WEEKS_DIR, f), "utf8")); }
  catch (e) { err(f, "JSON non valido: " + e.message); continue; }
  checkWeek(w, f);
  if (w.number !== +f.replace(".json", "")) err(f, `il nome file deve corrispondere a 'number' (${w.number})`);
  weeks.push(w);
}
const seen = new Set();
weeks.forEach(w => { if (seen.has(w.number)) err("settimane", `settimana ${w.number} duplicata`); seen.add(w.number); });

if (errors.length) {
  console.error(`✗ ${errors.length} errori:\n- ` + errors.join("\n- "));
  process.exit(1);
}
weeks.sort((a, b) => b.number - a.number);
const updatedAt = weeks.map(w => w.publishedAt || "").sort().pop() || new Date().toISOString().slice(0, 10);
const out = JSON.stringify({ app: "Hybrid ProGram", updatedAt, weeks }, null, 1) + "\n";
if (!CHECK_ONLY) writeFileSync(OUT, out);
const w0 = weeks[0];
console.log(`✓ ${weeks.length} settimane valide (${weeks.map(w => w.number).join(", ")})${CHECK_ONLY ? "" : " → data/program.json"}`);
console.log(`  Ultima: settimana ${w0.number}, ${w0.sessions.length} sessioni: ${w0.sessions.map(s => `${s.id}${s.optional ? "*" : ""}`).join(", ")}`);
