// Test end-to-end con Playwright: registrazione, allenamenti, sincronizzazione, layout.
// Uso: node tests/mock-server.mjs & node tests/e2e.mjs [url] [cartella-screenshot]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch (e) { pw = require("/opt/node22/lib/node_modules/playwright"); }
const { chromium, devices } = pw;

const BASE = process.argv[2] || "http://localhost:8787";
const SHOTS = process.argv[3] || "";
const email = `atleta${Date.now()}@example.com`;
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) failures++; };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(BASE);
await page.waitForSelector("#auth:not([hidden]) h1");
ok(await page.textContent("#auth h1") === "Crea account", "al primo avvio mostra la registrazione");
await shot(page, "01-signup");

// Validazione lato client
await page.fill("#aEmail", "non-una-email");
await page.fill("#aPw", "12345678");
await page.click("#aForm [type=submit]");
ok((await page.textContent("#aErr")).includes("email valido"), "rifiuta un'email non valida");

await page.fill("#aName", "Andrea Galanti");
await page.fill("#aEmail", email);
await page.fill("#aPw", "corta");
await page.click("#aForm [type=submit]");
ok((await page.textContent("#aErr")).includes("8 caratteri"), "rifiuta una password corta");
await page.fill("#aPw", "password-sicura");
await page.click("#aForm [type=submit]");
await page.waitForSelector(".hero h1");
ok((await page.textContent(".hero h1")).startsWith("Settimana"), "dopo la registrazione entra nell'app");
ok((await page.textContent("#profileBtn .ini")) === "AG", "profilo in alto a destra con le iniziali");
await page.waitForTimeout(400);
await shot(page, "02-home-empty");

// Layout: navbar ancorata al fondo, shell a tutta altezza
const geo = await page.evaluate(() => {
  const b = document.body.getBoundingClientRect(), t = document.querySelector(".tabbar").getBoundingClientRect();
  return { bodyH: b.height, inner: innerHeight, gap: b.height - t.bottom, pbRight: innerWidth - document.querySelector("#profileBtn").getBoundingClientRect().right };
});
ok(Math.abs(geo.bodyH - geo.inner) < 1, `la shell occupa tutta l'altezza (${geo.bodyH}/${geo.inner})`);
ok(geo.gap >= 8 && geo.gap <= 40, `navbar in basso (distanza dal fondo ${Math.round(geo.gap)}px)`);
ok(geo.pbRight < 24, "pulsante profilo allineato a destra");

// Segna come fatta la prima sessione e registra durata + RPE
ok(await page.$(".srow") === null && (await page.textContent(".next-card h2")).length > 0, "in home solo il prossimo allenamento");
await page.click(".next-card [data-go]");
await page.waitForSelector("[data-done]");
await page.fill(".calc input", "4:30");
await page.click("[data-done]");
await page.waitForSelector("#sheetLog.open");
await shot(page, "03-log-sheet");
await page.click('#durChips [data-m="60"]');
await page.click('#rpeGrid [data-r="7"]');
await page.click("#logBody [data-save]");
await page.waitForSelector("#sheetLog:not(.open)");
ok((await page.textContent(".log-sum")).includes("60 min"), "riepilogo durata dopo il salvataggio");
await shot(page, "04-session-done");

// Seconda sessione senza dati di carico
await page.click('.tab[data-id="s2"]');
await page.waitForSelector("[data-done]");
await page.click("[data-done]");
await page.waitForSelector("#sheetLog.open");
await page.click("#logBody [data-skip]");

// Score e classifica sulla card "Bologna TD test" (score a tempo, categorie Élite/Regular/Beginner)
ok(await page.locator(".score-bar").count() === 2, "pulsanti Score e Classifica in ogni card allenamento");
await page.click('[data-score="0"]');
await page.waitForSelector("#sheetScore.open");
ok(await page.locator("#scDiv button").count() === 3, "categorie del test nel modulo score");
await page.fill("#scA", "12"); await page.fill("#scB", "75");
await page.click("#scForm [type=submit]");
ok((await page.textContent("#scErr")).includes("secondi"), "rifiuta secondi non validi");
await page.fill("#scB", "34");
await page.click("#scForm [type=submit]");
await page.waitForSelector("#sheetScore:not(.open)");
ok((await page.textContent('[data-score="0"] b')) === "12:34", "il mio score compare sulla card");
// un altro atleta inserisce uno score migliore nella stessa categoria
const other = await (await fetch(`${BASE}/auth/v1/signup`, { method: "POST", headers: { apikey: "x", "Content-Type": "application/json" }, body: JSON.stringify({ email: "rivale" + email, password: "password-sicura" }) })).json();
await fetch(`${BASE}/rest/v1/scores?on_conflict=user_id,week,session_id,block`, { method: "POST", headers: { apikey: "x", "Content-Type": "application/json", Authorization: `Bearer ${other.access_token}` },
  body: JSON.stringify({ user_id: other.user.id, week: 22, session_id: "metcon", block: 0, kind: "time", value: 710, display: "11:50", division: "Élite", note: "", name: "Marco Rossi" }) });
await page.click('[data-board="0"]');
await page.waitForSelector("#sheetBoard.open .board li");
const board = await page.$$eval("#sheetBoard .board li", els => els.map(e => e.innerText.replace(/\s+/g, " ")));
ok(board.length === 2 && board[0].includes("Marco Rossi") && board[1].includes("12:34") && board[1].includes("tu"), "classifica condivisa ordinata (vince il tempo più basso)");
await shot(page, "05b-classifica");
await page.click("#sheetBoard [data-close]");
await page.waitForSelector("#sheetBoard:not(.open)");

await page.click('.tab[data-id="home"]');
await page.waitForSelector(".kpis");
ok((await page.textContent(".nc-prog em")) === "2/5", "contatore della settimana aggiornato");
ok((await page.textContent(".next-card h2")).includes("Bike"), "il prossimo allenamento avanza dopo quelli fatti");
ok(await page.$(".chart svg path") !== null, "grafico attività con colonne");
ok(await page.$(".hm.l1, .hm.l2") !== null, "calendario con il giorno di allenamento");
ok(await page.$(".load-bar") !== null, "grafico del carico");
ok(await page.$(".hbars") !== null, "ripartizione per disciplina");
ok(await page.$(".week .ring") === null, "rimosso il vecchio riepilogo della settimana");
await page.click(".chart-card >> nth=0 >> .hit >> nth=-1");
ok(await page.isVisible(".chart-card >> nth=0 >> .tip"), "tooltip al tocco sul grafico");
ok((await page.textContent(".chart-card >> nth=0 >> .tip")).includes("Settimana 22: 2/5"), "il tooltip descrive la settimana");
await shot(page, "05-home-stats");
await page.evaluate(() => document.getElementById("app").scrollTo(0, 99999));
await page.waitForTimeout(500);
await shot(page, "06-home-bottom");

// I dati sono sul server
await page.waitForTimeout(1500);
const remote = await (await fetch(`${BASE}/__mock/state?email=${encodeURIComponent(email)}`)).json();
const doneKeys = Object.entries(remote?.state?.done || {}).filter(([, e]) => e.on).map(([k]) => k);
ok(doneKeys.length === 2, `stato salvato sul server (${doneKeys.join(", ")})`);
ok(remote?.state?.inputs?.p10k?.v === "4:30", "valore del calcolatore salvato sul server");
ok(remote?.state?.profile?.name?.v === "Andrea Galanti", "nome salvato nel profilo");

// Profilo
await page.click("#profileBtn");
await page.waitForSelector("#sheetProfile.open");
ok((await page.textContent("#syncLine")).includes("salvati"), "stato di sincronizzazione nel profilo");
await page.click("#nameBox summary");
const sticking = await page.evaluate(() => { const m = document.querySelector("#sheetProfile .menu").getBoundingClientRect();
  return [...document.querySelectorAll("#sheetProfile .menu input, #sheetProfile .menu .btn")].filter(e => e.getBoundingClientRect().right > m.right - 8).length; });
ok(sticking === 0, "nel profilo campi e pulsanti restano dentro il riquadro");
await page.click("#installBox summary");
ok(await page.evaluate(() => !document.getElementById("nameBox").open), "una sola sezione del profilo aperta alla volta");
ok(await page.isVisible('#installBox .steps[data-os="ios"]') && (await page.textContent('#installBox .steps[data-os="ios"]')).includes("Aggiungi alla schermata Home"), "istruzioni per salvare l'app su iPhone");
await page.click('#installBox .os-seg [data-os="android"]');
ok(await page.isVisible('#installBox .steps[data-os="android"]') && await page.isHidden('#installBox .steps[data-os="ios"]'), "istruzioni Android al cambio di sistema");
await shot(page, "07b-installa");
await shot(page, "07-profile");
await page.click("#logoutBtn");
await page.waitForSelector("#auth:not([hidden]) h1");
ok(await page.textContent("#auth h1") === "Accedi", "logout porta all'accesso");

// Nuovo dispositivo: i dati tornano dopo il login
const ctx2 = await browser.newContext({ ...devices["iPhone 13"] });
const p2 = await ctx2.newPage();
p2.on("pageerror", e => errors.push(e.message));
await p2.goto(BASE);
await p2.waitForSelector("#auth:not([hidden])");
await p2.click('[data-mode="login"]');
await p2.fill("#aEmail", email);
await p2.fill("#aPw", "sbagliata");
await p2.click("#aForm [type=submit]");
await p2.waitForSelector("#aErr:not([hidden])");
ok((await p2.textContent("#aErr")).includes("non corretti"), "errore con password sbagliata");
await shot(p2, "08-login-error");
await p2.fill("#aPw", "password-sicura");
await p2.click("#aForm [type=submit]");
await p2.waitForSelector(".next-card");
ok(await p2.locator(".tab.done").count() === 2, "su un altro dispositivo ritrova le sessioni fatte");

// Aggiornamento della programmazione: i progressi restano (id stabili)
await p2.route("**/data/program.json*", async route => {
  const r = await route.fetch(); const j = await r.json();
  j.weeks[0].sessions.reverse();
  route.fulfill({ response: r, json: j });
});
await p2.reload();
await p2.waitForSelector(".next-card");
const doneTabs = await p2.$$eval(".tab.done span", els => els.map(e => e.textContent));
ok(doneTabs.length === 2 && doneTabs.includes("Run") && doneTabs.includes("Metcon"), "sessioni riordinate: i progressi seguono la sessione giusta");
await p2.unroute("**/data/program.json*");

// Sessione revocata: torna all'accesso senza perdere dati
await fetch(`${BASE}/__mock/revoke`);
await p2.evaluate(() => { const a = JSON.parse(localStorage.getItem("hpg-auth")); a.refresh_token = "x"; a.expires_at = 0; localStorage.setItem("hpg-auth", JSON.stringify(a)); });
await p2.reload();
await p2.waitForSelector("#auth:not([hidden]) h1", { timeout: 5000 }).catch(() => {});
ok(await p2.isVisible("#auth"), "sessione scaduta: chiede di accedere di nuovo");

// Conferma email + link di reset password
const ctx3 = await browser.newContext({ ...devices["iPhone 13"] });
const p3 = await ctx3.newPage();
p3.on("pageerror", e => errors.push(e.message));
const link = await (await fetch(`${BASE}/__mock/link?email=${encodeURIComponent(email)}&type=recovery`)).json();
await p3.goto(BASE + link.url);
await p3.waitForSelector("#auth h1");
ok(await p3.textContent("#auth h1") === "Nuova password", "il link di recupero apre il form nuova password");
await p3.fill("#aPw", "nuova-password");
await p3.click("#aForm [type=submit]");
await p3.waitForSelector(".next-card");
ok(!(await p3.evaluate(() => location.hash.includes("access_token"))), "token rimossi dall'indirizzo");
const p5 = await (await browser.newContext({ ...devices["iPhone 13"] })).newPage();
await p5.goto(BASE + "/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid");
await p5.waitForSelector("#auth .notice");
ok((await p5.textContent("#auth .notice")).includes("scaduto"), "link scaduto: messaggio chiaro");

// PWA installata con viewport più corto dello schermo (bug iOS): la shell usa l'altezza dello schermo
const ctx4 = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 810 }, screen: { width: 390, height: 844 } });
const p4 = await ctx4.newPage();
await p4.addInitScript(() => { Object.defineProperty(navigator, "standalone", { get: () => true }); });
await p4.goto(BASE);
await p4.waitForSelector("#auth:not([hidden])");
const g4 = await p4.evaluate(() => ({ body: document.body.getBoundingClientRect().height, inner: innerHeight, pwa: document.documentElement.classList.contains("pwa") }));
ok(g4.pwa && Math.abs(g4.body - g4.inner) < 1, `in modalità app la shell segue la finestra senza uscirne (${g4.body}/${g4.inner})`);

// Progressi della vecchia versione (localStorage) importati nel nuovo account
const p6 = await (await browser.newContext({ ...devices["iPhone 13"] })).newPage();
await p6.goto(BASE);
await p6.waitForSelector("#auth:not([hidden])");
await p6.evaluate(() => { localStorage.setItem("hpg-w22-done", "[0,2]"); localStorage.setItem("hpg-ftp", '"250"'); });
await p6.fill("#aEmail", "legacy" + email); await p6.fill("#aPw", "password-sicura"); await p6.click("#aForm [type=submit]");
await p6.waitForSelector(".next-card");
ok(await p6.locator(".tab.done").count() === 2, "spunte della vecchia versione importate nell'account");
await p6.click('.tab[data-id="s3"]');
ok(await p6.inputValue(".calc input >> nth=0") === "250", "valori dei calcolatori importati");

ok(errors.length === 0, "nessun errore JavaScript" + (errors.length ? ": " + errors.join(" | ") : ""));
await browser.close();
console.log(failures ? `\n${failures} controlli falliti` : "\nTutti i controlli superati");
process.exit(failures ? 1 : 0);
