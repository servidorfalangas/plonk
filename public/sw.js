const VERSION = "plonk-v11";
const SHELL = ["/", "/index.html", "/style.css?v=11", "/app.js?v=11", "/manifest.webmanifest", "/icon.svg", "/icon-180.png", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => (k.startsWith("plonk-v") && k !== VERSION) || k === "plonk-api").map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}
async function networkFirst(req, name) {
  const cache = await caches.open(name);
  const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
  // Con mala conexión, a los 3 s se usa la copia guardada (si la hay)
  const timeout = new Promise((r) => setTimeout(r, 3000)).then(() => cache.match(req));
  try {
    const first = await Promise.race([net, timeout]);
    if (first) return first;
    return await net;
  } catch (e) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw e;
  }
}
async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await c.delete(k);
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/pk/") || url.pathname.startsWith("/api/")) return; // la app gestiona su propia caché
  if (url.pathname.startsWith("/pimg/")) {
    return e.respondWith(cacheFirst(e.request, "plonk-img").then((r) => { trim("plonk-img", 600); return r; }));
  }
  e.respondWith(networkFirst(e.request, VERSION));
});
