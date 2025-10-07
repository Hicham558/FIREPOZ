// Nom du cache
const CACHE_NAME = 'firepoz-cache-v1';

// Fichiers à mettre en cache pour offline
const FILES_TO_CACHE = [
  './index.html',
'./vente.html',
'./venteold.html',
'./BDD.html',
'./PARAM.html',
'./achat.html',
'./page2.html',
'./page1.html',
'./histo.html',
'./MAP.html',
  './manifest.json',
  './icon.png',
  './apiRoutes.js',  
  './sw1.js'       
];

// Installer le service worker et mettre les fichiers en cache
self.addEventListener('install', event => {
  console.log('[ServiceWorker] Installation');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[ServiceWorker] Mise en cache des fichiers');
        return cache.addAll(FILES_TO_CACHE);
      })
  );
  self.skipWaiting();
});

// Activer le service worker et nettoyer les anciens caches
self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activation');
  event.waitUntil(
    caches.keys().then(keyList =>
      Promise.all(keyList.map(key => {
        if (key !== CACHE_NAME) {
          console.log('[ServiceWorker] Suppression ancien cache', key);
          return caches.delete(key);
        }
      }))
    )
  );
  self.clients.claim();
});

// Intercepter les requêtes pour servir le cache
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});

