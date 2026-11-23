/* Dashboard coach: il coach incolla la programmazione, l'IA la imposta, lui controlla l'anteprima e pubblica.
   Le settimane pubblicate qui vanno in public.program_weeks e l'app degli atleti le legge subito. */
import * as api from "./api.js";
import { checkWeek, calcKeys } from "./program-check.js";
import { SYSTEM_PROMPT } from "./ai-prompt.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const main = $("main");
const pad = n => String(n).padStart(2, "0");
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localDT = d => `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDT = iso => new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

let toastT;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 3200); }

/* ---------- Dati ---------- */
let fileWeeks = [], dbRows = [];
let cur = null;   // settimana aperta nell'editor
let tab = "preview";

const dbRow = n => dbRows.find(r => r.number === n);
const fileWeek = n => fileWeeks.find(w => w.number === n);
// Versione che vedono gli atleti oggi (o vedranno): database, altrimenti file.
const liveData = n => dbRow(n)?.data || fileWeek(n) || null;
const allNumbers = () => [...new Set([...fileWeeks.map(w => w.number), ...dbRows.map(r => r.number)])].sort((a, b) => b - a);
// Versione visibile oggi agli atleti: pubblicata nel database (e già uscita), altrimenti il file.
const athleteData = n => {
  const r = dbRow(n);
  if (r && r.status === "published" && (!r.publish_at || new Date(r.publish_at) <= new Date())) return r.data;
  return fileWeek(n) || null;
};
const prevWeek = n => { const p = allNumbers().filter(x => x < n)[0]; return p ? liveData(p) : null; };

function statusOf(n) {
  const r = dbRow(n);
  if (r) {
    if (r.status === "draft") return { cls: "draft", txt: "Bozza" };
    if (r.publish_at && new Date(r.publish_at) > new Date()) return { cls: "sched", txt: `Programmata ${fmtDT(r.publish_at)}` };
    return { cls: "pub", txt: "Pubblicata" };
  }
  return fileWeek(n) ? { cls: "file", txt: "Pubblicata (file)" } : { cls: "draft", txt: "Nuova" };
}

async function loadAll() {
  const [f, d] = await Promise.all([
    fetch("data/program.json?t=" + Date.now(), { cache: "no-store" }).then(r => r.json()).catch(() => ({ weeks: [] })),
    api.coachWeeks()
  ]);
  fileWeeks = f.weeks || []; dbRows = d || [];
}

/* ---------- Lista settimane ---------- */
function renderList() {
  $("weekList").innerHTML = allNumbers().map(n => {
    const st = statusOf(n);
    return `<button class="c-week" data-n="${n}" aria-current="${cur && cur.number === n && !cur.isNew}"><b>Settimana ${n}</b><span class="chip ${st.cls}">${esc(st.txt)}</span></button>`;
  }).join("") || `<p class="help">Nessuna settimana.</p>`;
  $("weekList").querySelectorAll("[data-n]").forEach(b => b.addEventListener("click", () => open(+b.dataset.n)));
}

/* ---------- Apertura di una settimana ---------- */
const leave = () => !cur?.dirty || confirm("Hai modifiche non salvate. Vuoi lasciarle?");
function open(n) {
  if (!leave()) return;
  const r = dbRow(n), f = fileWeek(n), data = r?.data || f;
  cur = { number: n, isNew: false, data: data ? clone(data) : null, text: r?.source_text || "", date: data?.publishedAt || localDate(),
    dubbi: [], verify: null, dirty: false };
  renderEditor();
}
function newWeek() {
  if (!leave()) return;
  const n = (allNumbers()[0] || 0) + 1;
  cur = { number: n, isNew: true, data: null, text: "", date: localDate(), dubbi: [], verify: null, dirty: false };
  renderEditor();
}

/* ---------- Controlli automatici ---------- */
function checks() {
  const out = [];
  if (!cur.data) return out;
  const w = clone(cur.data);
  const errs = checkWeek(w, "Formato");
  errs.forEach(e => out.push({ k: "err", t: e }));
  const live = athleteData(cur.number);
  const ids = w.sessions?.map(s => s.id) || [];
  if (live) {
    // Gli id legano i progressi degli atleti: se spariscono, i dati si staccano.
    const liveIds = live.sessions.map(s => s.id);
    liveIds.filter(id => !ids.includes(id)).forEach(id => out.push({ k: "err", t: `La sessione “${id}” della versione pubblicata non c'è più: i progressi degli atleti su questa sessione si staccano. Ripristinala o conferma solo se è voluto.` }));
    live.sessions.forEach(s => {
      const nw = w.sessions.find(x => x.id === s.id);
      if (nw && nw.blocks?.length !== s.blocks.length) out.push({ k: "warn", t: `Sessione “${s.id}”: i blocchi passano da ${s.blocks.length} a ${nw.blocks?.length}. Gli score sono legati alla posizione dei blocchi.` });
    });
  }
  const prev = prevWeek(cur.number);
  if (prev) {
    const pIds = prev.sessions.map(s => s.id);
    ids.filter(id => !pIds.includes(id)).forEach(id => out.push({ k: "warn", t: `Sessione nuova “${id}” (non c'era nella settimana ${prev.number}).` }));
    if (JSON.stringify(prev.notes || []) === JSON.stringify(w.notes || [])) out.push({ k: "ok", t: `Note invariate dalla settimana ${prev.number}: l'app le mostra compresse.` });
  }
  const known = new Set(allNumbers().filter(n => n !== cur.number).flatMap(n => calcKeys(liveData(n))));
  [...new Set(calcKeys(w))].filter(k => !known.has(k)).forEach(k => out.push({ k: "warn", t: `Nuova chiave calcolatore “${k}”: gli atleti dovranno reinserire il valore.` }));
  if (!errs.length) out.unshift({ k: "ok", t: `Formato valido: ${w.sessions.length} sessioni (${w.sessions.map(s => s.id + (s.optional ? "*" : "")).join(", ")}).` });
  return out;
}
const hasErrors = () => !!cur.data && checkWeek(clone(cur.data)).length > 0;

/* ---------- Editor ---------- */
function renderEditor() {
  renderList();
  main.innerHTML = `
    <header class="c-head" id="head"></header>
    <div class="c-grid">
      <div class="c-col">
        <section class="card glass c-card">
          <div class="card-head"><h2>Testo del coach</h2></div>
          <div class="c-row">
            <label class="field"><span>Settimana</span><input id="wNum" type="number" min="1" value="${cur.number}" ${cur.isNew ? "" : "disabled"}></label>
            <label class="field"><span>Data di pubblicazione</span><input id="wDate" type="date" value="${esc(cur.date)}"></label>
          </div>
          <textarea id="wText" class="c-text" placeholder="Incolla qui la programmazione della settimana, così come la scrivi agli atleti.">${esc(cur.text)}</textarea>
          <div class="c-btns">
            <button class="btn btn-primary" id="aiBtn" type="button">Imposta con IA</button>
            <span class="c-busy" id="busy" hidden><span class="spin"></span><span id="busyTxt"></span></span>
          </div>
          <details class="c-more" style="margin-top:14px"><summary>IA non disponibile? Usa ChatGPT o Claude a mano</summary>
            <p class="help">1. Copia le istruzioni (contengono già il tuo testo). 2. Incollale in una chat gratuita. 3. Incolla qui sotto la risposta.</p>
            <div class="c-btns" style="margin:0 0 10px"><button class="btn btn-ghost btn-sm" id="copyBtn" type="button">Copia istruzioni</button></div>
            <textarea id="pasteIn" class="c-json" style="min-height:140px" placeholder="Incolla qui la risposta (JSON)"></textarea>
            <div class="c-btns"><button class="btn btn-ghost btn-sm" id="pasteBtn" type="button">Usa questa risposta</button></div>
          </details>
        </section>
        <section class="card glass c-card">
          <div class="card-head"><h2>Controlli</h2><button class="btn btn-ghost btn-sm" id="verifyBtn" type="button">Verifica con IA</button></div>
          <div id="checks"></div>
          <div class="c-fix"><input id="fixIn" placeholder="Correggi a parole, es. “il back squat è al 75%, non al 77.5%”"><button class="btn btn-ghost btn-sm" id="fixBtn" type="button">Correggi</button></div>
        </section>
        ${cur.isNew || !dbRow(cur.number) ? "" : `<section class="card glass c-card"><details class="c-more" id="histBox"><summary>Storico delle versioni</summary><div class="c-hist" id="hist"></div></details></section>`}
      </div>
      <div class="c-prev">
        <div class="c-seg" role="group" aria-label="Vista"><button data-tab="preview" aria-pressed="${tab === "preview"}">Anteprima atleti</button><button data-tab="json" aria-pressed="${tab === "json"}">JSON</button></div>
        <div id="prevBox"></div>
      </div>
    </div>`;
  renderHead(); renderChecks(); renderPreview(true);

  $("wText").addEventListener("input", e => { cur.text = e.target.value; dirty(); });
  $("wDate").addEventListener("change", e => { cur.date = e.target.value; if (cur.data) { cur.data.publishedAt = cur.date; pushPreview(); } dirty(); });
  $("wNum")?.addEventListener("change", e => { cur.number = Math.max(1, +e.target.value || 1); if (cur.data) { cur.data.number = cur.number; pushPreview(); } renderHead(); renderChecks(); dirty(); });
  $("aiBtn").addEventListener("click", convert);
  $("verifyBtn").addEventListener("click", () => verify());
  $("fixBtn").addEventListener("click", fix);
  $("fixIn").addEventListener("keydown", e => { if (e.key === "Enter") fix(); });
  $("copyBtn").addEventListener("click", async () => {
    if (!cur.text.trim()) return toast("Prima incolla il testo del coach");
    try { await navigator.clipboard.writeText(SYSTEM_PROMPT + "\n\n---\n\n" + convertMessage()); toast("Istruzioni copiate"); }
    catch (e) { toast("Non riesco a copiare: usa un browser aggiornato"); }
  });
  $("pasteBtn").addEventListener("click", () => {
    try { applyAI(parseLoose($("pasteIn").value)); $("pasteIn").value = ""; toast("Settimana impostata dalla risposta incollata"); }
    catch (e) { toast("La risposta non è un JSON valido"); }
  });
  main.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => {
    tab = b.dataset.tab; main.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-pressed", x === b)); renderPreview(true);
  }));
  $("histBox")?.addEventListener("toggle", e => { if (e.target.open) loadHistory(); });
}

function renderHead() {
  const st = cur.isNew ? { cls: "draft", txt: "Nuova" } : statusOf(cur.number);
  const fromDb = !!dbRow(cur.number) && !cur.isNew;
  const r = dbRow(cur.number);
  $("head").innerHTML = `
    <div><p class="kicker">${esc(cur.data?.program || prevWeek(cur.number)?.program || "Hybrid ProGram")}</p>
      <h1>Settimana ${cur.number} <span class="chip ${st.cls}">${esc(st.txt)}</span>${cur.dirty ? ` <span class="chip">Modifiche non salvate</span>` : ""}</h1></div>
    <div class="c-actions">
      ${fromDb && r.status === "draft" ? `<button class="btn btn-ghost btn-sm danger" id="delBtn" type="button">Elimina bozza</button>` : ""}
      ${fromDb && r.status === "published" ? `<button class="btn btn-ghost btn-sm" id="pullBtn" type="button">Ritira</button>` : ""}
      <button class="btn btn-ghost btn-sm" id="draftBtn" type="button">Salva bozza</button>
      <button class="btn btn-ghost btn-sm" id="schedBtn" type="button">Programma…</button>
      <button class="btn btn-primary btn-sm" id="pubBtn" type="button">${st.cls === "pub" || st.cls === "file" ? "Pubblica modifiche" : "Pubblica ora"}</button>
    </div>
    <div class="c-row" id="schedRow" hidden style="flex-basis:100%;align-items:flex-end">
      <label class="field" style="max-width:280px;margin:0"><span>Pubblica automaticamente il</span><input id="schedAt" type="datetime-local" value="${localDT(r?.publish_at ? new Date(r.publish_at) : nextMorning())}"></label>
      <button class="btn btn-primary btn-sm" id="schedOk" type="button">Conferma programmazione</button>
    </div>`;
  $("draftBtn").addEventListener("click", () => save("draft"));
  $("pubBtn").addEventListener("click", () => save("published"));
  $("schedBtn").addEventListener("click", () => { $("schedRow").hidden = !$("schedRow").hidden; });
  $("schedOk").addEventListener("click", () => {
    const at = new Date($("schedAt").value);
    if (isNaN(at) || at <= new Date()) return toast("Scegli una data e un'ora future");
    save("published", at.toISOString());
  });
  $("pullBtn")?.addEventListener("click", () => {
    if (confirm(`Ritirare la settimana ${cur.number}? Gli atleti non la vedranno più (i loro progressi restano salvati).`)) save("draft", null, true);
  });
  $("delBtn")?.addEventListener("click", del);
}
const nextMorning = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(7, 0, 0, 0); return d; };

function renderChecks() {
  const box = $("checks"); if (!box) return;
  if (!cur.data) { box.innerHTML = `<p class="help">Incolla il testo e premi <b>Imposta con IA</b>: qui compariranno i controlli e i dubbi da chiarire.</p>`; return; }
  const li = (k, t) => `<li class="${k}">${esc(t)}</li>`;
  let h = `<ul class="c-checks">${checks().map(c => li(c.k, c.t)).join("")}</ul>`;
  if (cur.dubbi.length) h += `<p class="c-sub">Dubbi dell'IA: controlla</p><ul class="c-checks">${cur.dubbi.map(d => li("ask", d)).join("")}</ul>`;
  if (cur.verify) h += `<p class="c-sub">Verifica testo ↔ settimana</p><ul class="c-checks">${cur.verify.length ? cur.verify.map(d => li("warn", d)).join("") : li("ok", "Nessuna discrepanza trovata.")}</ul>`;
  box.innerHTML = h;
}

/* ---------- Anteprima: l'app vera in un riquadro telefono ---------- */
function pushPreview() {
  if (!cur.data) return;
  try { localStorage.setItem("hpg-preview", JSON.stringify({ ...cur.data, number: cur.number })); } catch (e) {}
  if (tab === "json") { const j = $("jsonIn"); if (j && document.activeElement !== j) j.value = JSON.stringify(cur.data, null, 2); }
}
function renderPreview(rebuild) {
  const box = $("prevBox"); if (!box) return;
  pushPreview();
  if (tab === "json") {
    box.innerHTML = `<section class="card glass c-card" style="width:420px;max-width:100%"><textarea id="jsonIn" class="c-json" spellcheck="false">${esc(cur.data ? JSON.stringify(cur.data, null, 2) : "")}</textarea>
      <div class="c-btns"><button class="btn btn-ghost btn-sm" id="jsonOk" type="button">Applica JSON</button></div></section>`;
    $("jsonOk").addEventListener("click", () => {
      try { cur.data = JSON.parse($("jsonIn").value); cur.data.number = cur.number; dirty(); pushPreview(); renderChecks(); toast("JSON applicato"); }
      catch (e) { toast("JSON non valido: " + e.message); }
    });
    return;
  }
  if (!cur.data) { box.innerHTML = `<div class="phone"><div class="c-empty" style="min-height:100%"><p>L'anteprima compare<br>dopo l'impostazione.</p></div></div>`; return; }
  if (rebuild || !box.querySelector("iframe")) box.innerHTML = `<div class="phone"><iframe title="Anteprima app atleti" src="index.html?preview#home"></iframe></div>`;
}

/* ---------- IA ---------- */
function convertMessage(extra = "") {
  const prev = prevWeek(cur.number), live = cur.isNew ? null : liveData(cur.number);
  const keys = [...new Set(allNumbers().flatMap(n => calcKeys(liveData(n))))];
  return [
    `Settimana numero: ${cur.number}`,
    `Data di pubblicazione (publishedAt): ${cur.date}`,
    `Nome del programma: ${prev?.program || "Hybrid ProGram"}`,
    `Chiavi dei calcolatori già esistenti: ${keys.join(", ") || "nessuna"}`,
    prev ? `Settimana precedente (${prev.number}), da usare come modello di stile e per riusare gli id delle sessioni:\n${JSON.stringify(prev)}` : "",
    live ? `Versione già pubblicata di questa settimana (è una correzione: mantieni id e ordine dei blocchi):\n${JSON.stringify(live)}` : "",
    extra,
    `Testo del coach:\n"""\n${cur.text.trim()}\n"""`
  ].filter(Boolean).join("\n\n");
}
const parseLoose = t => JSON.parse(String(t).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));

function setBusy(txt) {
  const b = $("busy"); if (!b) return;
  b.hidden = !txt; $("busyTxt").textContent = txt || "";
  ["aiBtn", "verifyBtn", "fixBtn"].forEach(id => { const el = $(id); if (el) el.disabled = !!txt; });
}
async function callAI(system, user) {
  const r = await api.coachAI({ system, user });
  if (!r || !r.json) throw new Error("Risposta vuota");
  return r.json;
}
function applyAI(j) {
  const w = j && j.week ? j.week : j;
  if (!w || !Array.isArray(w.sessions)) throw new Error("formato");
  w.number = cur.number; w.publishedAt = cur.date;
  if (!w.program) w.program = prevWeek(cur.number)?.program || "Hybrid ProGram";
  cur.data = w;
  cur.dubbi = Array.isArray(j.dubbi) ? j.dubbi.map(String) : [];
  cur.verify = null;
  dirty(); renderChecks(); renderPreview(!$("prevBox")?.querySelector("iframe"));
}
async function convert() {
  if (!cur.text.trim()) return toast("Incolla prima il testo della settimana");
  if (cur.data && !confirm("Rifaccio l'impostazione da zero? Le correzioni fatte sulla settimana attuale si perdono.")) return;
  setBusy("L'IA sta impostando la settimana (fino a un minuto)…");
  try {
    applyAI(await callAI(SYSTEM_PROMPT, convertMessage()));
    toast("Settimana impostata: controlla anteprima e dubbi");
    await verify(true);
  } catch (e) { toast(e.message || "Errore dell'IA"); }
  finally { setBusy(""); }
}
const VERIFY_PROMPT = `Sei un verificatore della programmazione di allenamento. Confronta voce per voce il TESTO del coach con la SETTIMANA in JSON.
Controlla: esercizi, ripetizioni, serie, carichi (uomo/donna, Rx/scalato), percentuali, recuperi, distanze, zone, cadenze, % FTP, metri del nuoto, note e indicazioni del coach, sessioni facoltative.
Segnala solo differenze reali: elementi mancanti, inventati o diversi. Ignora formattazione e simboli (′ ″ × –), la sintesi nel campo summary e i campi tecnici (id, icon, tab, score, calcs).
Rispondi solo con JSON: {"discrepanze": ["frase breve e precisa: cosa dice il testo, cosa c'è nella settimana"]} (array vuoto se tutto corrisponde).`;
async function verify(chained) {
  if (!cur.data || !cur.text.trim()) return toast("Servono il testo e la settimana impostata");
  setBusy("Verifico che non manchi niente…");
  try {
    const j = await callAI(VERIFY_PROMPT, `TESTO del coach:\n"""\n${cur.text.trim()}\n"""\n\nSETTIMANA:\n${JSON.stringify(cur.data)}`);
    cur.verify = Array.isArray(j.discrepanze) ? j.discrepanze.map(String) : [];
    renderChecks();
    if (!chained) toast(cur.verify.length ? `${cur.verify.length} discrepanze da controllare` : "Nessuna discrepanza");
  } catch (e) { toast("Verifica non riuscita: " + (e.message || "errore")); }
  finally { setBusy(""); }
}
async function fix() {
  const ask = $("fixIn").value.trim();
  if (!ask) return toast("Scrivi cosa correggere");
  if (!cur.data) return toast("Prima imposta la settimana");
  setBusy("Applico la correzione…");
  try {
    const dubbi = cur.dubbi;
    applyAI(await callAI(SYSTEM_PROMPT, [
      `Settimana attuale in JSON (mantieni id, ordine e tutto ciò che non è toccato dalla correzione):\n${JSON.stringify(cur.data)}`,
      `Testo originale del coach:\n"""\n${cur.text.trim()}\n"""`,
      `Correzione richiesta dal coach: ${ask}`,
      `Applica solo questa correzione e restituisci la settimana completa nel formato { "week": ..., "dubbi": [...] }.`
    ].join("\n\n")));
    if (!cur.dubbi.length) cur.dubbi = dubbi;
    $("fixIn").value = "";
    renderChecks();
    toast("Correzione applicata");
  } catch (e) { toast(e.message || "Correzione non riuscita"); }
  finally { setBusy(""); }
}

/* ---------- Salvataggio e pubblicazione ---------- */
function dirty() { cur.dirty = true; renderHead(); }
async function save(status, publishAt = null, silent = false) {
  if (!cur.data) return toast("Non c'è ancora una settimana da salvare");
  const errs = checkWeek(clone(cur.data));
  if (status === "published" && errs.length) return toast("Correggi prima gli errori di formato (vedi Controlli)");
  if (status === "published" && !silent) {
    const lost = checks().filter(c => c.k === "err").length;
    const msg = publishAt ? `Programmare la settimana ${cur.number} per il ${fmtDT(publishAt)}?` : `Pubblicare la settimana ${cur.number} per tutti gli atleti adesso?`;
    if (!confirm(msg + (lost ? `\n\nAttenzione: ci sono ${lost} problemi segnalati nei controlli.` : ""))) return;
  }
  if (cur.isNew && liveData(cur.number) && !confirm(`La settimana ${cur.number} esiste già. Sostituirla?`)) return;
  const data = { ...clone(cur.data), number: cur.number, publishedAt: cur.date };
  try {
    await api.coachSaveWeek({ number: cur.number, data, status, publish_at: publishAt, source_text: cur.text });
    await loadAll();
    cur.isNew = false; cur.dirty = false; cur.data = data;
    renderEditor();
    toast(status === "draft" ? (silent ? "Settimana ritirata" : "Bozza salvata") : publishAt ? "Pubblicazione programmata" : "Pubblicata: gli atleti la vedono alla prossima apertura");
  } catch (e) { toast(e.message || "Salvataggio non riuscito"); }
}
async function del() {
  if (!confirm(`Eliminare la bozza della settimana ${cur.number}?`)) return;
  try {
    await api.coachDeleteWeek(cur.number);
    await loadAll(); cur.dirty = false;
    const n = allNumbers()[0];
    n ? open(n) : newWeek();
    toast("Bozza eliminata");
  } catch (e) { toast(e.message || "Eliminazione non riuscita"); }
}
async function loadHistory() {
  const box = $("hist"); box.innerHTML = `<p class="help">Carico…</p>`;
  try {
    const rows = await api.coachHistory(cur.number) || [];
    box.innerHTML = rows.map((r, i) => `<button data-i="${i}" type="button"><span>${fmtDT(r.saved_at)}</span><span class="chip ${r.status === "draft" ? "draft" : "pub"}">${r.status === "draft" ? "Bozza" : "Pubblicata"}</span></button>`).join("") || `<p class="help">Nessuna versione precedente.</p>`;
    box.querySelectorAll("[data-i]").forEach(b => b.addEventListener("click", () => {
      const r = rows[+b.dataset.i];
      if (!confirm("Caricare questa versione nell'editor? Per renderla effettiva poi salva o pubblica.")) return;
      cur.data = r.data; cur.text = r.source_text || cur.text; cur.dubbi = []; cur.verify = null;
      $("wText").value = cur.text; dirty(); renderChecks(); renderPreview(false);
    }));
  } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

/* ---------- Avvio ---------- */
function gate(msg, login) {
  main.innerHTML = `<div class="c-empty"><section class="card glass c-card"><h2>Dashboard coach</h2><p class="help" style="margin-top:10px">${esc(msg)}</p>
    ${login ? `<a class="btn btn-primary" href="index.html">Vai all'accesso</a>` : `<a class="btn btn-ghost" href="index.html">Torna all'app</a>`}</section></div>`;
  $("newWeek").hidden = true;
}
window.addEventListener("beforeunload", e => { if (cur?.dirty) { e.preventDefault(); e.returnValue = ""; } });
$("newWeek").addEventListener("click", newWeek);
api.onAuthChange(s => { if (!s) gate("La sessione è scaduta: accedi di nuovo nell'app.", true); });

(async function boot() {
  const u = api.currentUser();
  if (!u) return gate("Accedi prima nell'app con l'account del coach, poi torna su questa pagina.", true);
  $("whoami").textContent = u.email || "";
  if (!(await api.isCoach())) return gate("Questo account non è abilitato come coach. Chiedi all'amministratore di abilitarlo.");
  try { await loadAll(); }
  catch (e) { return gate("Non riesco a caricare le settimane: " + (e.message || "errore") + ". Riprova."); }
  const n = allNumbers()[0];
  n ? open(n) : newWeek();
})();
