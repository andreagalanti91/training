// Hybrid ProGram — cache offline.
// Pagina e programmazione: prima la rete (aggiornamenti immediati), cache se offline.
const CACHE = "hpg-v8";
const ASSETS = ["./", "index.html", "manifest.webmanifest", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "data/program.json"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET") return;
  const url = new URL(r.url);
  const networkFirst = r.mode === "navigate" || url.pathname.endsWith("/data/program.json");
  if (networkFirst) {
    const key = r.mode === "navigate" ? "index.html" : "data/program.json";
    e.respondWith(fetch(r).then(res => { if (res.ok) { const cl = res.clone(); caches.open(CACHE).then(c => c.put(key, cl)); } return res; })
      .catch(() => caches.match(key)));
    return;
  }
  e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => {
    if (res.ok && (url.origin === self.location.origin || url.hostname.includes("fonts.g"))) { const cl = res.clone(); caches.open(CACHE).then(c => c.put(r, cl)); }
    return res;
  })));
});
