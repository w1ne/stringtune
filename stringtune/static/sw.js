const CACHE = 'stringtune-tuner-cache-v6';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch('/index.json');
    if (!response.ok) throw new Error('Unable to download offline manifest');
    const cache = await caches.open(CACHE);
    await cache.addAll(await response.json());
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('stringtune-tuner-cache-') && name !== CACHE)
      .map(name => caches.delete(name)));
    await clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const response = fetch(request);
  // Register the cache write while dispatching the event, and never cache a
  // server error or partial media response over a working offline asset.
  event.waitUntil(response.then(async result => {
    if (result.ok && result.status !== 206) {
      const copy = result.clone();
      const cache = await caches.open(CACHE);
      await cache.put(request, copy);
    }
  }).catch(() => {}));
  event.respondWith(response.catch(async () => {
    return await caches.match(request) || new Response('Unavailable offline', {status:503});
  }));
});
