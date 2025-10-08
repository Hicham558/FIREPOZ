// Nom du cache
const CACHE_NAME = 'firepoz-cache-v2'; // Changez la version pour forcer la mise à jour

// Base URL pour GitHub Pages
const BASE_PATH = '/FIREPOZ';

// Fichiers à mettre en cache pour offline
const FILES_TO_CACHE = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/vente.html`,
  `${BASE_PATH}/venteold.html`,
  `${BASE_PATH}/BDD.html`,
  `${BASE_PATH}/PARAM.html`,
  `${BASE_PATH}/achat.html`,
  `${BASE_PATH}/page2.html`,
  `${BASE_PATH}/page1.html`,
  `${BASE_PATH}/histo.html`,
  `${BASE_PATH}/MAP.html`,
  `${BASE_PATH}/manifest.json`,
  `${BASE_PATH}/icons/icon-192.png`,
  `${BASE_PATH}/icons/icon-512.png`,
  `${BASE_PATH}/apiRoutes.js`
];

// Installer le service worker et mettre les fichiers en cache
self.addEventListener('install', event => {
  console.log('[ServiceWorker] Installation en cours...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[ServiceWorker] Mise en cache des fichiers');
        return cache.addAll(FILES_TO_CACHE);
      })
      .catch(err => {
        console.error('[ServiceWorker] Erreur lors de la mise en cache:', err);
        console.error('Fichier problématique:', err.message);
      })
  );
  self.skipWaiting();
});

// Activer le service worker et nettoyer les anciens caches
self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activation en cours...');
  event.waitUntil(
    caches.keys().then(keyList =>
      Promise.all(keyList.map(key => {
        if (key !== CACHE_NAME) {
          console.log('[ServiceWorker] Suppression ancien cache:', key);
          return caches.delete(key);
        }
      }))
    )
  );
  return self.clients.claim();
});

// Intercepter les requêtes - Stratégie Network First pour GitHub Pages
self.addEventListener('fetch', event => {
  // Ignorer les requêtes non-GET et externes
  if (event.request.method !== 'GET' || 
      !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    // Essayer le réseau d'abord (important pour GitHub Pages)
    fetch(event.request)
      .then(response => {
        // Si succès, mettre en cache
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch(() => {
        // Si échec réseau, utiliser le cache
        console.log('[ServiceWorker] Servir depuis le cache:', event.request.url);
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Fallback pour la page d'accueil
            if (event.request.mode === 'navigate') {
              return caches.match(`${BASE_PATH}/index.html`);
            }
          });
      })
  );
});