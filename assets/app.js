import * as api from "./api.js";
import * as store from "./store.js";
import * as charts from "./charts.js";

const VERSION = "2.0";

/* ---------- Icons ---------- */
const ICONS = {
  home: '<path d="M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/>',
  run: '<circle cx="14.5" cy="4.5" r="2"/><path d="M6 21l3.5-5.5 3 2.5V22M9.5 15.5 11 9l4 2.5 3.5.5M11 9l-3.2 1.2L6 13"/>',
  kb: '<path d="M9 9.5V7a3 3 0 0 1 6 0v2.5"/><circle cx="12" cy="15" r="6"/>',
  bike: '<circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5 9.5 9h5.5l3.5 7.5M9.5 9l3.5 7.5H5.5M13.5 6H16"/>',
  bar: '<path d="M2 12h20M5.5 8v8M8.5 6v12M15.5 6v12M18.5 8v8"/>',
  swim: '<circle cx="17" cy="6" r="2"/><path d="M4 12.5l5-3.5 3 3 3.5-1.5M2 17c2 0 2-1.5 4-1.5S8 17 10 17s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M2 21c2 0 2-1.5 4-1.5S8 21 10 21s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/>',
  row: '<path d="M4 20 17 7"/><path d="M15.5 3.5l5 5-3.5 1-2.5-2.5z"/><path d="M2.5 15.5h7"/>',
  ski: '<path d="M8 3v18M16 3v18M5 21h6M13 21h6M8 8l4-3 4 3"/>',
  gym: '<path d="M4 4h16M8 4v4a4 4 0 0 0 8 0V4M12 12v9"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  quote: '<path d="M4 20l1.5-4.5A8 8 0 1 1 8.5 19z"/>',
  whistle: '<circle cx="9" cy="14" r="5"/><path d="M12.5 10.5 21 6v4l-7 2.5M9 14h.01"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  out: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 16l-4-4 4-4M5 12h11"/>',
  down: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="3"/><path d="M11 18.5h2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>'
};
const svg = (n, w = 1.9) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ICONS.kb}</svg>`;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const $ = id => document.getElementById(id);
const root = document.documentElement;
const app = $("app");

/* ---------- Programmazione: data/program.json (uguale per tutti, separata dai dati utente) ---------- */
const DB_URL = "data/program.json";
const cache = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
let weeks = [], curNum = null;
const sortWeeks = () => weeks.sort((a, b) => b.number - a.number);
const W = () => weeks.find(w => w.number === curNum) || weeks[0];
const slug = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "s";
// Ogni sessione ha un id stabile: i progressi restano agganciati anche se l'ordine cambia.
function normalizeWeeks(list) {
  return (list || []).filter(w => w && w.sessions && w.sessions.length).map(w => {
    const ids = new Set();
    w.sessions.forEach(s => {
      let id = s.id || slug(s.tab || s.title), n = 2;
      while (ids.has(id)) id = `${s.id || slug(s.tab || s.title)}-${n++}`;
      ids.add(id); s.id = id;
    });
    return w;
  });
}
const isDone = i => store.isDone(W().number, W().sessions[i].id);

async function fetchDB() {
  // L'hosting ogni tanto rifiuta richieste ravvicinate: un secondo tentativo risolve.
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(DB_URL + "?t=" + Date.now(), { cache: "no-store" });
      if (r.ok) return await r.json();
      if (i === 1) throw new Error("HTTP " + r.status);
    } catch (e) { if (i === 1) throw e; }
    await new Promise(res => setTimeout(res, 1200));
  }
}
async function loadDB() {
  try {
    const db = await fetchDB();
    if (!db || !Array.isArray(db.weeks)) throw new Error("formato");
    cache.set("hpg-db-cache", db); return { db, offline: false };
  } catch (e) {
    const db = cache.get("hpg-db-cache", null);
    if (db) return { db, offline: true };
    throw e;
  }
}

/* ---------- Toast ---------- */
let toastT;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600); }

/* ---------- Tabs ---------- */
const track = $("track"), lens = $("lens");
let TABS = [];
function buildTabs() {
  track.querySelectorAll(".tab").forEach(b => b.remove());
  TABS = [{ id: "home", label: "Home", icon: "home" }, ...W().sessions.map((s, i) => ({ id: "s" + (i + 1), label: s.tab || "G" + (i + 1), icon: s.icon, idx: i }))];
  TABS.forEach(t => {
    const b = document.createElement("button");
    b.className = "tab"; b.dataset.id = t.id;
    b.setAttribute("aria-label", t.idx === undefined ? "Home" : `Allenamento ${t.idx + 1}, ${t.label}`);
    b.innerHTML = svg(t.icon) + `<span>${esc(t.label)}</span><i class="dot"></i>`;
    b.addEventListener("click", () => go(t.id));
    track.appendChild(b);
  });
  fitShell();
}
function syncTabs(id, smooth = true) {
  track.querySelectorAll(".tab").forEach((b, i) => {
    const on = b.dataset.id === id;
    on ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current");
    b.classList.toggle("done", i > 0 && isDone(i - 1));
    if (on) {
      lens.style.width = b.offsetWidth + "px"; lens.style.transform = `translateX(${b.offsetLeft}px)`;
      const target = b.offsetLeft - (track.clientWidth - b.offsetWidth) / 2;
      track.scrollTo({ left: Math.max(0, target), behavior: smooth ? "smooth" : "auto" });
    }
  });
  fades();
}
function fades() {
  const max = track.scrollWidth - track.clientWidth;
  track.classList.toggle("fade-l", track.scrollLeft > 4);
  track.classList.toggle("fade-r", track.scrollLeft < max - 4);
}
track.addEventListener("scroll", fades, { passive: true });

/* ---------- Top bar ---------- */
const initials = () => {
  const n = displayName().trim();
  if (n) return n.split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();
  return (api.currentUser()?.email || "?")[0].toUpperCase();
};
const displayName = () => store.profile("name") || api.currentUser()?.user_metadata?.name || "";
function syncTop() {
  if (!weeks.length) return;
  const wb = $("weekBtn");
  wb.hidden = false;
  wb.innerHTML = `${svg("cal")}<span>Sett. ${W().number}</span>${svg("chev", 2.4).replace("<svg", '<svg class="chev"')}`;
  wb.setAttribute("aria-label", `Settimana ${W().number}, cambia settimana`);
  syncProfileBtn();
}
function syncProfileBtn() {
  const pb = $("profileBtn");
  pb.hidden = false;
  pb.innerHTML = `<span class="ini">${esc(initials())}</span><i class="sync-dot"></i>`;
  const st = store.getStatus();
  pb.classList.toggle("offline", st === "offline"); pb.classList.toggle("error", st === "error");
  pb.setAttribute("aria-label", `Profilo${st === "offline" ? ", offline: i dati verranno salvati appena torni online" : st === "error" ? ", errore di sincronizzazione" : ""}`);
}

/* ---------- Routing ---------- */
function current() { const h = location.hash.slice(1); return TABS.some(t => t.id === h) ? h : "home"; }
let lastIdx = 0;
function go(id) { if (location.hash.slice(1) !== id) location.hash = id; else render(); }
window.addEventListener("hashchange", () => { if (weeks.length && !root.classList.contains("auth-on")) render(); });
window.addEventListener("resize", () => { fitShell(); if (TABS.length) syncTabs(current(), false); });

function render(opts = {}) {
  const id = current(), idx = TABS.findIndex(t => t.id === id);
  const dir = opts.fresh || opts.keep ? "" : idx > lastIdx ? " from-right" : idx < lastIdx ? " from-left" : "";
  lastIdx = idx;
  const y = app.scrollTop;
  app.innerHTML = `<div class="view${dir}">${id === "home" ? homeView() : sessionView(+id.slice(1) - 1)}</div>`;
  bind(id);
  syncTabs(id, !opts.fresh);
  fitShell();
  if (opts.keep) app.scrollTop = y;
  else { navReset(); app.scrollTop = 0; }
}

/* ---------- Home ---------- */
function prevWeek(w) {
  return weeks.filter(x => x.number < w.number).sort((a, b) => b.number - a.number)[0] || null;
}
function notesUnchangedSince(w) {
  const key = JSON.stringify(w.notes || []);
  let since = null;
  for (let p = prevWeek(w); p && JSON.stringify(p.notes || []) === key; p = prevWeek(p)) since = p.number;
  return since;
}
function homeView() {
  const w = W(), S = w.sessions;
  const req = S.filter(s => !s.optional).length, reqDone = S.filter((s, i) => !s.optional && isDone(i)).length;
  const next = S.findIndex((s, i) => !isDone(i) && !s.optional);
  const notesBody = (w.notes || []).map(n => typeof n === "string" ? `<p>${esc(n)}</p>` : `<div class="callout${n.neutral ? " neutral" : ""}">${n.callout}</div>`).join("") || `<p class="empty-note">Nessuna nota per questa settimana.</p>`;
  // Se il coach ha ricopiato le stesse note, le comprimiamo: la home mostra subito gli allenamenti.
  const since = notesUnchangedSince(w);
  const notes = since
    ? `<details class="notes-same"><summary><span>Invariate dalla settimana ${since}</span>${svg("chev", 2.4)}</summary>${notesBody}</details>`
    : notesBody;
  const rows = S.map((s, i) => {
    const d = isDone(i), isNext = i === next && w.number === weeks[0].number;
    return `
    <button class="srow glass${d ? " done" : ""}${isNext ? " is-next" : ""}" data-go="s${i + 1}">
      <span class="ic">${svg(s.icon)}</span>
      <span class="txt"><span class="t0">Allenamento ${i + 1}${s.optional ? '<span class="opt">facoltativo</span>' : ""}${isNext ? '<span class="next">Prossimo</span>' : ""}</span>
        <span class="t1">${esc(s.title)}</span><span class="t2">${esc(s.summary)}</span></span>
      <span class="st" aria-label="${d ? "Completato" : "Da fare"}">${d ? svg("check", 3) : ""}</span>
    </button>`;
  }).join("");
  const st = charts.computeStats(weeks, store.allDone());
  const name = displayName().split(/\s+/)[0];
  return `
    <header class="hero"><p class="kicker">${name ? `Ciao ${esc(name)} · ` : ""}${esc(w.program)}</p><h1>Settimana ${w.number}</h1></header>
    ${charts.kpiHTML(st)}
    ${charts.activityHTML(st, w.number)}
    <h2 class="section-title">Allenamenti<span class="count">${reqDone}/${req}</span></h2>${rows}
    <section class="card glass notes" aria-label="Note del coach" style="margin-top:14px">
      <div class="card-head"><div class="coach-id"><span class="avatar">${svg("whistle", 2)}</span><div><h2>Note del coach</h2><small>Settimana ${w.number}</small></div></div></div>
      ${notes}
    </section>
    <h2 class="section-title">Le tue analisi</h2>
    ${charts.insightsHTML(st, weeks)}
    ${charts.heatmapHTML(st)}
    ${charts.loadHTML(st)}
    ${charts.disciplineHTML(st)}`;
}

/* ---------- Session ---------- */
const zoneClass = z => /%/.test(z) ? "pct" : /Z2\s*[–\-\/]\s*Z?3/i.test(z) ? "z23" : /Z2/i.test(z) ? "z2" : /Z3/i.test(z) ? "z3" : /Z4/i.test(z) ? "z4" : /Z5/i.test(z) ? "z5" : "pct";
// Carichi a percentuale della settimana precedente, per mostrare la progressione.
let PREV_LOAD = null;
function buildPrevLoad(w) {
  const p = prevWeek(w), map = {};
  if (p) p.sessions.forEach(s => s.blocks.forEach(b => (b.lines || []).forEach(l => {
    if (l.z && /%/.test(l.z) && !/BW/.test(l.z)) map[l.t.toLowerCase()] = { q: l.q, z: l.z };
  })));
  return p ? { n: p.number, map } : null;
}
function lineHTML(l) {
  const chips = [...(l.z ? [l.z] : []), ...(l.chips || [])];
  let prev = "";
  if (PREV_LOAD && l.z && /%/.test(l.z) && !/BW/.test(l.z)) {
    const o = PREV_LOAD.map[l.t.toLowerCase()];
    // "all'80%", "all'11%" ma "al 75%": l'articolo segue il suono del numero.
    const art = o && /^(8|11)/.test(o.z) ? "all'" : "al ";
    if (o && (o.q !== l.q || o.z !== l.z)) prev = `<div class="prev">Settimana ${PREV_LOAD.n}: ${esc(o.q)} ${art}${esc(o.z)}</div>`;
  }
  return `<div class="line">${l.q ? `<div class="q">${esc(l.q)}</div>` : ""}<div class="body">
    <div class="t">${l.pre ? `<span class="pre">${esc(l.pre)})</span>` : ""}${esc(l.t)}${chips.map(z => `<span class="chip ${zoneClass(z)}">${esc(z)}</span>`).join("")}</div>
    ${l.r ? `<div class="r">${esc(l.r)}</div>` : ""}${l.s ? `<div class="s">${esc(l.s)}</div>` : ""}${prev}</div></div>`;
}
function calcHTML(c, bi, ci) {
  const v = store.getInput(c.key, "");
  return `<div class="calc${c.outs.length === 1 ? " single" : ""}" data-calc="${bi}-${ci}"><div><label for="c-${bi}-${ci}">${esc(c.label)}</label>
    <div class="in"><input id="c-${bi}-${ci}" inputmode="${c.kind === "pace" ? "text" : "decimal"}" placeholder="${c.kind === "pace" ? "4:45" : "—"}" value="${esc(v)}" autocomplete="off" enterkeyhint="done">
    <span class="unit">${c.kind === "pace" ? "min/km" : esc(c.unit)}</span></div></div>
    <div class="outs">${c.outs.map((o, oi) => `<div class="o"><small>${esc(o.label)}</small><b data-out="${oi}" class="empty">—</b></div>`).join("")}</div></div>`;
}
const sumM = L => L.reduce((a, l) => a + (l.m || 0), 0);
const levelOf = keys => { const sel = store.pref("lvl", keys[0]); return keys.includes(sel) ? sel : keys[0]; };
function blockHTML(b, bi) {
  let h = `<section class="card glass"><div class="card-head"><h2>${esc(b.title)}</h2>${b.badge ? `<span class="badge">${esc(b.badge)}</span>` : ""}</div>`;
  if (b.note) h += `<p class="coach-note">${svg("quote")}<span>${esc(b.note)}</span></p>`;
  if (b.ladder) h += `<div class="ladder" aria-label="Ripetizioni ${b.ladder.join(", ")}">${b.ladder.map(n => `<span>${n}</span>`).join("")}</div>`;
  if (b.table) h += `<div class="rt-wrap"><table class="rt"><thead><tr>${b.table.cols.map(c => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead><tbody>${b.table.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  if (b.lines && b.lines.length) h += `<div class="lines">${b.lines.map(lineHTML).join("")}</div>`;
  if (b.levels) {
    const keys = Object.keys(b.levels), cur = levelOf(keys);
    const tot = sumM(b.levels[cur]);
    h += `<div class="seg" role="group" aria-label="Livello" data-block="${bi}"><span class="knob"></span>${keys.map(k => `<button aria-pressed="${k === cur}" data-lvl="${esc(k)}">${esc(k)}</button>`).join("")}</div>
      <div class="lines" id="lvl-lines-${bi}">${b.levels[cur].map(lineHTML).join("")}</div>
      <div class="total" id="lvl-tot-${bi}" ${tot ? "" : "hidden"}><span>Totale</span><b>${tot.toLocaleString("it-IT")} m</b></div>`;
  }
  if (b.loads && b.loads.length) h += `<div class="loads">${b.loads.map(l => `<div class="load"><span class="n">${esc(l.n)}</span><span class="rx"><small>Rx</small>${esc(l.rx)}</span>${l.sc ? `<span class="sc"><small>Scaled</small>${esc(l.sc)}</span>` : ""}</div>`).join("")}</div>`;
  if (b.callout) h += `<div class="callout" style="margin-top:16px;margin-bottom:0">${b.callout}</div>`;
  if (b.calcs) h += b.calcs.map((c, ci) => calcHTML(c, bi, ci)).join("");
  return h + `</section>`;
}
const fmtDay = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" }); };
function doneHTML(i) {
  const s = W().sessions[i], e = store.doneEntry(W().number, s.id);
  const sum = e ? [e.at && fmtDay(e.at), e.dur && `<b>${e.dur} min</b>`, e.rpe && `RPE <b>${e.rpe}</b>`].filter(Boolean).join(" · ") : "";
  return `<button class="done-toggle${e ? " on" : ""}" data-done="${i}" aria-pressed="${!!e}"><span class="box">${svg("check", 3)}</span><span class="lbl">${e ? "Completato" : "Segna come fatto"}</span></button>
    ${e ? `<button class="log-sum" data-log="${i}">${sum || "Aggiungi durata e fatica"} ${svg("pen", 2)}</button>` : ""}`;
}
function sessionView(i) {
  const s = W().sessions[i];
  if (!s) return homeView();
  PREV_LOAD = buildPrevLoad(W());
  return `<header class="hero"><p class="kicker">Allenamento ${i + 1}${s.optional ? ", facoltativo" : ""}</p><h1>${esc(s.title)}</h1>${s.summary ? `<p class="sub">${esc(s.summary)}</p>` : ""}</header>
    ${s.blocks.map(blockHTML).join("")}
    <div class="done-wrap" id="doneWrap">${doneHTML(i)}</div>`;
}

/* ---------- Calculators ---------- */
const parsePace = s => { const m = String(s).trim().match(/^(\d{1,2})\s*[:.,'′ ]\s*(\d{1,2})$/); return m && +m[2] < 60 ? (+m[1]) * 60 + (+m[2]) : null; };
const fmtPace = sec => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}/km`;
function updateCalc(el, c, save) {
  const raw = el.querySelector("input").value;
  if (save) store.setInput(c.key, raw.trim());
  el.querySelectorAll("[data-out]").forEach(o => {
    const out = c.outs[+o.dataset.out]; let txt = null;
    if (c.kind === "pace") { const p = parsePace(raw); if (p && p + out.off > 0) txt = fmtPace(p + out.off); }
    else { const n = parseFloat(String(raw).replace(",", ".")); if (n > 0) {
      const v = n * out.pct / 100, r = c.unit === "W" ? Math.round(v) : Math.round(v * 2) / 2;
      txt = r.toLocaleString("it-IT") + " " + c.unit; } }
    o.textContent = txt || "—"; o.classList.toggle("empty", !txt);
  });
}

/* ---------- Bindings ---------- */
function placeKnob(seg) { const on = seg.querySelector('[aria-pressed="true"]'), k = seg.querySelector(".knob"); if (on) { k.style.width = on.offsetWidth + "px"; k.style.transform = `translateX(${on.offsetLeft}px)`; } }
function bindDone(id, i) {
  const wrap = $("doneWrap");
  wrap.querySelector("[data-done]").addEventListener("click", () => {
    const s = W().sessions[i], on = !isDone(i);
    store.setDone(W().number, s.id, on);
    if (on && navigator.vibrate) navigator.vibrate(12);
    wrap.innerHTML = doneHTML(i); bindDone(id, i);
    syncTabs(id);
    if (on) logSheet(i);
  });
  wrap.querySelector("[data-log]")?.addEventListener("click", () => logSheet(i));
}
function bind(id) {
  app.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));
  if (id === "home") { charts.bindCharts(app); return; }
  const i = +id.slice(1) - 1, s = W().sessions[i]; if (!s) return;
  bindDone(id, i);
  s.blocks.forEach((b, bi) => {
    (b.calcs || []).forEach((c, ci) => { const el = app.querySelector(`[data-calc="${bi}-${ci}"]`); el.querySelector("input").addEventListener("input", () => updateCalc(el, c, true)); updateCalc(el, c, false); });
    const seg = app.querySelector(`.seg[data-block="${bi}"]`);
    if (seg) {
      placeKnob(seg);
      seg.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
        seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === btn));
        store.setPref("lvl", btn.dataset.lvl);
        const L = b.levels[btn.dataset.lvl], tot = sumM(L), te = app.querySelector(`#lvl-tot-${bi}`);
        app.querySelector(`#lvl-lines-${bi}`).innerHTML = L.map(lineHTML).join("");
        te.hidden = !tot; te.querySelector("b").textContent = tot.toLocaleString("it-IT") + " m";
        placeKnob(seg);
      }));
    }
  });
}

/* ---------- Swipe between tabs ---------- */
let sx = 0, sy = 0, st = 0, swipeOk = false;
app.addEventListener("touchstart", e => {
  const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now();
  swipeOk = !e.target.closest(".rt-wrap, input, textarea, .seg, .chart") && !openSheet;
}, { passive: true });
app.addEventListener("touchend", e => {
  if (!swipeOk) return;
  const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
  if (Math.abs(dx) > 70 && Math.abs(dy) < Math.abs(dx) * 0.5 && Date.now() - st < 600) {
    const idx = TABS.findIndex(x => x.id === current()), n = idx + (dx < 0 ? 1 : -1);
    if (TABS[n]) go(TABS[n].id);
  }
}, { passive: true });

/* ---------- Sheets ---------- */
const backdrop = $("backdrop");
let openSheet = null, lastFocus = null;
function showSheet(id) {
  closeSheet(true);
  const el = $(id); lastFocus = document.activeElement;
  el.inert = false;
  el.classList.add("open"); el.setAttribute("aria-hidden", "false"); backdrop.classList.add("open");
  app.classList.add("locked"); openSheet = el;
  setTimeout(() => el.querySelector("[data-close]").focus({ preventScroll: true }), 50);
}
function closeSheet(silent) {
  if (!openSheet) return;
  const el = openSheet;
  el.classList.remove("open"); el.setAttribute("aria-hidden", "true"); el.inert = true;
  backdrop.classList.remove("open"); app.classList.remove("locked"); openSheet = null;
  el.dispatchEvent(new Event("sheetclose"));
  if (!silent && lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
}
backdrop.addEventListener("click", () => closeSheet());
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
document.querySelectorAll("[data-close]").forEach(b => { b.innerHTML = svg("x", 2.4); b.addEventListener("click", () => closeSheet()); });
// drag-down to close
document.querySelectorAll(".sheet").forEach(sh => {
  let y0 = null;
  sh.querySelector(".sheet-head").addEventListener("touchstart", e => { y0 = e.touches[0].clientY; }, { passive: true });
  sh.querySelector(".sheet-head").addEventListener("touchend", e => { if (y0 !== null && e.changedTouches[0].clientY - y0 > 60) closeSheet(); y0 = null; }, { passive: true });
});

/* ---------- Settimane ---------- */
function switchWeek(n) {
  curNum = n; store.setPref("week", n);
  buildTabs(); syncTop(); closeSheet(true);
  lastIdx = 0; if (location.hash && location.hash !== "#home") location.hash = "home"; else render({ fresh: true });
}
function weeksSheet() {
  const b = $("weeksBody");
  b.innerHTML = weeks.map(w => {
    const req = w.sessions.filter(s => !s.optional).length, d = w.sessions.filter(s => !s.optional && store.isDone(w.number, s.id)).length;
    return `<button class="wrow${w.number === W().number ? " active" : ""}" data-week="${w.number}">
      <span class="wt"><b>Settimana ${w.number}</b><small>${esc(w.program)}, ${w.sessions.length} allenamenti</small></span>
      <span class="mini">${d}/${req}</span>${w.number === W().number ? `<span class="chk">${svg("check", 2.6)}</span>` : ""}</button>`;
  }).join("");
  b.querySelectorAll("[data-week]").forEach(x => x.addEventListener("click", () => switchWeek(+x.dataset.week)));
}
$("weekBtn").addEventListener("click", () => { weeksSheet(); showSheet("sheetWeeks"); });

/* ---------- Durata e fatica della sessione ---------- */
const DURS = [30, 45, 60, 75, 90, 120];
const RPE = ["", "Riposo attivo", "Molto facile", "Facile", "Moderato", "Impegnativo", "Duro", "Molto duro", "Durissimo", "Quasi al massimo", "Massimale"];
function logSheet(i) {
  const s = W().sessions[i], wk = W().number, e = store.doneEntry(wk, s.id) || {};
  let dur = e.dur || null, rpe = e.rpe || null;
  const body = $("logBody");
  body.innerHTML = `<p class="help">${esc(s.title)} · settimana ${wk}. Facoltativo, ma serve per i grafici di carico e fatica.</p>
    <div class="log-field"><span class="lbl">Durata</span>
      <div class="chips-row" id="durChips">${DURS.map(m => `<button type="button" data-m="${m}" aria-pressed="${dur === m}">${m}′</button>`).join("")}</div>
      <div class="log-inline"><input id="logDur" inputmode="numeric" placeholder="altro" value="${dur && !DURS.includes(dur) ? dur : ""}" aria-label="Durata in minuti, altro valore"><span>min</span>
        <input type="date" id="logDate" value="${esc(e.at || store.today())}" max="${store.today()}" aria-label="Giorno dell'allenamento" style="margin-left:auto"></div></div>
    <div class="log-field"><span class="lbl">Fatica percepita (RPE)</span>
      <div class="rpe-grid" id="rpeGrid">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button type="button" data-r="${n}" aria-pressed="${rpe === n}" aria-label="RPE ${n}, ${RPE[n]}">${n}</button>`).join("")}</div>
      <p class="rpe-desc" id="rpeDesc">${rpe ? RPE[rpe] : "1 = facilissimo · 10 = massimale"}</p></div>
    <div class="row-btns"><button class="btn btn-ghost" data-skip>Salta</button><button class="btn btn-primary" data-save>Salva</button></div>`;
  const durIn = $("logDur");
  const syncDur = () => body.querySelectorAll("[data-m]").forEach(b => b.setAttribute("aria-pressed", +b.dataset.m === dur));
  body.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => { dur = dur === +b.dataset.m ? null : +b.dataset.m; durIn.value = ""; syncDur(); }));
  durIn.addEventListener("input", () => { const n = parseInt(durIn.value, 10); dur = n > 0 && n < 1000 ? n : null; syncDur(); });
  body.querySelectorAll("[data-r]").forEach(b => b.addEventListener("click", () => {
    rpe = rpe === +b.dataset.r ? null : +b.dataset.r;
    body.querySelectorAll("[data-r]").forEach(x => x.setAttribute("aria-pressed", +x.dataset.r === rpe));
    $("rpeDesc").textContent = rpe ? RPE[rpe] : "1 = facilissimo · 10 = massimale";
  }));
  body.querySelector("[data-skip]").addEventListener("click", () => closeSheet());
  body.querySelector("[data-save]").addEventListener("click", () => {
    const at = $("logDate").value || store.today();
    store.updateLog(wk, s.id, { at, dur: dur || undefined, rpe: rpe || undefined });
    closeSheet();
    if (current() === "s" + (i + 1)) { $("doneWrap").innerHTML = doneHTML(i); bindDone(current(), i); }
    toast("Allenamento registrato");
  });
  showSheet("sheetLog");
}

/* ---------- Profilo ---------- */
const STATUS_TXT = { synced: "Dati salvati nel tuo account", saving: "Salvataggio in corso…", offline: "Offline: salverò appena torni online", error: "Errore di sincronizzazione, riprovo a breve", idle: "" };
function profileSheet() {
  const u = api.currentUser() || {}, st = charts.computeStats(weeks, store.allDone()), s = store.getStatus();
  const b = $("profileBody");
  b.innerHTML = `<div class="prof-head"><span class="ini">${esc(initials())}</span><div><b>${esc(displayName() || "Atleta")}</b><small>${esc(u.email || "")}</small></div></div>
    <p class="sync-line ${s}" id="syncLine"><i></i><span>${STATUS_TXT[s] || ""}</span></p>
    <div class="prof-stats"><div><small>Sessioni</small><b>${st.total}</b></div><div><small>Aderenza</small><b>${st.adherence === null ? "—" : Math.round(st.adherence * 100) + "%"}</b></div><div><small>Serie</small><b>${st.streak}</b></div></div>
    <div class="menu">
      <details id="nameBox"><summary>${svg("user")}<span>Nome</span></summary><form class="sub-form" id="nameForm">
        <label class="field"><span>Come ti chiami?</span><input id="nameIn" autocomplete="name" maxlength="40" value="${esc(displayName())}"></label>
        <button class="btn btn-primary btn-block">Salva nome</button></form></details>
      <details id="pwBox"><summary>${svg("lock")}<span>Cambia password</span></summary><form class="sub-form" id="pwForm">
        <label class="field pw"><span>Nuova password</span><span class="inp"><input id="pwNew" type="password" autocomplete="new-password" minlength="8" required><button type="button" class="eye" aria-label="Mostra password" aria-pressed="false">${svg("eye")}</button></span></label>
        <p class="err" id="pwErr" hidden></p>
        <button class="btn btn-primary btn-block">Aggiorna password</button></form></details>
      <button id="exportBtn">${svg("down")}<span>Esporta i miei dati</span></button>
      <button id="diagBtn">${svg("phone")}<span>Diagnostica schermo</span></button>
    </div>
    <div class="menu"><button class="danger" id="logoutBtn">${svg("out")}<span>Esci</span></button></div>
    <p class="version">Hybrid ProGram ${VERSION} · programmazione aggiornata al ${esc(weeks[0]?.publishedAt || "")}</p>`;
  bindEyes(b);
  $("nameForm").addEventListener("submit", e => {
    e.preventDefault();
    const n = $("nameIn").value.trim().slice(0, 40);
    store.setProfile("name", n); api.updateName(n).catch(() => {});
    syncProfileBtn(); profileSheet(); toast("Nome aggiornato");
    if (current() === "home") render({ keep: true });
  });
  $("pwForm").addEventListener("submit", async e => {
    e.preventDefault();
    const pw = $("pwNew").value, err = $("pwErr");
    if (pw.length < 8) { err.textContent = "Usa almeno 8 caratteri."; err.hidden = false; return; }
    const btn = e.target.querySelector(".btn-primary"); btn.disabled = true;
    try { await api.updatePassword(pw); $("pwBox").open = false; $("pwNew").value = ""; err.hidden = true; toast("Password aggiornata"); }
    catch (x) { err.textContent = x.message; err.hidden = false; }
    finally { btn.disabled = false; }
  });
  $("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ email: u.email, exportedAt: new Date().toISOString(), data: store.exportData() }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `hybrid-program-${store.today()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("diagBtn").addEventListener("click", () => { closeSheet(true); showDiag(); });
  $("logoutBtn").addEventListener("click", async () => {
    await store.flush().catch(() => {});
    closeSheet(true); store.close(); await api.signOut();
    showAuth("login", { notice: "Sei uscito dal tuo account." });
  });
}
$("profileBtn").addEventListener("click", () => { profileSheet(); showSheet("sheetProfile"); });
store.onStatus(s => {
  syncProfileBtn();
  const line = $("syncLine");
  if (line) { line.className = "sync-line " + s; line.querySelector("span").textContent = STATUS_TXT[s] || ""; }
});

/* ---------- Accesso, registrazione, recupero password ---------- */
const authEl = $("auth");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function bindEyes(scope) {
  scope.querySelectorAll(".eye").forEach(b => b.addEventListener("click", () => {
    const inp = b.parentElement.querySelector("input"), on = inp.type === "password";
    inp.type = on ? "text" : "password"; b.setAttribute("aria-pressed", on); b.setAttribute("aria-label", on ? "Nascondi password" : "Mostra password");
  }));
}
const brand = `<div class="brand"><img src="icon-192.png" alt=""><div><b>Hybrid ProGram</b><small>La tua programmazione, i tuoi progressi</small></div></div>`;
const pwField = (id, label, auto, hint) => `<label class="field pw"><span>${label}</span><span class="inp"><input id="${id}" type="password" autocomplete="${auto}" required minlength="${auto === "new-password" ? 8 : 1}"><button type="button" class="eye" aria-label="Mostra password" aria-pressed="false">${svg("eye")}</button></span>${hint ? `<p class="hint">${hint}</p>` : ""}</label>`;
const emailField = v => `<label class="field"><span>Email</span><input id="aEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" required value="${esc(v || "")}"></label>`;

function showAuth(mode = "login", opts = {}) {
  root.classList.add("auth-on");
  authEl.hidden = false;
  $("weekBtn").hidden = true; $("profileBtn").hidden = true;
  const email = opts.email || cache.get("hpg-last-email", "");
  const notice = opts.notice ? `<div class="notice${opts.bad ? " bad" : opts.good ? " good" : ""}">${esc(opts.notice)}</div>` : "";
  const setup = !api.configured() ? `<div class="notice bad">Servizio account non ancora configurato: inserisci URL e chiave di Supabase in <b>assets/config.js</b> (vedi docs/SETUP.md).</div>` : "";
  let html = "";
  if (mode === "login") html = `<h1>Accedi</h1><p class="sub">Entra con la tua email per ritrovare progressi e analisi su ogni dispositivo.</p>${setup}${notice}
    <form id="aForm" novalidate>${emailField(email)}${pwField("aPw", "Password", "current-password")}
    <p class="err" id="aErr" hidden></p><button class="btn btn-primary btn-block" type="submit">Accedi</button></form>
    <div class="auth-alt"><button class="link" data-mode="forgot">Password dimenticata?</button></div>
    <p class="auth-switch">Non hai un account? <button class="link" data-mode="signup">Registrati</button></p>`;
  if (mode === "signup") html = `<h1>Crea account</h1><p class="sub">Ti basta un'email. I tuoi allenamenti restano salvati anche quando aggiorniamo app e programmazione.</p>${setup}${notice}
    <form id="aForm" novalidate><label class="field"><span>Nome <small style="color:var(--text-3);font-weight:500">(facoltativo)</small></span><input id="aName" autocomplete="given-name" maxlength="40"></label>
    ${emailField(email)}${pwField("aPw", "Password", "new-password", "Almeno 8 caratteri.")}
    <p class="err" id="aErr" hidden></p><button class="btn btn-primary btn-block" type="submit">Registrati</button></form>
    <p class="auth-switch">Hai già un account? <button class="link" data-mode="login">Accedi</button></p>`;
  if (mode === "forgot") html = `<h1>Recupera password</h1><p class="sub">Inserisci la tua email: ti mandiamo un link per sceglierne una nuova.</p>${setup}${notice}
    <form id="aForm" novalidate>${emailField(email)}<p class="err" id="aErr" hidden></p><button class="btn btn-primary btn-block" type="submit">Invia link</button></form>
    <p class="auth-switch"><button class="link" data-mode="login">Torna all'accesso</button></p>`;
  if (mode === "check") html = `<span class="mail-art">${svg("mail")}</span><h1>Controlla l'email</h1>
    <p class="sub">${opts.reset ? "Se esiste un account per" : "Ti abbiamo inviato un link di conferma a"} <b>${esc(email)}</b>${opts.reset ? ", riceverai un link per impostare una nuova password." : ". Aprilo per attivare l'account, poi torna qui e accedi."}</p>
    <p class="help">Non trovi il messaggio? Guarda nella cartella spam.</p>${notice}
    <p class="err" id="aErr" hidden></p>
    ${opts.reset ? "" : `<button class="btn btn-ghost btn-block" id="resendBtn">Invia di nuovo</button>`}
    <p class="auth-switch"><button class="link" data-mode="login">Vai all'accesso</button></p>`;
  if (mode === "reset") html = `<h1>Nuova password</h1><p class="sub">Scegli la nuova password per ${esc(api.currentUser()?.email || "il tuo account")}.</p>${notice}
    <form id="aForm" novalidate>${pwField("aPw", "Nuova password", "new-password", "Almeno 8 caratteri.")}
    <p class="err" id="aErr" hidden></p><button class="btn btn-primary btn-block" type="submit">Salva e continua</button></form>`;
  authEl.innerHTML = `<div class="auth-inner view">${brand}<div class="card glass">${html}</div></div>`;
  bindEyes(authEl);
  authEl.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => {
    const e = $("aEmail")?.value.trim(); if (e) cache.set("hpg-last-email", e);
    showAuth(b.dataset.mode);
  }));
  const form = $("aForm"), err = $("aErr");
  const fail = (msg, field) => {
    err.textContent = msg; err.hidden = false;
    authEl.querySelectorAll("[aria-invalid]").forEach(x => x.removeAttribute("aria-invalid"));
    if (field) { field.setAttribute("aria-invalid", "true"); field.focus(); }
  };
  $("resendBtn")?.addEventListener("click", async e => {
    const b = e.currentTarget; b.disabled = true;
    try { await api.resendConfirmation(email); toast("Email inviata di nuovo"); }
    catch (x) { fail(x.message); }
    setTimeout(() => { b.disabled = false; }, 30000);
  });
  if (!form) return;
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const emailIn = $("aEmail"), pwIn = $("aPw"), btn = form.querySelector("[type=submit]");
    const em = emailIn ? emailIn.value.trim().toLowerCase() : "", pw = pwIn ? pwIn.value : "";
    err.hidden = true;
    if (emailIn && !EMAIL_RE.test(em)) return fail("Inserisci un indirizzo email valido.", emailIn);
    if (pwIn && !pw) return fail("Inserisci la password.", pwIn);
    if (pwIn && (mode === "signup" || mode === "reset") && pw.length < 8) return fail("La password deve avere almeno 8 caratteri.", pwIn);
    if (em) cache.set("hpg-last-email", em);
    const label = btn.textContent; btn.disabled = true; btn.innerHTML = `<span class="spin"></span>`;
    try {
      if (mode === "login") { await api.signIn(em, pw); return enterApp(); }
      if (mode === "signup") {
        const name = $("aName").value.trim();
        const r = await api.signUp(em, pw, name);
        if (name) cache.set("hpg-pending-name", name);
        return r.needsConfirm ? showAuth("check", { email: em }) : enterApp();
      }
      if (mode === "forgot") { await api.sendPasswordReset(em); return showAuth("check", { email: em, reset: true }); }
      if (mode === "reset") { await api.updatePassword(pw); toast("Password aggiornata"); return enterApp(); }
    } catch (x) {
      if (x.code === "email_not_confirmed") return showAuth("check", { email: em, notice: x.message });
      fail(x.message);
    } finally { if (document.contains(btn)) { btn.disabled = false; btn.textContent = label; } }
  });
  setTimeout(() => (authEl.querySelector("input:not([value]), input[value='']") || authEl.querySelector("input"))?.focus({ preventScroll: true }), 60);
}

/* ---------- Altezza della finestra, tastiera e motion della navbar ---------- */
function isPWA() { return root.classList.contains("pwa"); }
const IOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function fitShell() {
  const vv = window.visualViewport;
  const inner = window.innerHeight, vis = Math.round(vv ? vv.height : inner);
  // La tastiera aperta riduce la finestra: nascondiamo la navbar invece di farla salire.
  const kb = !!vv && inner - vis > 140 && document.activeElement && document.activeElement.matches("input, textarea");
  root.classList.toggle("kb", kb);
  let h = kb ? vis : inner;
  if (IOS && isPWA() && !kb) {
    // App installata su iOS: occupa tutto lo schermo. Se Safari riporta un'altezza un po' più corta
    // (bug noto, vuoto sotto la navbar) usiamo l'altezza reale dello schermo.
    // Non su Android, dove lo schermo include anche la barra di navigazione di sistema.
    const portrait = matchMedia("(orientation: portrait)").matches;
    const sh = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    if (sh > h && sh - h <= 120) h = sh;
  }
  root.style.setProperty("--app-h", h + "px");
  const bar = document.querySelector(".tabwrap");
  if (bar && !kb && bar.offsetHeight) root.style.setProperty("--bar-h", Math.round(bar.offsetHeight) + "px");
}
function probeH(expr) {
  const d = document.createElement("div");
  d.style.cssText = "position:absolute;top:0;left:0;width:1px;visibility:hidden;height:" + expr;
  document.documentElement.appendChild(d);
  const v = d.getBoundingClientRect().height;
  d.remove();
  return Math.round(v * 10) / 10;
}
function diagText() {
  const vv = window.visualViewport;
  const bar = document.querySelector(".tabbar").getBoundingClientRect();
  const body = document.body.getBoundingClientRect();
  return [
    "innerHeight   " + window.innerHeight,
    "screen        " + screen.width + " x " + screen.height,
    "visualVP      " + (vv ? Math.round(vv.height) : "-"),
    "--app-h       " + getComputedStyle(root).getPropertyValue("--app-h"),
    "100lvh        " + probeH("100lvh"),
    "100dvh        " + probeH("100dvh"),
    "100svh        " + probeH("100svh"),
    "env top       " + probeH("env(safe-area-inset-top,0px)"),
    "env bottom    " + probeH("env(safe-area-inset-bottom,0px)"),
    "body altezza  " + Math.round(body.height) + "  top " + Math.round(body.top),
    "navbar fondo  " + Math.round(body.height - bar.bottom),
    "standalone    " + navigator.standalone + " / " + matchMedia("(display-mode: standalone)").matches,
    "dpr           " + window.devicePixelRatio
  ].join("\n");
}
function showDiag() {
  document.querySelector(".diag")?.remove();
  const el = document.createElement("div");
  el.className = "diag";
  el.innerHTML = "<b>Diagnostica schermo</b>" + esc(diagText()) + '<div><button type="button">Chiudi</button></div>';
  el.querySelector("button").addEventListener("click", () => el.remove());
  document.body.appendChild(el);
}

/* La navbar si ritrae scorrendo verso il basso e torna piena scorrendo verso l'alto. */
let navLastY = 0, navAcc = 0, navMin = false, navTick = false;
function navSet(on) { if (on !== navMin) { navMin = on; root.classList.toggle("nav-min", on); } }
function navOnScroll() {
  if (navTick) return;
  navTick = true;
  requestAnimationFrame(() => {
    const y = app.scrollTop, d = y - navLastY;
    navLastY = y;
    // L'accumulatore evita che il momentum di iOS faccia scattare la barra avanti e indietro.
    navAcc = (d > 0) === (navAcc > 0) ? navAcc + d : d;
    if (y < 28) navSet(false);
    else if (navAcc > 14) navSet(true);
    else if (navAcc < -14) navSet(false);
    navTick = false;
  });
}
app.addEventListener("scroll", navOnScroll, { passive: true });
function navReset() { navLastY = 0; navAcc = 0; navMin = false; root.classList.remove("nav-min"); }

if (window.visualViewport) {
  visualViewport.addEventListener("resize", fitShell);
  visualViewport.addEventListener("scroll", fitShell);
}
window.addEventListener("orientationchange", () => setTimeout(fitShell, 250));
document.addEventListener("focusin", e => {
  if (e.target.matches("input, textarea")) setTimeout(() => { fitShell(); e.target.scrollIntoView({ block: "center", behavior: "smooth" }); }, 320);
});
document.addEventListener("focusout", () => setTimeout(fitShell, 120));
fitShell();

/* ---------- Avvio ---------- */
let appStarted = false;
async function enterApp() {
  const u = api.currentUser();
  if (!u) return showAuth("login");
  root.classList.remove("auth-on"); authEl.hidden = true; authEl.innerHTML = "";
  appStarted = true;
  store.close();
  const opened = store.open(u.id);
  const pending = cache.get("hpg-pending-name", "");
  if (pending && !store.profile("name")) store.setProfile("name", pending);
  try { localStorage.removeItem("hpg-pending-name"); } catch (e) {}
  app.innerHTML = `<div class="loading"><span class="spin"></span>Carico la programmazione…</div>`;
  try {
    const { db, offline } = await loadDB();
    weeks = normalizeWeeks(db.weeks); sortWeeks();
    if (!weeks.length) throw new Error("empty");
    await Promise.race([opened, new Promise(r => setTimeout(r, 2500))]);
    if (store.importLegacy(weeks)) toast("Ho importato i progressi salvati su questo dispositivo");
    pickWeek(true);
    buildTabs(); syncTop(); render({ fresh: true });
    if (offline) setTimeout(() => toast("Offline: mostro l'ultima versione salvata"), 400);
  } catch (e) {
    app.innerHTML = `<div class="loading err-box"><p>Non riesco a caricare la programmazione. Controlla la connessione e riprova.</p><button class="btn btn-ghost" id="retry">Riprova</button></div>`;
    $("retry").addEventListener("click", enterApp);
  }
}
// Mostra la settimana scelta, ma passa alla nuova appena il coach la pubblica.
function pickWeek(announce) {
  const latest = weeks[0].number, seen = store.pref("seenLatest", null), saved = store.pref("week", null);
  if (seen !== null && latest > seen) { curNum = latest; if (announce) setTimeout(() => toast(`Nuova programmazione: settimana ${latest}`), 400); }
  else curNum = weeks.some(w => w.number === saved) ? saved : latest;
  if (seen !== latest) store.setPref("seenLatest", latest);
  if (saved !== curNum) store.setPref("week", curNum);
}
// Quando arrivano dati dal server (altro dispositivo) aggiorniamo la vista senza perdere il punto.
let rerenderT;
store.onChange(() => {
  if (!appStarted || !weeks.length || openSheet) return;
  clearTimeout(rerenderT); rerenderT = setTimeout(() => {
    if (document.activeElement?.matches("input, textarea")) return;
    syncTop(); render({ keep: true });
  }, 250);
});
api.onAuthChange(s => {
  // Sessione revocata o scaduta (es. password cambiata altrove): torna all'accesso.
  if (!s && appStarted) { appStarted = false; store.close(); closeSheet(true); showAuth("login", { notice: "La sessione è scaduta: accedi di nuovo." }); }
});

async function boot() {
  const redirect = api.consumeAuthRedirect();
  if (redirect?.error) {
    if (api.currentUser()) { enterApp(); return setTimeout(() => toast(redirect.error), 600); }
    return showAuth("login", { notice: redirect.error, bad: true });
  }
  if (redirect?.tok) {
    try {
      await api.adoptRedirectSession(redirect.tok);
      if (redirect.type === "recovery") return showAuth("reset");
      toast("Email confermata, benvenuto!");
    } catch (e) { return showAuth("login", { notice: "Link non valido o scaduto. Accedi con email e password.", bad: true }); }
  }
  if (!api.currentUser()) return showAuth(cache.get("hpg-last-email", "") ? "login" : "signup");
  enterApp();
}
boot();

window.addEventListener("load", () => { fitShell(); if (TABS.length) syncTabs(current(), false); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { store.flush(); return; }
  if (appStarted && weeks.length) { refreshSilently(); store.pull(); }
});
window.addEventListener("online", () => { if (appStarted) store.flush(); });
window.addEventListener("pagehide", () => store.flush());
async function refreshSilently() {
  try {
    const { db, offline } = await loadDB(); if (offline) return;
    const nw = normalizeWeeks(db.weeks).sort((a, b) => b.number - a.number);
    if (JSON.stringify(nw) === JSON.stringify(weeks)) return;
    const oldLatest = weeks[0].number, here = current();
    weeks = nw;
    const isNew = weeks[0].number > oldLatest;
    if (isNew) { curNum = weeks[0].number; store.setPref("week", curNum); store.setPref("seenLatest", curNum); toast(`Nuova programmazione: settimana ${curNum}`); }
    else if (!weeks.some(w => w.number === curNum)) curNum = weeks[0].number;
    buildTabs(); syncTop();
    // Se l'utente sta guardando un allenamento ancora valido, resta lì.
    if (!isNew && TABS.some(t => t.id === here)) render({ keep: true });
    else { lastIdx = 0; if (location.hash && location.hash !== "#home") location.hash = "home"; else render({ fresh: true }); }
  } catch (e) {}
}
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
