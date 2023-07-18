self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== 'stringtune-tuner-cache') {
            console.log('Deleting out of date cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      return fetch('./index.json')
        .then(response => response.json())
        .then(files =>
          caches.open('stringtune-tuner-cache').then(function(cache) {
            return cache.addAll(files);
          })
        );
    })
  );
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') {
    // If it's not a GET request, just handle it normally and don't cache it.
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        let clone = response.clone();
        event.waitUntil(
          caches.open('stringtune-tuner-cache').then(cache => cache.put(event.request, clone))
        );
        return response;
      })
      .catch(() => {
        // Network request failed, try the cache
        return caches.match(event.request);
      })
  );
});
``
