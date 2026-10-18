/* Client minimo per Supabase (Auth + tabella user_state) via REST: nessuna dipendenza esterna.
   La sessione resta nel dispositivo; i dati dell'utente vivono sul server, separati dall'app
   e dalla programmazione, quindi gli aggiornamenti non li toccano. */
const CFG = window.HPG_CONFIG || {};
const BASE = String(CFG.supabaseUrl || "").replace(/\/+$/, "");
const KEY = CFG.supabaseAnonKey || "";
const SESSION_KEY = "hpg-auth";

export const configured = () => !!(BASE && KEY);

export class ApiError extends Error {
  constructor(message, { status = 0, code = "", offline = false } = {}) {
    super(message); this.status = status; this.code = code; this.offline = offline;
  }
}

let session = null;
try { session = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { session = null; }
const listeners = new Set();
function saveSession(s) {
  session = s;
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch (e) {}
  listeners.forEach(fn => fn(session));
}
export const onAuthChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const currentUser = () => session?.user || null;

function fromTokenResponse(d) {
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
    user: d.user
  };
}

/* Messaggi in italiano per gli errori più comuni di Supabase Auth. */
function translate(status, body) {
  const code = body?.error_code || body?.code || body?.error || "";
  const msg = String(body?.msg || body?.message || body?.error_description || "");
  const m = msg.toLowerCase();
  if (code === "invalid_credentials" || m.includes("invalid login credentials")) return "Email o password non corretti.";
  if (code === "email_not_confirmed" || m.includes("email not confirmed")) return "Devi ancora confermare l'email: apri il link che ti abbiamo inviato.";
  if (code === "user_already_exists" || m.includes("already registered")) return "Esiste già un account con questa email. Prova ad accedere.";
  if (code === "weak_password" || m.includes("password should")) return "Password troppo debole: usa almeno 8 caratteri.";
  if (code === "same_password") return "La nuova password deve essere diversa da quella attuale.";
  if (code === "email_address_invalid" || m.includes("invalid format") || m.includes("is invalid")) return "Indirizzo email non valido.";
  if (code === "signup_disabled") return "Le registrazioni sono chiuse al momento.";
  if (status === 429 || code === "over_email_send_rate_limit" || code === "over_request_rate_limit") return "Troppi tentativi ravvicinati. Riprova tra qualche minuto.";
  if (status >= 500) return "Il server non risponde correttamente. Riprova tra poco.";
  return msg || "Qualcosa è andato storto. Riprova.";
}

async function request(path, { method = "GET", body, token, headers = {} } = {}) {
  if (!configured()) throw new ApiError("Servizio account non configurato.", { code: "not_configured" });
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      // Le chiavi "publishable" nuove non sono JWT: l'header Authorization va solo con il token utente.
      headers: { apikey: KEY, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (e) {
    throw new ApiError("Sei offline o il server non è raggiungibile.", { offline: true });
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) throw new ApiError(translate(res.status, data), { status: res.status, code: data?.error_code || data?.code || "" });
  return data;
}

const redirectTo = () => encodeURIComponent(location.origin + location.pathname);

export async function signUp(email, password, name) {
  const d = await request(`/auth/v1/signup?redirect_to=${redirectTo()}`, { method: "POST", body: { email, password, data: name ? { name } : {} } });
  // Con la conferma email attiva Supabase non restituisce una sessione: l'utente deve aprire il link.
  if (d?.access_token) { saveSession(fromTokenResponse(d)); return { needsConfirm: false }; }
  return { needsConfirm: true };
}

export async function signIn(email, password) {
  const d = await request("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  saveSession(fromTokenResponse(d));
  return session.user;
}

export const resendConfirmation = email =>
  request(`/auth/v1/resend?redirect_to=${redirectTo()}`, { method: "POST", body: { type: "signup", email } });

export const sendPasswordReset = email =>
  request(`/auth/v1/recover?redirect_to=${redirectTo()}`, { method: "POST", body: { email } });

let refreshing = null;
async function refresh() {
  if (!session?.refresh_token) throw new ApiError("Sessione scaduta.", { status: 401 });
  // Un solo rinnovo alla volta: Supabase ruota il refresh token a ogni uso.
  refreshing ||= request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: session.refresh_token } })
    .then(d => { saveSession(fromTokenResponse(d)); return session; })
    .catch(e => { if (e.status === 400 || e.status === 401 || e.status === 403) saveSession(null); throw e; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

async function authed(path, opts = {}) {
  if (!session) throw new ApiError("Non hai effettuato l'accesso.", { status: 401 });
  if (session.expires_at - 60 < Date.now() / 1000) await refresh();
  try { return await request(path, { ...opts, token: session.access_token }); }
  catch (e) {
    if (e.status !== 401) throw e;
    await refresh();
    return request(path, { ...opts, token: session.access_token });
  }
}

export async function signOut() {
  const s = session;
  saveSession(null);
  if (s) request("/auth/v1/logout", { method: "POST", token: s.access_token }).catch(() => {});
}

export async function updatePassword(password) {
  const u = await authed("/auth/v1/user", { method: "PUT", body: { password } });
  if (u?.id) saveSession({ ...session, user: u });
}

export async function updateName(name) {
  const u = await authed("/auth/v1/user", { method: "PUT", body: { data: { name } } });
  if (u?.id) saveSession({ ...session, user: u });
}

/* Rientro dai link email (conferma account, reset password): Supabase mette i token nell'hash. */
export function consumeAuthRedirect() {
  const h = location.hash.slice(1);
  if (!/(^|&)(access_token|error_description|error)=/.test(h)) return null;
  const p = new URLSearchParams(h);
  history.replaceState(null, "", location.pathname + location.search);
  if (p.get("error") || p.get("error_description")) {
    const expired = p.get("error_code") === "otp_expired";
    return { error: expired ? "Il link è scaduto o è già stato usato. Richiedine uno nuovo." : (p.get("error_description") || "Link non valido.").replace(/\+/g, " ") };
  }
  const tok = {
    access_token: p.get("access_token"),
    refresh_token: p.get("refresh_token"),
    expires_at: +p.get("expires_at") || Math.floor(Date.now() / 1000) + (+p.get("expires_in") || 3600)
  };
  return { type: p.get("type") || "magiclink", tok };
}

export async function adoptRedirectSession(tok) {
  const user = await request("/auth/v1/user", { token: tok.access_token });
  saveSession({ ...tok, user });
  return user;
}

/* ---- Dati utente: una riga per utente in public.user_state (protetta da RLS) ---- */
export async function loadState() {
  const uid = session?.user?.id;
  const rows = await authed(`/rest/v1/user_state?user_id=eq.${uid}&select=state,updated_at`);
  return rows && rows[0] ? rows[0].state : null;
}

export async function saveState(state) {
  const uid = session?.user?.id;
  await authed("/rest/v1/user_state?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: { user_id: uid, state, updated_at: new Date().toISOString() }
  });
}
