/* Score degli allenamenti e classifiche condivise.
   Ogni card allenamento (blocco) ha due pulsanti: "Score" per inserire il proprio risultato
   e "Classifica" per vedere quelli degli altri atleti, divisi per categoria (Rx/Scaled, livelli). */
import * as api from "./api.js";

const TYPES = {
  time: { label: "Tempo", lower: true },
  pace: { label: "Passo medio", lower: true },
  amrap: { label: "Round + ripetizioni", lower: false },
  load: { label: "Carico", unit: "kg", lower: false, decimal: true },
  reps: { label: "Ripetizioni", unit: "rip.", lower: false },
  watts: { label: "Potenza media", unit: "W", lower: false },
  distance: { label: "Distanza", unit: "m", lower: false }
};
export const SCORE_TYPES = Object.keys(TYPES);

/* Tipo di score del blocco: quello scritto nella programmazione o, se manca, dedotto da titolo e badge. */
export function scoreConf(b) {
  if (b.score === false) return null;
  const s = b.score && typeof b.score === "object" ? b.score : {};
  const t = `${b.badge || ""} ${b.title || ""}`.toLowerCase();
  const type = TYPES[s.type] ? s.type
    : /for time/.test(t) ? "time"
    : /amrap/.test(t) ? "amrap"
    : /emom|giri/.test(t) ? "reps"
    : /strength|bilanciere|forza/.test(t) ? "load"
    : /bike|ftp/.test(t) ? "watts"
    : /run|corsa/.test(t) ? "pace"
    : "time";
  const divisions = Array.isArray(s.divisions) && s.divisions.length ? s.divisions.map(String)
    : b.levels ? Object.keys(b.levels)
    : (b.loads || []).some(l => l.sc) || (b.table && b.table.cols.some(c => /scaled/i.test(c))) ? ["Rx", "Scaled"]
    : [];
  return { type, ...TYPES[type], label: s.label || TYPES[type].label, divisions };
}

const pad = n => String(n).padStart(2, "0");
const nf = n => n.toLocaleString("it-IT");
function fmtSecs(v) {
  const h = Math.floor(v / 3600), m = Math.floor(v % 3600 / 60), s = Math.round(v % 60);
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
export function formatScore(type, v) {
  if (type === "time") return fmtSecs(v);
  if (type === "pace") return fmtSecs(v) + "/km";
  if (type === "amrap") { const r = Math.floor(v / 1000), reps = v % 1000; return reps ? `${r} round + ${reps}` : `${r} round`; }
  return nf(v) + " " + TYPES[type].unit;
}

/* Legge i campi del modulo e restituisce { value } oppure { error }. */
function readForm(type, root) {
  const num = id => { const x = root.querySelector(`#${id}`); const v = x ? String(x.value).trim().replace(",", ".") : ""; return v === "" ? null : Number(v); };
  if (type === "time" || type === "pace") {
    const m = num("scA") ?? 0, s = num("scB") ?? 0;
    if (!Number.isFinite(m) || !Number.isFinite(s) || m < 0 || s < 0 || s >= 60 || !Number.isInteger(m) || !Number.isInteger(s)) return { error: "Controlla minuti e secondi (secondi da 0 a 59)." };
    const v = m * 60 + s;
    if (!v) return { error: "Inserisci il tempo." };
    if (type === "pace" && (v < 120 || v > 900)) return { error: "Il passo deve stare tra 2:00 e 15:00 al km." };
    return { value: v };
  }
  if (type === "amrap") {
    const r = num("scA") ?? 0, reps = num("scB") ?? 0;
    if (![r, reps].every(x => Number.isInteger(x) && x >= 0) || reps > 999) return { error: "Round e ripetizioni devono essere numeri interi." };
    if (!r && !reps) return { error: "Inserisci round e ripetizioni." };
    return { value: r * 1000 + reps };
  }
  const v = num("scA");
  if (v === null || !Number.isFinite(v) || v <= 0) return { error: `Inserisci ${TYPES[type].label.toLowerCase()}.` };
  if (!TYPES[type].decimal && !Number.isInteger(v)) return { error: "Usa un numero intero." };
  return { value: TYPES[type].decimal ? Math.round(v * 10) / 10 : v };
}

function formFields(type, value) {
  const two = (la, lb, a, b, ua, ub) => `<div class="sc-two">
    <label class="field"><span>${la}</span><input id="scA" inputmode="numeric" pattern="[0-9]*" value="${a ?? ""}" autocomplete="off"></label>
    <span class="sc-sep">${type === "amrap" ? "+" : ":"}</span>
    <label class="field"><span>${lb}</span><input id="scB" inputmode="numeric" pattern="[0-9]*" value="${b ?? ""}" autocomplete="off"></label></div>`;
  if (type === "time" || type === "pace") {
    const v = value ?? null;
    return two("Minuti", "Secondi", v === null ? "" : Math.floor(v / 60), v === null ? "" : pad(Math.round(v % 60)))
      + (type === "pace" ? `<p class="hint">Passo medio al km delle ripetute o del lavoro principale.</p>` : "");
  }
  if (type === "amrap") return two("Round", "Ripetizioni", value == null ? "" : Math.floor(value / 1000), value == null ? "" : value % 1000);
  const T = TYPES[type];
  return `<label class="field"><span>${T.label}</span><span class="inp sc-unit"><input id="scA" inputmode="${T.decimal ? "decimal" : "numeric"}" value="${value ?? ""}" autocomplete="off"><em>${T.unit}</em></span></label>`;
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
  return `<div class="score-bar" data-scorebar="${bi}">
    <button class="sb-score${m ? " has" : ""}" data-score="${bi}" aria-label="${m ? `Il tuo score: ${D.esc(m.display)}. Modifica` : "Inserisci il tuo score"}">${D.svg("stopwatch", 2)}<span><small>${m ? "Il tuo score" : "Score"}</small><b>${m ? D.esc(m.display) : "Inserisci"}</b></span></button>
    <button class="sb-board" data-board="${bi}" aria-label="Classifica">${D.svg("trophy", 2)}<span><small>Classifica</small><b>Vedi</b></span></button>
  </div>`;
}

/* ---------- Inserimento dello score ---------- */
export function openScore(ctx) {
  const { week, session, bi, block, conf } = ctx;
  const m = myScore(week, session.id, bi);
  const div0 = m?.division && conf.divisions.includes(m.division) ? m.division : (D.levelOf ? D.levelOf(conf.divisions) : conf.divisions[0]) || "";
  let div = conf.divisions.includes(div0) ? div0 : conf.divisions[0] || "";
  const needName = !D.displayName().trim();
  const body = D.$("scoreBody");
  D.$("scT").textContent = m ? "Modifica score" : "Il tuo score";
  body.innerHTML = `<p class="help">${where(block, session, week)}<br>${conf.label}${conf.lower ? " (vince il più basso)" : " (vince il più alto)"}</p>
    ${conf.divisions.length ? `<div class="seg" role="group" aria-label="Categoria" id="scDiv"><span class="knob"></span>${conf.divisions.map(d => `<button type="button" data-div="${D.esc(d)}" aria-pressed="${d === div}">${D.esc(d)}</button>`).join("")}</div>` : ""}
    <form id="scForm" novalidate>${formFields(conf.type, m ? Number(m.value) : null)}
      <label class="field"><span>Note <small style="color:var(--text-3);font-weight:500">(facoltative, visibili in classifica)</small></span><input id="scNote" maxlength="140" value="${D.esc(m?.note || "")}" placeholder="es. 24 kg, wall ball 6 kg" autocomplete="off"></label>
      ${needName ? `<label class="field"><span>Nome in classifica</span><input id="scName" maxlength="40" autocomplete="name" required></label>` : ""}
      <p class="err" id="scErr" hidden></p>
      <div class="row-btns">${m ? `<button type="button" class="btn btn-ghost" id="scDel">Elimina</button>` : ""}<button class="btn btn-primary" type="submit">Salva score</button></div>
    </form>`;
  const seg = body.querySelector("#scDiv");
  if (seg) {
    requestAnimationFrame(() => D.placeKnob(seg));
    seg.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
      div = btn.dataset.div;
      seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === btn));
      D.placeKnob(seg);
    }));
  }
  const err = body.querySelector("#scErr");
  const fail = msg => { err.textContent = msg; err.hidden = false; };
  body.querySelector("#scForm").addEventListener("submit", async e => {
    e.preventDefault();
    const r = readForm(conf.type, body);
    if (r.error) return fail(r.error);
    let name = D.displayName().trim();
    if (needName) {
      name = body.querySelector("#scName").value.trim().slice(0, 40);
      if (!name) return fail("Scegli il nome da mostrare in classifica.");
    }
    const btn = e.target.querySelector("[type=submit]"); btn.disabled = true;
    const row = { week, session_id: session.id, block: bi, kind: conf.type, value: r.value, display: formatScore(conf.type, r.value), division: div, note: body.querySelector("#scNote").value.trim().slice(0, 140), name };
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
  D.$("sbT").textContent = "Classifica";
  const head = `<p class="help">${where(block, session, week)}<br>${conf.label}${conf.lower ? " · vince il più basso" : " · vince il più alto"}</p>`;
  body.innerHTML = head + `<div class="loading small"><span class="spin"></span>Carico la classifica…</div>`;
  D.showSheet("sheetBoard");
  let rows;
  try { rows = await api.listScores(week, session.id, bi, conf.lower) || []; }
  catch (x) { body.innerHTML = head + `<p class="notice bad">${D.esc(x.offline ? "Sei offline: la classifica si vede solo con la connessione." : x.message)}</p>`; return; }
  const me = D.userId();
  const divs = conf.divisions.length ? [...conf.divisions] : [""];
  rows.forEach(r => { if (!divs.includes(r.division)) divs.push(r.division); });
  const mineRow = rows.find(r => r.user_id === me);
  let cur = mineRow ? mineRow.division : divs.find(d => rows.some(r => r.division === d)) ?? divs[0];
  const list = d => {
    const R = rows.filter(r => r.division === d);
    if (!R.length) return `<p class="empty-note small board-empty">Ancora nessuno score${d ? ` in ${D.esc(d)}` : ""}. ${mineRow ? "" : "Inserisci il tuo e apri la classifica!"}</p>`;
    let rank = 0, prev = null;
    return `<ol class="board">${R.map((r, i) => {
      if (String(r.value) !== String(prev)) { rank = i + 1; prev = r.value; }
      const isMe = r.user_id === me;
      return `<li class="${isMe ? "me" : ""}"><span class="rk ${MEDAL[rank - 1] || ""}">${rank}</span>
        <span class="who"><b>${D.esc(r.name || "Atleta")}${isMe ? ' <em>tu</em>' : ""}</b>${r.note ? `<small>${D.esc(r.note)}</small>` : ""}</span>
        <span class="val">${D.esc(r.display)}</span></li>`;
    }).join("")}</ol>`;
  };
  const draw = () => {
    body.innerHTML = head
      + (divs.length > 1 || divs[0] ? `<div class="seg" role="group" aria-label="Categoria" id="bdDiv"><span class="knob"></span>${divs.map(d => `<button type="button" data-div="${D.esc(d)}" aria-pressed="${d === cur}">${D.esc(d || "Tutti")} <small>${rows.filter(r => r.division === d).length}</small></button>`).join("")}</div>` : "")
      + list(cur)
      + `<button class="btn ${mineRow ? "btn-ghost" : "btn-primary"} btn-block" id="bdMine">${D.svg("stopwatch", 2)} ${mineRow ? "Modifica il tuo score" : "Inserisci il tuo score"}</button>`;
    const seg = body.querySelector("#bdDiv");
    if (seg) {
      requestAnimationFrame(() => D.placeKnob(seg));
      seg.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => { cur = btn.dataset.div; draw(); }));
    }
    body.querySelector("#bdMine").addEventListener("click", () => { D.closeSheet(true); openScore(ctx); });
  };
  draw();
}
