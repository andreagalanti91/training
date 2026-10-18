/* Stato dell'utente: allenamenti completati, valori dei calcolatori, preferenze, profilo.
   Ogni voce porta il proprio timestamp "t": unendo copia locale e server vince la modifica
   più recente, voce per voce. Così nulla si perde tra dispositivi, offline o aggiornamenti. */
import * as api from "./api.js";

const SECTIONS = ["done", "inputs", "prefs", "profile"];
const empty = () => ({ v: 1, done: {}, inputs: {}, prefs: {}, profile: {} });
const now = () => Date.now();
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

let uid = null, state = empty(), saveTimer = null, saving = null, status = "idle";
const statusListeners = new Set();
const changeListeners = new Set();
const cacheKey = () => `hpg-u-${uid}`;
const dirtyKey = () => `hpg-u-${uid}-dirty`;

function setStatus(s) { if (s !== status) { status = s; statusListeners.forEach(fn => fn(s)); } }
export const getStatus = () => status;
export const onStatus = fn => { statusListeners.add(fn); return () => statusListeners.delete(fn); };
export const onChange = fn => { changeListeners.add(fn); return () => changeListeners.delete(fn); };

export function merge(a, b) {
  const out = empty();
  for (const sec of SECTIONS) {
    const A = (a && a[sec]) || {}, B = (b && b[sec]) || {};
    for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
      const x = A[k], y = B[k];
      out[sec][k] = !x ? y : !y ? x : (y.t || 0) > (x.t || 0) ? y : x;
    }
  }
  return out;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function persistLocal() { ls.set(cacheKey(), state); }
function touch() {
  persistLocal();
  ls.set(dirtyKey(), true);
  changeListeners.forEach(fn => fn({ remote: false }));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 700);
}

export async function flush() {
  clearTimeout(saveTimer);
  if (!uid || !ls.get(dirtyKey(), false)) return;
  if (saving) { await saving.catch(() => {}); return flush(); }
  setStatus("saving");
  const snapshot = JSON.stringify(state);
  saving = api.saveState(state);
  try {
    await saving;
    if (JSON.stringify(state) === snapshot) ls.del(dirtyKey());
    setStatus(ls.get(dirtyKey(), false) ? "saving" : "synced");
    if (ls.get(dirtyKey(), false)) saveTimer = setTimeout(flush, 300);
  } catch (e) {
    setStatus(e.offline ? "offline" : "error");
    if (e.status === 401) return;
    saveTimer = setTimeout(flush, e.offline ? 15000 : 8000);
  } finally { saving = null; }
}

/* Avvio per un utente: parte subito dalla copia locale, poi si allinea al server. */
export async function open(userId) {
  uid = userId;
  state = merge(empty(), ls.get(cacheKey(), null));
  setStatus("saving");
  try {
    const remote = await api.loadState();
    const merged = merge(remote || empty(), state);
    const changedLocally = !same(merged, state);
    state = merged; persistLocal();
    if (!remote || !same(merge(empty(), remote), merged)) ls.set(dirtyKey(), true);
    if (changedLocally) changeListeners.forEach(fn => fn({ remote: true }));
    setStatus("synced");
    await flush();
    return { synced: true };
  } catch (e) {
    setStatus(e.offline ? "offline" : "error");
    return { synced: false, error: e };
  }
}

/* Riallinea dal server (es. quando l'app torna in primo piano) senza perdere modifiche locali. */
export async function pull() {
  if (!uid) return false;
  try {
    const remote = await api.loadState();
    const merged = merge(remote || empty(), state);
    const changed = !same(merged, state);
    state = merged; persistLocal();
    if (!same(merge(empty(), remote), merged)) ls.set(dirtyKey(), true);
    if (changed) changeListeners.forEach(fn => fn({ remote: true }));
    await flush();
    if (status !== "saving") setStatus("synced");
    return changed;
  } catch (e) { setStatus(e.offline ? "offline" : "error"); return false; }
}

export function close() { clearTimeout(saveTimer); uid = null; state = empty(); setStatus("idle"); }
export const exportData = () => JSON.parse(JSON.stringify(state));

/* ---- Allenamenti completati ---- */
const dk = (week, id) => `${week}:${id}`;
export const doneEntry = (week, id) => { const e = state.done[dk(week, id)]; return e && e.on ? e : null; };
export const isDone = (week, id) => !!doneEntry(week, id);
export function setDone(week, id, on, extra = {}) {
  const prev = state.done[dk(week, id)] || {};
  state.done[dk(week, id)] = on
    ? { ...prev, ...extra, on: true, at: extra.at || (prev.on && prev.at) || today(), t: now() }
    : { on: false, t: now() };
  touch();
}
export function updateLog(week, id, extra) {
  const e = state.done[dk(week, id)];
  if (!e || !e.on) return;
  state.done[dk(week, id)] = { ...e, ...extra, t: now() };
  touch();
}
export function allDone() {
  return Object.entries(state.done).filter(([, e]) => e && e.on).map(([k, e]) => {
    const i = k.indexOf(":");
    return { week: +k.slice(0, i), id: k.slice(i + 1), ...e };
  });
}

/* ---- Valori inseriti nei calcolatori (passo 10 km, FTP, massimali…) ---- */
export const getInput = (key, d = "") => state.inputs[key]?.v ?? d;
export function setInput(key, v) {
  if ((state.inputs[key]?.v ?? "") === v) return;
  state.inputs[key] = { v, t: now() };
  touch();
}

/* ---- Preferenze e profilo ---- */
export const pref = (k, d = null) => state.prefs[k]?.v ?? d;
export function setPref(k, v) {
  if (same(state.prefs[k]?.v, v)) return;
  state.prefs[k] = { v, t: now() };
  touch();
}
export const profile = (k, d = "") => state.profile[k]?.v ?? d;
export function setProfile(k, v) { state.profile[k] = { v, t: now() }; touch(); }

export function today(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ---- Import dei progressi salvati dalla vecchia versione (solo su questo dispositivo) ---- */
export function importLegacy(weeks) {
  // Una sola volta per dispositivo: i dati della vecchia versione appartengono al primo account che accede.
  if (!uid || ls.get("hpg-legacy-imported", false)) return 0;
  let n = 0;
  const old = { t: 1 }; // timestamp minimo: qualsiasi dato già presente sul server ha la precedenza
  weeks.forEach(w => {
    const idx = ls.get(`hpg-w${w.number}-done`, null);
    if (!Array.isArray(idx)) return;
    idx.forEach(i => {
      const s = w.sessions[i], k = s && dk(w.number, s.id);
      if (s && !state.done[k]) { state.done[k] = { on: true, at: w.publishedAt || today(), legacy: true, ...old }; n++; }
    });
  });
  const keys = new Set();
  weeks.forEach(w => w.sessions.forEach(s => s.blocks.forEach(b => (b.calcs || []).forEach(c => keys.add(c.key)))));
  keys.forEach(k => {
    const v = ls.get(`hpg-${k}`, null);
    if (typeof v === "string" && v && !state.inputs[k]) { state.inputs[k] = { v, ...old }; n++; }
  });
  const lvl = ls.get("hpg-lvl", null);
  if (lvl && !state.prefs.lvl) { state.prefs.lvl = { v: lvl, ...old }; n++; }
  ls.set("hpg-legacy-imported", true);
  if (n) { persistLocal(); ls.set(dirtyKey(), true); clearTimeout(saveTimer); saveTimer = setTimeout(flush, 700); }
  return n;
}
