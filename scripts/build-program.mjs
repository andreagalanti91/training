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

import { checkWeek } from "../assets/program-check.js";
const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const files = readdirSync(WEEKS_DIR).filter(f => /^\d+\.json$/.test(f));
const weeks = [];
for (const f of files) {
  let w;
  try { w = JSON.parse(readFileSync(join(WEEKS_DIR, f), "utf8")); }
  catch (e) { err(f, "JSON non valido: " + e.message); continue; }
  errors.push(...checkWeek(w, f));
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
