const CACHE_NAME = 'ysboekhouding-v4';

// Bij installatie: meteen activeren zonder te wachten
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Bij activatie: verwijder ALLE oude caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Alle eigen bestanden (HTML, JS, CSS): altijd vers van het netwerk
// Fallback naar cache alleen als er geen internet is
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isEigenBestand = url.hostname === self.location.hostname && (
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.html')
  );

  if (isEigenBestand) {
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
