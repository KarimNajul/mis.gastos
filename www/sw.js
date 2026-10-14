// Service worker: guarda la app en caché para que funcione sin internet.
// Al publicar cambios, subí el número de versión para que se actualice.
const CACHE = 'mis-gastos-v12';
const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './voz.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Responde desde la caché al instante y actualiza la copia en segundo plano.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const enCache = await cache.match(e.request, { ignoreSearch: true });
      const red = fetch(e.request)
        .then(resp => {
          if (resp.ok) cache.put(e.request, resp.clone());
          return resp;
        })
        .catch(() => enCache || cache.match('./index.html'));
      return enCache || red;
    })
  );
});
