self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames.map(function (cacheName) {
          if (cacheName !== 'stringtune-tuner-cache-v3') {
            console.log('Deleting out of date cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function () {
      return fetch('./index.json')
        .then(response => response.json())
        .then(files =>
          caches.open('stringtune-tuner-cache-v3').then(function (cache) {
            return cache.addAll(files);
          }).then(() => {
            return self.skipWaiting();
          })
        );
    })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    // If it's not a GET request or not a web URL, just handle it normally and don't cache it.
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Check if the response is partial (status 206) and avoid caching
        if (response.status !== 206) {
          let clone = response.clone();
          event.waitUntil(
            caches.open('stringtune-tuner-cache-v3').then(cache => cache.put(event.request, clone))
          );
        }
        return response;
      })
      .catch(() => {
        // Network request failed, try the cache
        return caches.match(event.request);
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(clients.claim());
});
