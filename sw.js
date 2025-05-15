self.addEventListener('install', event => {
  console.log('Service Worker installé');
  event.waitUntil(
    caches.open('firepoz-cache').then(cache => {
      return cache.addAll([
        './index.html',
        './achat.html',
        './vente.html',
        './page1.html',
        './page2.html',
        './HISTO.html',
        './PARAM.html',
        './HELP.html',
        './manifest.json',
        './icon.png'
      ]);
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
