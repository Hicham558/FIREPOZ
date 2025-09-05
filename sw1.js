// intercept.js
import { getDb, listeClients, listeFournisseurs, listeProduits, listeUtilisateurs, dashboard,
        ajouterClient, ajouterFournisseur, ajouterItem, ajouterUtilisateur,
        modifierClient, modifierFournisseur, modifierItem, modifierUtilisateur,
        supprimerClient, supprimerFournisseur, supprimerItem, supprimerUtilisateur } from './apiRoutes.js';

// Sauvegarde de la fonction fetch originale
const originalFetch = window.fetch;

// Gestionnaires pour chaque endpoint et méthode HTTP
const handlers = {
  GET: {
    'liste_clients': () => listeClients(),
    'liste_fournisseurs': () => listeFournisseurs(),
    'liste_produits': () => listeProduits(),
    'liste_utilisateurs': () => listeUtilisateurs(),
    'dashboard': (url) => dashboard(new URL(url).searchParams.get('period') || 'day')
  },
  POST: {
    'ajouter_client': (body) => ajouterClient(body),
    'ajouter_fournisseur': (body) => ajouterFournisseur(body),
    'ajouter_item': (body) => ajouterItem(body),
    'ajouter_utilisateur': (body) => ajouterUtilisateur(body)
  },
  PUT: {
    'modifier_client/(\\w+)': (id, body) => modifierClient(id, body),
    'modifier_fournisseur/(\\w+)': (id, body) => modifierFournisseur(id, body),
    'modifier_item/(\\w+)': (id, body) => modifierItem(id, body),
    'modifier_utilisateur/(\\w+)': (id, body) => modifierUtilisateur(id, body)
  },
  DELETE: {
    'supprimer_client/(\\w+)': (id) => supprimerClient(id),
    'supprimer_fournisseur/(\\w+)': (id) => supprimerFournisseur(id),
    'supprimer_item/(\\w+)': (id) => supprimerItem(id),
    'supprimer_utilisateur/(\\w+)': (id) => supprimerUtilisateur(id)
  }
};

// Surcharge de la fonction fetch
window.fetch = async function(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  const method = (init.method || 'GET').toUpperCase();
  const requestUrl = new URL(url, window.location.origin);

  // Vérifier si la requête commence par http://localhostdb/
  const isApiRequest = requestUrl.href.startsWith('http://localhostdb/');

  console.log('Requête interceptée:', url, 'isApiRequest:', isApiRequest);

  if (isApiRequest) {
    try {
      // Extraire l'endpoint après http://localhostdb/
      const endpoint = requestUrl.pathname.replace(/^\/?(http:\/\/localhostdb\/)?/, '');
      const methodHandlers = handlers[method] || {};

      // Recherche du gestionnaire correspondant
      let matchedHandler = null;
      let matchParams = null;
      for (const [pattern, handler] of Object.entries(methodHandlers)) {
        const regex = new RegExp(`^${pattern}$`);
        const match = endpoint.match(regex);
        if (match) {
          matchedHandler = handler;
          matchParams = match.slice(1);
          break;
        }
      }

      if (matchedHandler) {
        let responseData;
        if (['POST', 'PUT'].includes(method)) {
          const body = init.body ? JSON.parse(init.body) : {};
          responseData = await matchedHandler(...matchParams, body);
        } else {
          responseData = await matchedHandler(...matchParams, url);
        }
        const status = responseData.status || 200;
        console.log('Réponse locale pour', endpoint, ':', responseData);
        return new Response(JSON.stringify(responseData), {
          status,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        console.warn('Endpoint inconnu:', endpoint);
        return new Response(JSON.stringify({ erreur: 'Endpoint inconnu', status: 404 }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (error) {
      console.error('Erreur dans la gestion locale:', error);
      return new Response(JSON.stringify({ erreur: error.message, status: 500 }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } else {
    console.log('Requête non-API, transmise au réseau:', url);
    return originalFetch(input, init);
  }
};

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
  console.log('Interception des fetch activée');
  // Initialisation de la base de données
  getDb()
    .then(() => console.log('Base de données SQLite initialisée'))
    .catch(err => console.error('Erreur init DB:', err));
});