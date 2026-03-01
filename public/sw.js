// Minimal service worker for PWA installability - no aggressive caching
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
