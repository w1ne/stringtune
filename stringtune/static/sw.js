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
    fetch(event.request)
      .then(response => {
        // Network was successful, update cache
        caches.open('stringtune-tuner-cache').then(cache => cache.put(event.request, response.clone()));
        return response;
      })
      .catch(() => {
        // Network request failed, try the cache
        return caches.match(event.request);
      })
  );
});