self.addEventListener('install', event => {
  console.log('Service Worker installé');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('Service Worker activé');
  self.clients.claim();
});

importScripts('apiRoutes.js');

const routes = {
  '/test': { method: 'GET', handler: async () => ({ message: "Connexion réussie !" }) },
  '/tables': { method: 'GET', handler: listeTables },
  '/liste_clients': { method: 'GET', handler: listeClients },
  '/liste_fournisseurs': { method: 'GET', handler: listeFournisseurs },
  '/liste_utilisateurs': { method: 'GET', handler: listeUtilisateurs },
  '/liste_produits': { method: 'GET', handler: listeProduits },
  '/dashboard': { method: 'GET', handler: async (reqUrl) => {
      const url = new URL(reqUrl);
      const period = url.searchParams.get('period') || 'day';
      return await dashboard(period);
    }
  },
  '/ajouter_client': { method: 'POST', handler: ajouterClient },
  '/ajouter_fournisseur': { method: 'POST', handler: ajouterFournisseur },
  '/ajouter_utilisateur': { method: 'POST', handler: ajouterUtilisateur },
  '/ajouter_item': { method: 'POST', handler: ajouterItem },
  '/modifier_client/': { method: 'PUT', handler: modifierClient },
  '/modifier_fournisseur/': { method: 'PUT', handler: modifierFournisseur },
  '/modifier_utilisateur/': { method: 'PUT', handler: modifierUtilisateur },
  '/modifier_item/': { method: 'PUT', handler: modifierItem },
  '/supprimer_client/': { method: 'DELETE', handler: supprimerClient },
  '/supprimer_fournisseur/': { method: 'DELETE', handler: supprimerFournisseur },
  '/supprimer_utilisateur/': { method: 'DELETE', handler: supprimerUtilisateur },
  '/supprimer_item/': { method: 'DELETE', handler: supprimerItem },
};

self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Si l'URL commence par "http://localhostdb", traiter avec apiRoutes
  if (url.startsWith('http://localhostdb')) {
    const path = new URL(url).pathname;
    const method = event.request.method.toUpperCase();
    console.log("SW intercepté (localhostdb):", method, path);
    event.respondWith(handleLocalRequest(path, method, event.request));
  } else {
    // Sinon laisser la requête passer normalement
    return;
  }
});

async function handleLocalRequest(path, method, request) {
  let routeKey = Object.keys(routes).find(r => 
    (r.endsWith('/') ? path.startsWith(r) : path === r) && routes[r].method === method
  );

  if (!routeKey) return new Response(JSON.stringify({ erreur: `Requête non prise en charge : ${method} ${path}` }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const route = routes[routeKey];

  try {
    let data;
    if (method === 'GET') data = await route.handler(request.url);
    else if (method === 'POST' || method === 'PUT') {
      const body = await request.json();
      const id = path.split('/').pop();
      data = routeKey.endsWith('/') ? await route.handler(id, body) : await route.handler(body);
    } else if (method === 'DELETE') {
      const id = path.split('/').pop();
      data = await route.handler(id);
    }

    return new Response(JSON.stringify(data), { status: !data.erreur ? 200 : 400, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ erreur: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}