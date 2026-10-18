// Hybrid ProGram — cache offline.
// App e programmazione: prima la rete (aggiornamenti immediati), cache solo se offline.
// I dati dell'utente (Supabase) non passano mai dalla cache.
const CACHE = "hpg-v24";
const ASSETS = ["./", "index.html", "assets/app.css?v=24", "assets/config.js?v=24", "assets/app.js?v=24", "assets/api.js", "assets/store.js", "assets/charts.js",
  "manifest.webmanifest", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "data/program.json"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET") return;
  const url = new URL(r.url);
  if (url.origin === self.location.origin) {
    // La programmazione si chiede con ?t=… per saltare la cache HTTP: in cache la teniamo senza query.
    const key = r.mode === "navigate" ? "index.html" : url.pathname.endsWith("/data/program.json") ? "data/program.json" : r;
    e.respondWith(fetch(r).then(res => {
      if (res.ok) { const cl = res.clone(); caches.open(CACHE).then(c => c.put(key, cl)); }
      return res;
    }).catch(() => caches.match(key, { ignoreSearch: key !== r }).then(m => m || caches.match(r, { ignoreSearch: true }))));
    return;
  }
  if (url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { const cl = res.clone(); caches.open(CACHE).then(c => c.put(r, cl)); return res; })));
  }
});
