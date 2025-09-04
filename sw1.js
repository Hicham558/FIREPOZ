// sw1.js
importScripts('https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.min.js');
importScripts('./db.js');
importScripts('./apiRoutes.js');

self.addEventListener('install', event => {
  console.log('Service Worker installé');
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  console.log('Service Worker activé');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  const isApiRequest = requestUrl.href.startsWith('http://localhostdb/');

  if (isApiRequest) {
    const endpoint = requestUrl.pathname.replace(/^\/(http:\/\/localhostdb\/)?/, '');
    event.respondWith(handleApiRequest(endpoint, event.request, requestUrl));
  } else {
    // Passer les requêtes non-API directement
    event.respondWith(fetch(event.request));
  }
});

async function handleApiRequest(endpoint, request, requestUrl) {
  try {
    let responseData;
    let status = 200;

    // Mappez les endpoints aux fonctions de apiRoutes.js
    switch (endpoint) {
      case 'liste_clients':
        responseData = await listeClients();
        break;
      case 'liste_fournisseurs':
        responseData = await listeFournisseurs();
        break;
      case 'liste_produits':
        responseData = await listeProduits();
        break;
      case 'liste_utilisateurs':
        responseData = await listeUtilisateurs();
        break;
      case 'dashboard':
        const period = new URLSearchParams(requestUrl.search).get('period') || 'day';
        responseData = await dashboard(period);
        break;
      case 'ajouter_client':
        if (request.method === 'POST') {
          const body = await request.json();
          responseData = await ajouterClient(body);
          status = responseData.status || 200;
        } else {
          responseData = { erreur: 'Méthode non autorisée', status: 405 };
          status = 405;
        }
        break;
      case 'ajouter_fournisseur':
        if (request.method === 'POST') {
          const body = await request.json();
          responseData = await ajouterFournisseur(body);
          status = responseData.status || 200;
        } else {
          responseData = { erreur: 'Méthode non autorisée', status: 405 };
          status = 405;
        }
        break;
      case 'ajouter_item':
        if (request.method === 'POST') {
          const body = await request.json();
          responseData = await ajouterItem(body);
          status = responseData.status || 200;
        } else {
          responseData = { erreur: 'Méthode non autorisée', status: 405 };
          status = 405;
        }
        break;
      case 'ajouter_utilisateur':
        if (request.method === 'POST') {
          const body = await request.json();
          responseData = await ajouterUtilisateur(body);
          status = responseData.status || 200;
        } else {
          responseData = { erreur: 'Méthode non autorisée', status: 405 };
          status = 405;
        }
        break;
      default:
        // Gérer les endpoints avec ID (modifier_*, supprimer_*)
        if (endpoint.startsWith('modifier_client/')) {
          if (request.method === 'PUT') {
            const numero_clt = endpoint.split('/')[1];
            const body = await request.json();
            responseData = await modifierClient(numero_clt, body);
            status = responseData.status || 200;
          } else {
            responseData = { erreur: 'Méthode non autorisée', status: 405 };
            status = 405;
          }
        } else if (endpoint.startsWith('modifier_fournisseur/')) {
          if (request.method === 'PUT') {
            const numero_fou = endpoint.split('/')[1];
            const body = await request.json();
            responseData = await modifierFournisseur(numero_fou, body);
            status = responseData.status || 200;
          } else {
            responseData = { erreur: 'Méthode non autorisée', status: 405 };
            status = 405;
          }
        } else if (endpoint.startsWith('modifier_item/')) {
          if (request.method === 'PUT') {
            const numero_item = endpoint.split('/')[1];
            const body = await request.json();
            responseData = await modifierItem(numero_item, body);
            status = responseData.status || 200;
          } else {
            responseData = { erreur: 'Méthode non autorisée', status: 405 };
            status = 405;
          }
        } else if (endpoint.startsWith('modifier_utilisateur/')) {
          if (request.method === 'PUT') {
            const numero_util = endpoint.split('/')[1];
            const body = await request.json();
            responseData = await modifierUtilisateur(numero_util, body);
            status = responseData.status || 200;
          } else {
            responseData = { erreur: 'Méthode non autorisée', status: 405 };
            status = 405;
          }
        } else if (endpoint.startsWith('supprimer_client/')) {
          if (request.method === 'DELETE') {
            const numero_clt = endpoint.split('/')[1];
            responseData = await supprimerClient(numero_clt);
            status = responseData.status || 200;
          } else {
            responseData = { erreur: 'Méthode non autorisée', status: 405 };
            status = 405;
          }
        } else if (endpoint.startsWith('supprimer_fournisseur/')) {
          if (request.method === 'DELETE') {
            const numero_fou = endpoint.split('/')[1];
            responseData = await supprimerFournisseur(numero_fou);
            status = responseData.status || 200;
          } else {
            responseData = { erreur: 'Méthode non autorisée', status: 405 };
            status = 405;
          }
        } else if (endpoint.startsWith('supprimer_item/')) {
          if (request.method === 'DELETE') {
            const numero_item = endpoint.split('/')[1];
            responseData = await supprimerItem(numero_item);
            status = responseData.status || 200;
          } else {
            responseData = { erreur: 'Méthode non autorisée', status: 405 };
            status = 405;
          }
        } else if (endpoint.startsWith('supprimer_utilisateur/')) {
          if (request.method === 'DELETE') {
            const numero_util = endpoint.split('/')[1];
            responseData = await supprimerUtilisateur(numero_util);
            status = responseData.status || 200;
          } else {
            responseData = { erreur: 'Méthode non autorisée', status: 405 };
            status = 405;
          }
        } else {
          responseData = { erreur: 'Endpoint inconnu', status: 404 };
          status = 404;
        }
        break;
    }

    return new Response(JSON.stringify(responseData), {
      status: status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Erreur dans handleApiRequest:', error);
    return new Response(JSON.stringify({ erreur: error.message, status: 500 }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}