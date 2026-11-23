// Hybrid ProGram — conversione della programmazione con Google Gemini (piano gratuito).
// Solo gli account in public.coaches possono usarla. La chiave GEMINI_API_KEY è un secret di Supabase.
// Richiesta: { system: string, user: string }  →  Risposta: { json } oppure { error }
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function isCoach(auth: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const r = await fetch(`${url}/rest/v1/rpc/is_coach`, {
    method: "POST",
    headers: { apikey: key, Authorization: auth, "Content-Type": "application/json" },
    body: "{}",
  });
  return r.ok && (await r.json()) === true;
}

// Toglie eventuali ``` intorno al JSON.
const parse = (t: string) => JSON.parse(t.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { message: "Metodo non consentito." });
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ") || !(await isCoach(auth))) return reply(403, { message: "Questo account non è abilitato come coach." });

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return reply(424, { message: "Manca la chiave Gemini: aggiungi il secret GEMINI_API_KEY su Supabase." });
  let body: { system?: string; user?: string };
  try { body = await req.json(); } catch { return reply(400, { message: "Richiesta non valida." }); }
  const system = String(body.system || ""), user = String(body.user || "");
  if (!user.trim() || user.length > 200_000 || system.length > 60_000) return reply(400, { message: "Testo mancante o troppo lungo." });

  const model = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 140_000);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      signal: ctl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 60000 },
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 429) return reply(429, { message: "Limite gratuito di Gemini raggiunto per ora: riprova tra qualche minuto." });
    if (!r.ok) return reply(424, { message: `Gemini ha risposto con un errore (${r.status}): ${d?.error?.message || "sconosciuto"}` });
    const cand = d?.candidates?.[0];
    const text = (cand?.content?.parts || []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text || "").join("");
    if (!text) return reply(424, { message: `Risposta vuota da Gemini (${cand?.finishReason || d?.promptFeedback?.blockReason || "motivo sconosciuto"}).` });
    try { return reply(200, { json: parse(text), model, finish: cand?.finishReason }); }
    catch { return reply(422, { message: cand?.finishReason === "MAX_TOKENS" ? "Risposta troncata: il testo è troppo lungo per una sola conversione." : "L'IA non ha restituito un JSON valido. Riprova." }); }
  } catch (e) {
    return reply(424, { message: (e as Error).name === "AbortError" ? "Gemini non ha risposto in tempo. Riprova." : "Gemini non raggiungibile." });
  } finally { clearTimeout(timer); }
});
