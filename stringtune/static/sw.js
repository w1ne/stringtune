self.addEventListener('install', function(event) {
  event.waitUntil(
    fetch('./index.json')
      .then(response => response.json())
      .then(files =>
        caches.open('stringtune-tuner-cache').then(function(cache) {
          return cache.addAll(files);
        })
      )
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // Not in cache, return from network
        return fetch(event.request);
      })
  );
});
