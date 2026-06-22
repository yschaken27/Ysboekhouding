const CACHE_NAME = 'ysboekhouding-v2';

// Bij installatie: meteen activeren zonder te wachten
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Bij activatie: verwijder ALLE oude caches (inclusief vorige blob-versie)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Navigatie-requests (HTML pagina): altijd vers van het netwerk halen
// Fallback naar cache alleen als er geen internet is
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          // Sla de verse pagina op als offline fallback
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
  // Overige requests (Firebase, scripts): normaal doorlaten
});
