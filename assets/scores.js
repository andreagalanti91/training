/* Score degli allenamenti e classifiche condivise.
   Ogni card allenamento (blocco) ha due pulsanti: "Score" per inserire il proprio risultato
   e "Classifica" per vedere quelli degli altri atleti, divisi per categoria (Rx/Scaled, livelli). */
import * as api from "./api.js";

/* Metriche confrontabili in classifica. "lower": vince il valore più basso. */
const METRICS = {
  time: { label: "Tempo", input: "mmss", lower: true },
  split: { label: "Media a round", input: "mmss", lower: true },
  pace: { label: "Passo medio", input: "mmss", lower: true, suffix: "/km" },
  watts: { label: "Watt medi", input: "int", unit: "W", lower: false },
  reps: { label: "Ripetizioni totali", input: "int", unit: "rip.", lower: false },
  rounds: { label: "Round", input: "int", unit: "round", lower: false },
  load: { label: "Carico", input: "dec", unit: "kg", lower: false },
  distance: { label: "Distanza", input: "int", unit: "m", lower: false }
};
/* Cosa si inserisce per ogni tipo di lavoro (le note ci sono sempre). */
const PROFILES = {
  run: { metrics: ["pace", "time"], hint: "Passo medio al km delle ripetute oppure tempo totale." },
  bike: { metrics: ["watts", "time"], hint: "Watt medi del lavoro oppure tempo totale." },
  emom: { metrics: ["reps"], hint: "Ripetizioni totali completate." },
  amrap: { metrics: ["rounds"], hint: "Round completati: le ripetizioni extra mettile nelle note." },
  fortime: { metrics: ["time"], hint: "Tempo finale. Se hai chiuso al time cap scrivilo nelle note." },
  strength: { metrics: [], hint: "Scrivi carichi, serie e sensazioni nelle note." },
  swim: { metrics: ["time"], hint: "Tempo totale della piscina." },
  erg: { metrics: ["split", "time"], notesOk: true, hint: "Media a round (es. tempo medio ogni 500 m), tempo totale oppure solo note." },
  load: { metrics: ["load"] },
  distance: { metrics: ["distance"] }
};
// Nomi accettati nel campo "score.type" della programmazione (alcuni sono sinonimi).
const ALIAS = { time: "fortime", pace: "run", watts: "bike", reps: "emom", rounds: "amrap", notes: "strength", note: "strength", row: "erg", ski: "erg" };
export const SCORE_TYPES = [...Object.keys(PROFILES), ...Object.keys(ALIAS)];

/* Profilo di score del blocco: quello della programmazione o dedotto da titolo, badge e disciplina. */
export function scoreConf(b, session) {
  if (b.score === false) return null;
  const s = b.score && typeof b.score === "object" ? b.score : {};
  const t = `${b.badge || ""} ${b.title || ""}`.toLowerCase();
  const icon = session && session.icon;
  let type = PROFILES[s.type] ? s.type : ALIAS[s.type];
  if (!type) type = /emom/.test(t) ? "emom"
    : /amrap/.test(t) ? "amrap"
    : /for time/.test(t) ? "fortime"
    : /strength|bilanciere|forza/.test(t) ? "strength"
    : /swim|nuoto|piscina/.test(t) ? "swim"
    : /bike|ftp/.test(t) ? "bike"
    : /\brow\b|\bski\b|erg/.test(t) ? "erg"
    : /\brun\b|corsa/.test(t) ? "run"
    : { run: "run", bike: "bike", swim: "swim", row: "erg", ski: "erg", bar: "strength", gym: "strength" }[icon] || "fortime";
  const P = PROFILES[type];
  const divisions = Array.isArray(s.divisions) && s.divisions.length ? s.divisions.map(String)
    : b.levels ? Object.keys(b.levels)
    : (b.loads || []).some(l => l.sc) || (b.table && b.table.cols.some(c => /scaled/i.test(c))) ? ["Rx", "Scaled"]
    : [];
  return { type, metrics: P.metrics, notesOk: !!P.notesOk || !P.metrics.length, hint: s.label || P.hint || "", divisions };
}

const pad = n => String(n).padStart(2, "0");
const nf = n => Number(n).toLocaleString("it-IT");
function fmtSecs(v) {
  const h = Math.floor(v / 3600), m = Math.floor(v % 3600 / 60), s = Math.round(v % 60);
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
export function formatScore(kind, v) {
  const M = METRICS[kind];
  if (!M || v == null) return "";
  if (M.input === "mmss") return fmtSecs(v) + (M.suffix || "");
  return `${nf(v)} ${M.unit}`;
}

/* Legge i campi della metrica scelta e restituisce { value } oppure { error }. */
function readMetric(kind, root) {
  const M = METRICS[kind];
  const num = id => { const x = root.querySelector(`#${id}`); const v = x ? String(x.value).trim().replace(",", ".") : ""; return v === "" ? null : Number(v); };
  if (M.input === "mmss") {
    const m = num("scA") ?? 0, s = num("scB") ?? 0;
    if (![m, s].every(x => Number.isInteger(x) && x >= 0) || s >= 60) return { error: "Controlla minuti e secondi (secondi da 0 a 59)." };
    const v = m * 60 + s;
    if (!v) return { error: `Inserisci ${M.label.toLowerCase()}.` };
    if (kind === "pace" && (v < 120 || v > 900)) return { error: "Il passo deve stare tra 2:00 e 15:00 al km." };
    return { value: v };
  }
  const v = num("scA");
  if (v === null || !Number.isFinite(v) || v <= 0) return { error: `Inserisci ${M.label.toLowerCase()}.` };
  if (M.input === "int" && !Number.isInteger(v)) return { error: "Usa un numero intero." };
  return { value: M.input === "dec" ? Math.round(v * 10) / 10 : v };
}

function metricFields(kind, value) {
  const M = METRICS[kind];
  if (!M) return "";
  if (M.input === "mmss") return `<div class="sc-two">
    <label class="field"><span>Minuti</span><input id="scA" inputmode="numeric" pattern="[0-9]*" value="${value == null ? "" : Math.floor(value / 60)}" autocomplete="off"></label>
    <span class="sc-sep">:</span>
    <label class="field"><span>Secondi</span><input id="scB" inputmode="numeric" pattern="[0-9]*" value="${value == null ? "" : pad(Math.round(value % 60))}" autocomplete="off"></label></div>`;
  return `<label class="field"><span>${M.label}</span><span class="inp sc-unit"><input id="scA" inputmode="${M.input === "dec" ? "decimal" : "numeric"}" value="${value ?? ""}" autocomplete="off"><em>${M.unit}</em></span></label>`;
}

/* ---------- Stato e collegamenti con l'app ---------- */
let D = null;           // dipendenze passate da app.js
const mine = new Map(); // "settimana:sessione:blocco" -> il mio score
const loaded = new Set();
const key = (w, s, b) => `${w}:${s}:${b}`;
// "Blocco · Sessione · settimana N", senza ripetere il titolo quando i due coincidono.
const norm = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "");
const where = (block, session, week) => `<b>${D.esc(block.title)}</b>${norm(session.title) && !norm(block.title).startsWith(norm(session.title)) ? ` · ${D.esc(session.title)}` : ""} · settimana ${week}`;
export function init(deps) { D = deps; }
export function reset() { mine.clear(); loaded.clear(); }
export const myScore = (w, s, b) => mine.get(key(w, s, b)) || null;

/* Carica i miei score della settimana (una volta) e aggiorna i pulsanti. */
export async function loadMine(week, force) {
  if (loaded.has(week) && !force) return;
  try {
    const rows = await api.myScores(week);
    [...mine.keys()].filter(k => k.startsWith(week + ":")).forEach(k => mine.delete(k));
    (rows || []).forEach(r => mine.set(key(week, r.session_id, r.block), r));
    loaded.add(week);
    D.refreshBars();
  } catch (e) { /* offline o tabella mancante: i pulsanti restano utilizzabili */ }
}

export function barHTML(conf, week, sessionId, bi) {
  if (!conf) return "";
  const m = myScore(week, sessionId, bi);
  const shown = m ? (m.display || "Note inserite") : "Inserisci";
  return `<div class="score-bar" data-scorebar="${bi}">
    <button class="sb-score${m ? " has" : ""}" data-score="${bi}" aria-label="${m ? `Il tuo score: ${D.esc(shown)}. Modifica` : "Inserisci il tuo score"}">${D.svg("stopwatch", 2)}<span><small>${m ? "Il tuo score" : "Score"}</small><b>${D.esc(shown)}</b></span></button>
    <button class="sb-board" data-board="${bi}" aria-label="Classifica">${D.svg("trophy", 2)}<span><small>${conf.metrics.length ? "Classifica" : "Note atleti"}</small><b>Vedi</b></span></button>
  </div>`;
}

const segHTML = (id, items, cur, label) => `<div class="seg" role="group" aria-label="${label}" id="${id}"><span class="knob"></span>${items.map(([v, t]) => `<button type="button" data-v="${D.esc(v)}" aria-pressed="${v === cur}">${t}</button>`).join("")}</div>`;
function bindSeg(seg, onPick) {
  if (!seg) return;
  requestAnimationFrame(() => D.placeKnob(seg));
  seg.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
    seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === btn));
    D.placeKnob(seg); onPick(btn.dataset.v);
  }));
}

/* ---------- Inserimento dello score ---------- */
export function openScore(ctx) {
  const { week, session, bi, block, conf } = ctx;
  const m = myScore(week, session.id, bi);
  const div0 = m?.division && conf.divisions.includes(m.division) ? m.division : (D.levelOf ? D.levelOf(conf.divisions) : "");
  let div = conf.divisions.includes(div0) ? div0 : conf.divisions[0] || "";
  // Metriche disponibili: quelle del tipo di lavoro, più "Solo note" dove previsto.
  const kinds = [...conf.metrics, ...(conf.notesOk ? ["note"] : [])];
  let kind = m && kinds.includes(m.kind) ? m.kind : kinds[0];
  const needName = !D.displayName().trim();
  const body = D.$("scoreBody");
  D.$("scT").textContent = m ? "Modifica score" : "Il tuo score";
  body.innerHTML = `<p class="help">${where(block, session, week)}${conf.hint ? `<br>${D.esc(conf.hint)}` : ""}</p>
    ${conf.divisions.length ? segHTML("scDiv", conf.divisions.map(d => [d, D.esc(d)]), div, "Categoria") : ""}
    ${kinds.length > 1 ? segHTML("scMet", kinds.map(k => [k, k === "note" ? "Solo note" : METRICS[k].label]), kind, "Cosa inserisci") : ""}
    <form id="scForm" novalidate><div id="scFields"></div>
      <label class="field"><span id="scNoteL"></span><textarea id="scNote" maxlength="200" rows="3" placeholder="${conf.type === "strength" ? "es. Back squat 5×5 a 100 kg, ultima serie dura" : conf.type === "run" || conf.type === "bike" || conf.type === "swim" || conf.type === "erg" ? "es. sensazioni, condizioni, recuperi" : "es. 24 kg, wall ball 6 kg, chiuso al time cap"}">${D.esc(m?.note || "")}</textarea></label>
      ${needName ? `<label class="field"><span>Nome in classifica</span><input id="scName" maxlength="40" autocomplete="name" required></label>` : ""}
      <p class="err" id="scErr" hidden></p>
      <div class="row-btns">${m ? `<button type="button" class="btn btn-ghost" id="scDel">Elimina</button>` : ""}<button class="btn btn-primary" type="submit">Salva score</button></div>
    </form>`;
  const drawFields = () => {
    body.querySelector("#scFields").innerHTML = kind === "note" ? "" : metricFields(kind, m && m.kind === kind ? Number(m.value) : null);
    body.querySelector("#scNoteL").innerHTML = kind === "note" ? "Note" : `Note <small style="color:var(--text-3);font-weight:500">(facoltative, visibili in classifica)</small>`;
  };
  drawFields();
  bindSeg(body.querySelector("#scDiv"), v => { div = v; });
  bindSeg(body.querySelector("#scMet"), v => { kind = v; drawFields(); });
  const err = body.querySelector("#scErr");
  const fail = msg => { err.textContent = msg; err.hidden = false; };
  body.querySelector("#scForm").addEventListener("submit", async e => {
    e.preventDefault();
    const note = body.querySelector("#scNote").value.trim().slice(0, 200);
    let value = null;
    if (kind === "note") { if (!note) return fail("Scrivi una nota."); }
    else { const r = readMetric(kind, body); if (r.error) return fail(r.error); value = r.value; }
    let name = D.displayName().trim();
    if (needName) {
      name = body.querySelector("#scName").value.trim().slice(0, 40);
      if (!name) return fail("Scegli il nome da mostrare in classifica.");
    }
    const btn = e.target.querySelector("[type=submit]"); btn.disabled = true;
    const row = { week, session_id: session.id, block: bi, kind, value, display: formatScore(kind, value), division: div, note, name };
    try {
      if (needName) await D.setName(name);
      await api.saveScore(row);
      mine.set(key(week, session.id, bi), row);
      D.onSaved(ctx);
      D.closeSheet();
      D.refreshBars();
      D.toast("Score salvato");
    } catch (x) { fail(x.offline ? "Sei offline: lo score si salva solo con la connessione." : x.message); }
    finally { btn.disabled = false; }
  });
  body.querySelector("#scDel")?.addEventListener("click", async e => {
    const b = e.currentTarget; b.disabled = true;
    try {
      await api.deleteScore(week, session.id, bi);
      mine.delete(key(week, session.id, bi));
      D.closeSheet(); D.refreshBars(); D.toast("Score eliminato");
    } catch (x) { fail(x.message); b.disabled = false; }
  });
  D.showSheet("sheetScore");
}

/* ---------- Classifica ---------- */
const MEDAL = ["gold", "silver", "bronze"];
export async function openBoard(ctx) {
  const { week, session, bi, block, conf } = ctx;
  const body = D.$("boardBody");
  D.$("sbT").textContent = conf.metrics.length ? "Classifica" : "Note degli atleti";
  const head = `<p class="help">${where(block, session, week)}</p>`;
  body.innerHTML = head + `<div class="loading small"><span class="spin"></span>Carico la classifica…</div>`;
  D.showSheet("sheetBoard");
  let rows;
  try { rows = await api.listScores(week, session.id, bi) || []; }
  catch (x) { body.innerHTML = head + `<p class="notice bad">${D.esc(x.offline ? "Sei offline: la classifica si vede solo con la connessione." : x.message)}</p>`; return; }
  const me = D.userId();
  const mineRow = rows.find(r => r.user_id === me);
  const divs = conf.divisions.length ? [...conf.divisions] : [""];
  rows.forEach(r => { if (!divs.includes(r.division)) divs.push(r.division); });
  const kinds = [...conf.metrics];
  rows.forEach(r => { if (!kinds.includes(r.kind)) kinds.push(r.kind); });
  if (!kinds.length) kinds.push("note");
  let div = mineRow ? mineRow.division : divs.find(d => rows.some(r => r.division === d)) ?? divs[0];
  let kind = mineRow ? mineRow.kind : kinds.find(k => rows.some(r => r.kind === k)) ?? kinds[0];
  const list = () => {
    const R = rows.filter(r => r.division === div && r.kind === kind);
    if (!R.length) return `<p class="empty-note small board-empty">Ancora nessuno score qui. ${mineRow ? "" : "Inserisci il tuo!"}</p>`;
    // Le sole note non hanno un ordine di merito: le più recenti in alto.
    if (kind === "note") return `<ol class="board notes-list">${R.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).map(r => `<li class="${r.user_id === me ? "me" : ""}">
        <span class="who"><b>${D.esc(r.name || "Atleta")}${r.user_id === me ? ' <em>tu</em>' : ""}</b><small class="full">${D.esc(r.note)}</small></span></li>`).join("")}</ol>`;
    const lower = METRICS[kind]?.lower;
    R.sort((a, b) => (lower ? 1 : -1) * (Number(a.value) - Number(b.value)) || String(a.updated_at).localeCompare(String(b.updated_at)));
    let rank = 0, prev = null;
    return `<ol class="board">${R.map((r, i) => {
      if (String(r.value) !== String(prev)) { rank = i + 1; prev = r.value; }
      const isMe = r.user_id === me;
      return `<li class="${isMe ? "me" : ""}"><span class="rk ${MEDAL[rank - 1] || ""}">${rank}</span>
        <span class="who"><b>${D.esc(r.name || "Atleta")}${isMe ? ' <em>tu</em>' : ""}</b>${r.note ? `<small>${D.esc(r.note)}</small>` : ""}</span>
        <span class="val">${D.esc(r.display)}</span></li>`;
    }).join("")}</ol>`;
  };
  const count = (k, d) => rows.filter(r => (k === null || r.kind === k) && (d === null || r.division === d)).length;
  const draw = () => {
    body.innerHTML = head
      + (divs.length > 1 || divs[0] ? segHTML("bdDiv", divs.map(d => [d, `${D.esc(d || "Tutti")} <small>${count(null, d)}</small>`]), div, "Categoria") : "")
      + (kinds.length > 1 ? segHTML("bdMet", kinds.map(k => [k, `${k === "note" ? "Note" : METRICS[k]?.label || k} <small>${count(k, div)}</small>`]), kind, "Metrica") : "")
      + (kind !== "note" && METRICS[kind] ? `<p class="hint board-rule">${METRICS[kind].label} · vince il più ${METRICS[kind].lower ? "basso" : "alto"}</p>` : "")
      + list()
      + `<button class="btn ${mineRow ? "btn-ghost" : "btn-primary"} btn-block" id="bdMine">${D.svg("stopwatch", 2)} ${mineRow ? "Modifica il tuo score" : "Inserisci il tuo score"}</button>`;
    bindSeg(body.querySelector("#bdDiv"), v => { div = v; draw(); });
    bindSeg(body.querySelector("#bdMet"), v => { kind = v; draw(); });
    body.querySelector("#bdMine").addEventListener("click", () => { D.closeSheet(true); openScore(ctx); });
  };
  draw();
}
