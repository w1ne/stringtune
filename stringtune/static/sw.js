self.addEventListener('install', function(event) {
  event.waitUntil(
    fetch('index.json')
      .then(response => response.json())
      .then(files =>
        caches.open('stringtune-tuner-cache').then(function(cache) {
          return cache.addAll(files);
        })
      )
  );
});
