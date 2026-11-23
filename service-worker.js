/* Offline-Speicher nur für die Hülle (Anmeldung, Aussehen, Schrift).
   Inhalte aus Supabase werden hier bewusst NICHT gespeichert. */
const VERSION = "huelle-v2";
const DATEIEN = [
  "./",
  "./index.html",
  "./admin.html",
  "./datenschutz.html",
  "./huelle.css",
  "./huelle.js",
  "./admin.js",
  "./sb.js",
  "./config.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./schrift/manrope-latin.woff2",
  "./schrift/manrope-latin-ext.woff2"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Erst Netz, ohne Verbindung aus dem Speicher. Nur eigene Dateien, nie Supabase.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const kopie = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, kopie));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
