const CACHE_NAME = "firepoz-cache-v1";
const urlsToCache = [
  "/FIREPOZ/",
  "/FIREPOZ/index.html",
  "/FIREPOZ/icons/icon-192.png",
  "/FIREPOZ/icons/icon-512.png",
  "/FIREPOZ/manifest.json"
];

// Installer le service worker et mettre en cache
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Activer le service worker
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      );
    })
  );
});

// Intercepter les requêtes et servir depuis le cache si offline
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
