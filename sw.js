// v5 - Nuclear reset: destroy all caches, unregister self, reload all clients
self.addEventListener('install', function() {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(names.map(function(name) { return caches.delete(name); }));
    }).then(function() {
      return self.clients.claim();
    }).then(function() {
      return self.clients.matchAll({ type: 'window' });
    }).then(function(clients) {
      clients.forEach(function(client) { client.navigate(client.url); });
    }).then(function() {
      return self.registration.unregister();
    })
  );
});

// Pass everything through to network — no caching at all
self.addEventListener('fetch', function(event) {
  event.respondWith(fetch(event.request));
});
