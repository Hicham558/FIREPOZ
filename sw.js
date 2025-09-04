const CACHE_NAME = 'firepoz-cache-v3'; // CHANGE le numéro à chaque mise à jour

const urlsToCache = [
  './index.html',
  './achat.html',
  './vente.html',
  './page1.html',
  './page2.html',
'./map.html','./venteold.html',
  './HISTO.html',
  './PARAM.html',
  './HELP.html',
  './manifest.json',
  './icon.png'
];

// Installation et mise en cache
self.addEventListener('install', event => {
  console.log('[SW] Install');
  self.skipWaiting(); // Active immédiatement la nouvelle version
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Mise en cache');
      return cache.addAll(urlsToCache);
    })
  );
});

// Activation et suppression des anciens caches
self.addEventListener('activate', event => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Suppression ancien cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Gestion des fetch
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});