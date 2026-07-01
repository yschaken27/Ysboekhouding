const CACHE_NAME = 'ysboekhouding-v5';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isEigenHostname = url.hostname === self.location.hostname;

  // JS en CSS: NOOIT cachen — altijd vers van het netwerk, geen fallback
  if (isEigenHostname && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // HTML (navigatie): network-first met cache-fallback voor offline
  if (isEigenHostname && (event.request.mode === 'navigate' || url.pathname.endsWith('.html'))) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
  // Firebase en overige externe requests: normaal doorlaten
});
