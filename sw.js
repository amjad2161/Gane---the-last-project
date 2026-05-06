/* GANE NAV service worker — minimal offline shell. */
const CACHE = 'gane-nav-v1';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Network-first for tiles & APIs, cache-first for shell
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
  } else {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
