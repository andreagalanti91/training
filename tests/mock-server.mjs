// Server di test: serve l'app e simula le API di Supabase (Auth + tabella user_state).
// Uso: node tests/mock-server.mjs [porta]   — CONFIRM=1 per richiedere la conferma email.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +(process.argv[2] || 8787);
const CONFIRM = process.env.CONFIRM === "1";
const MAX_WEEK = +(process.env.PROGRAM_MAX_WEEK || 0);
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };

const users = new Map();   // email -> { id, email, password, confirmed, user_metadata }
const tokens = new Map();  // access -> userId
const refresh = new Map(); // refresh -> userId
const states = new Map();  // userId -> { state, updated_at }
const scores = [];        // righe di public.scores
const coaches = new Set(); // user_id dei coach
const program = new Map(); // number -> riga di public.program_weeks
const history = [];        // public.program_history
export const db = { users, states };

const userJSON = u => ({ id: u.id, email: u.email, user_metadata: u.user_metadata, email_confirmed_at: u.confirmed ? new Date().toISOString() : null, identities: [{ provider: "email" }] });
function issue(u) {
  const a = "at_" + randomUUID(), r = "rt_" + randomUUID();
  tokens.set(a, u.id); refresh.set(r, u.id);
  return { access_token: a, refresh_token: r, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user: userJSON(u) };
}
const byId = id => [...users.values()].find(u => u.id === id);
const send = (res, code, body, headers = {}) => { res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...headers }); res.end(body === undefined ? "" : JSON.stringify(body)); };
const authUser = req => { const t = (req.headers.authorization || "").replace("Bearer ", ""); return byId(tokens.get(t)); };
const body = req => new Promise(r => { let d = ""; req.on("data", c => d += c); req.on("end", () => { try { r(d ? JSON.parse(d) : {}); } catch (e) { r({}); } }); });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`), p = url.pathname;
  if (req.method === "OPTIONS") return send(res, 204, undefined, { "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE" });

  if (p === "/auth/v1/signup") {
    const b = await body(req);
    if (!b.email || !b.password) return send(res, 400, { error_code: "validation_failed", msg: "missing" });
    if (b.password.length < 8) return send(res, 422, { error_code: "weak_password", msg: "Password should be at least 8 characters." });
    // Come Supabase: con la conferma email attiva un'email già registrata non dà errore ma un utente senza identità.
    if (users.has(b.email)) return CONFIRM && users.get(b.email).confirmed
      ? send(res, 200, { ...userJSON(users.get(b.email)), id: randomUUID(), identities: [] })
      : send(res, 422, { error_code: "user_already_exists", msg: "User already registered" });
    const u = { id: randomUUID(), email: b.email, password: b.password, confirmed: !CONFIRM, user_metadata: b.data || {} };
    users.set(b.email, u);
    return send(res, 200, CONFIRM ? userJSON(u) : issue(u));
  }
  if (p === "/auth/v1/token") {
    const b = await body(req), g = url.searchParams.get("grant_type");
    if (g === "password") {
      const u = users.get(b.email);
      if (!u || u.password !== b.password) return send(res, 400, { error_code: "invalid_credentials", msg: "Invalid login credentials" });
      if (!u.confirmed) return send(res, 400, { error_code: "email_not_confirmed", msg: "Email not confirmed" });
      return send(res, 200, issue(u));
    }
    if (g === "refresh_token") {
      const id = refresh.get(b.refresh_token);
      if (!id) return send(res, 400, { error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
      refresh.delete(b.refresh_token);
      return send(res, 200, issue(byId(id)));
    }
  }
  if (p === "/auth/v1/user") {
    const u = authUser(req); if (!u) return send(res, 401, { msg: "invalid JWT" });
    if (req.method === "PUT") { const b = await body(req); if (b.password) u.password = b.password; if (b.data) u.user_metadata = { ...u.user_metadata, ...b.data }; }
    return send(res, 200, userJSON(u));
  }
  if (p === "/auth/v1/logout") { tokens.delete((req.headers.authorization || "").replace("Bearer ", "")); return send(res, 204); }
  if (p === "/auth/v1/recover" || p === "/auth/v1/resend") return send(res, 200, {});
  if (p === "/rest/v1/user_state") {
    const u = authUser(req); if (!u) return send(res, 401, { message: "JWT expired" });
    if (req.method === "GET") { const s = states.get(u.id); return send(res, 200, s ? [s] : []); }
    const b = await body(req);
    if (b.user_id !== u.id) return send(res, 403, { message: "new row violates row-level security policy" });
    states.set(u.id, { state: b.state, updated_at: b.updated_at });
    return send(res, 201);
  }
  if (p === "/rest/v1/scores") {
    const u = authUser(req); if (!u) return send(res, 401, { message: "JWT expired" });
    // Filtri PostgREST "col=eq.valore" e ordinamento "order=value.asc|desc".
    const filt = r => [...url.searchParams].every(([k, v]) => ["select", "order", "limit", "on_conflict"].includes(k) || !v.startsWith("eq.") || String(r[k]) === decodeURIComponent(v.slice(3)));
    if (req.method === "GET") {
      const dir = /value\.desc/.test(url.searchParams.get("order") || "") ? -1 : 1;
      return send(res, 200, scores.filter(filt).sort((x, y) => dir * (x.value - y.value)));
    }
    if (req.method === "POST") {
      const b = await body(req);
      if (b.user_id !== u.id) return send(res, 403, { message: "new row violates row-level security policy" });
      const i = scores.findIndex(r => r.user_id === b.user_id && r.week === b.week && r.session_id === b.session_id && r.block === b.block);
      if (i >= 0) scores[i] = b; else scores.push(b);
      return send(res, 201);
    }
    const own = r => r.user_id === u.id && filt(r);
    if (req.method === "DELETE") { for (let i = scores.length - 1; i >= 0; i--) if (own(scores[i])) scores.splice(i, 1); return send(res, 204); }
    if (req.method === "PATCH") { const b = await body(req); scores.filter(own).forEach(r => Object.assign(r, b)); return send(res, 204); }
  }
  // Programmazione gestita dal coach (public.coaches, public.program_weeks, funzione program-ai).
  if (p === "/rest/v1/rpc/is_coach") { const u = authUser(req); if (!u) return send(res, 401, { message: "JWT expired" }); return send(res, 200, coaches.has(u.id)); }
  if (p === "/rest/v1/program_weeks") {
    const u = authUser(req); if (!u) return send(res, 401, { message: "JWT expired" });
    const coach = coaches.has(u.id), now = new Date();
    const visible = r => coach || (r.status === "published" && (!r.publish_at || new Date(r.publish_at) <= now));
    const eq = (k, r) => { const v = url.searchParams.get(k); return !v || !v.startsWith("eq.") || String(r[k]) === v.slice(3); };
    const match = r => visible(r) && eq("number", r) && eq("status", r);
    if (req.method === "GET") return send(res, 200, [...program.values()].filter(match).sort((a, b) => b.number - a.number));
    if (!coach) return send(res, 403, { message: "new row violates row-level security policy" });
    if (req.method === "POST") {
      const b = await body(req), old = program.get(b.number);
      if (old) history.push({ id: history.length + 1, ...old, saved_at: new Date().toISOString() });
      const row = { number: b.number, data: b.data, status: b.status || "draft", publish_at: b.publish_at || null, source_text: b.source_text || "", updated_at: new Date().toISOString() };
      program.set(b.number, row);
      return send(res, 201, [row]);
    }
    if (req.method === "DELETE") { const gone = [...program.values()].filter(r => match(r) && r.status === "draft"); gone.forEach(r => program.delete(r.number)); return send(res, 200, gone); }
  }
  if (p === "/rest/v1/program_history") {
    const u = authUser(req); if (!u || !coaches.has(u.id)) return send(res, 200, []);
    const n = +(url.searchParams.get("number") || "").replace("eq.", "");
    return send(res, 200, history.filter(h => h.number === n).reverse());
  }
  if (p === "/functions/v1/program-ai") {
    const u = authUser(req); if (!u || !coaches.has(u.id)) return send(res, 403, { message: "Questo account non è abilitato come coach." });
    const b = await body(req);
    if (/verificatore/.test(b.system)) return send(res, 200, { json: { discrepanze: ["Esempio: nel testo il recupero è 2′, nella settimana 1′30″."] } });
    const fixAsk = /Correzione richiesta dal coach: (.*)/.exec(b.user);
    if (fixAsk) {
      const w = JSON.parse(/Settimana attuale in JSON[^\n]*\n(.*)/.exec(b.user)[1]);
      w.sessions[0].summary = fixAsk[1];
      return send(res, 200, { json: { week: w, dubbi: [] } });
    }
    // IA finta: restituisce la settimana 22 con il numero richiesto.
    const w = JSON.parse(await readFile(join(ROOT, "data", "weeks", "22.json"), "utf8"));
    w.number = +/Settimana numero: (\d+)/.exec(b.user)[1];
    return send(res, 200, { json: { week: w, dubbi: ["Esempio di dubbio: il testo cita un “day 4” che non esiste."] } });
  }
  if (p === "/__mock/coach") { const u = users.get(url.searchParams.get("email")); if (u) coaches.add(u.id); return send(res, 200, { ok: !!u }); }

  // Helper di test: link di conferma / reset come quelli inviati da Supabase.
  if (p === "/__mock/link") {
    const u = users.get(url.searchParams.get("email")); if (!u) return send(res, 404, {});
    u.confirmed = true;
    const t = issue(u), type = url.searchParams.get("type") || "signup";
    return send(res, 200, { url: `/#access_token=${t.access_token}&expires_at=${t.expires_at}&expires_in=3600&refresh_token=${t.refresh_token}&token_type=bearer&type=${type}` });
  }
  if (p === "/__mock/state") { const u = users.get(url.searchParams.get("email")); return send(res, 200, u ? states.get(u.id) || null : null); }
  if (p === "/__mock/revoke") { tokens.clear(); return send(res, 200, {}); }

  if (p === "/assets/config.js") {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    return res.end(`window.HPG_CONFIG={supabaseUrl:${JSON.stringify(`http://${req.headers.host}`)},supabaseAnonKey:"anon-test"};`);
  }
  try {
    const f = join(ROOT, p === "/" ? "index.html" : decodeURIComponent(p));
    if (!f.startsWith(ROOT)) throw 0;
    let data = await readFile(f);
    // I test usano una programmazione fissa: le settimane successive a MAX_WEEK vengono nascoste.
    if (MAX_WEEK && p.endsWith("/data/program.json")) {
      const j = JSON.parse(data); j.weeks = j.weeks.filter(w => w.number <= MAX_WEEK); data = JSON.stringify(j);
    }
    res.writeHead(200, { "Content-Type": TYPES[extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end("not found"); }
});
server.listen(PORT, () => console.log(`mock su http://localhost:${PORT}${CONFIRM ? " (conferma email attiva)" : ""}`));
