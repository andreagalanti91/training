#!/usr/bin/env node
// Genera assets/ai-prompt.js (istruzioni per l'IA della dashboard coach) da
// docs/PROGRAM_FORMAT.md + docs/AI_RULES.md. Uso: node scripts/build-ai-prompt.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "assets", "ai-prompt.js");
const format = readFileSync(join(ROOT, "docs", "PROGRAM_FORMAT.md"), "utf8")
  // Le istruzioni su file e script non servono all'IA.
  .replace(/Ogni settimana è un file[\s\S]*?a mano\.\n/, "");
const rules = readFileSync(join(ROOT, "docs", "AI_RULES.md"), "utf8");
const prompt = `${format.trim()}\n\n${rules.trim()}\n`;
const out = `// File generato da scripts/build-ai-prompt.mjs: non modificarlo a mano.\nexport const SYSTEM_PROMPT = ${JSON.stringify(prompt)};\n`;
if (process.argv.includes("--check")) {
  let cur = ""; try { cur = readFileSync(OUT, "utf8"); } catch (e) {}
  if (cur !== out) { console.error("✗ assets/ai-prompt.js non aggiornato: esegui node scripts/build-ai-prompt.mjs"); process.exit(1); }
  console.log("✓ istruzioni IA aggiornate");
} else {
  writeFileSync(OUT, out);
  console.log(`✓ assets/ai-prompt.js (${prompt.length} caratteri)`);
}
