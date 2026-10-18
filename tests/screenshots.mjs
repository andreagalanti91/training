// Genera le schermate del README con un account dimostrativo (Supabase simulato).
// Uso: node tests/mock-server.mjs 8787 & node tests/screenshots.mjs http://localhost:8787
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch (e) { pw = require("/opt/node22/lib/node_modules/playwright"); }
const { chromium, devices } = pw;
const BASE = process.argv[2] || "http://localhost:8787", OUT = "docs/screenshots";
const email = "andrea@esempio.it", password = "password-demo";

// Account e dati dimostrativi: settimane 15-19 quasi tutte completate, con durata e RPE.
const h = { apikey: "anon-test", "Content-Type": "application/json" };
const su = await (await fetch(`${BASE}/auth/v1/signup`, { method: "POST", headers: h, body: JSON.stringify({ email, password, data: { name: "Andrea Galanti" } }) })).json();
const program = await (await fetch(`${BASE}/data/program.json`)).json();
const day = (iso, plus) => { const d = new Date(iso); d.setDate(d.getDate() + plus); return d.toISOString().slice(0, 10); };
const done = {}, skip = { 15: ["swim"], 16: ["row"], 17: [], 18: ["row", "bike"], 19: ["forza", "swim", "row"] };
const rpe = [6, 8, 7, 7, 5, 6], dur = [60, 75, 90, 70, 60, 45];
program.weeks.forEach(w => w.sessions.forEach((s, i) => {
  if ((skip[w.number] || []).includes(s.id)) return;
  done[`${w.number}:${s.id}`] = { on: true, at: day(w.publishedAt, [1, 2, 3, 4, 5, 6][i] - (w.number === 19 ? 7 : 0)), dur: dur[i] + (w.number % 3) * 5, rpe: Math.min(10, rpe[i] + (w.number === 18 ? 1 : 0)), t: Date.now() };
}));
const state = { v: 1, done, inputs: { p10k: { v: "4:35", t: 1 }, ftp: { v: "265", t: 1 } }, prefs: {}, profile: { name: { v: "Andrea Galanti", t: 1 } } };
await fetch(`${BASE}/rest/v1/user_state?on_conflict=user_id`, { method: "POST", headers: { ...h, Authorization: `Bearer ${su.access_token}` }, body: JSON.stringify({ user_id: su.user.id, state }) });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
const shot = async name => { await page.mouse.move(1, 1); await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 82 }); console.log("✓", name); };

await page.goto(BASE);
await page.waitForSelector("#auth h1");
await page.click('[data-mode="login"]');
await page.fill("#aEmail", email);
await shot("01-accesso");
await page.fill("#aPw", password);
await page.click("#aForm [type=submit]");
await page.waitForSelector(".kpis");
await shot("02-home");
const scrollTo = sel => page.evaluate(s => { const el = document.querySelector(s), app = document.getElementById("app"); app.scrollTop += el.getBoundingClientRect().top - 110; }, sel);
await scrollTo('[aria-label="Analisi"]');
await shot("03-analisi");
await scrollTo('[aria-label="Carico di allenamento"]');
await shot("04-carico");
await page.click('.tab[data-id="s3"]');
await page.waitForSelector(".calc");
await scrollTo(".calc");
await shot("05-allenamento");
await page.click('.tab[data-id="s4"]');
await page.waitForSelector("[data-done]");
await page.click("[data-done]");
await page.waitForSelector("#sheetLog.open");
await page.click('#durChips [data-m="60"]');
await page.click('#rpeGrid [data-r="8"]');
await shot("06-registra");
await page.click("#logBody [data-save]");
await page.waitForTimeout(3000);
await page.click("#profileBtn");
await page.waitForSelector("#sheetProfile.open");
await shot("07-profilo");
await browser.close();
