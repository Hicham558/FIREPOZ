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
  
  try {
    const requestUrl = new URL(url, window.location.origin);
    const isApiRequest = requestUrl.hostname === 'localhostdb';
    
    console.log('🔍 Requête interceptée:', url, 'Hostname:', requestUrl.hostname, 'isApiRequest:', isApiRequest);
    
    if (isApiRequest) {
      // Extraire l'endpoint après le hostname
      const endpoint = requestUrl.pathname.substring(1); // Enlève le slash initial
      const methodHandlers = handlers[method] || {};
      
      console.log('🔍 Endpoint:', endpoint, 'Méthode:', method);
      
      // Recherche du gestionnaire correspondant
      let matchedHandler = null;
      let matchParams = null;
      
      for (const [pattern, handler] of Object.entries(methodHandlers)) {
        const regex = new RegExp(`^${pattern}$`);
        const match = endpoint.match(regex);
        
        if (match) {
          matchedHandler = handler;
          matchParams = match.slice(1);
          console.log('🔍 Handler trouvé:', pattern);
          break;
        }
      }
      
      if (matchedHandler) {
        let responseData;
        
        if (['POST', 'PUT'].includes(method)) {
          const body = init.body ? JSON.parse(init.body) : {};
          responseData = await matchedHandler(...matchParams, body);
        } else {
          responseData = await matchedHandler(...matchParams);
        }
        
        console.log('✅ Réponse locale:', responseData);
        
        return new Response(JSON.stringify(responseData), {
          status: responseData.status || 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        console.warn('❌ Aucun handler trouvé pour:', endpoint);
        return new Response(JSON.stringify({ erreur: 'Endpoint inconnu', status: 404 }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  } catch (error) {
    console.error('❌ Erreur dans l\'interception:', error);
    // En cas d'erreur, on passe à la fetch originale
  }
  
  // Pour les requêtes non-API ou en cas d'erreur
  console.log('🌐 Requête transmise au réseau:', url);
  return originalFetch.apply(this, arguments);
};

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ Intercepteur fetch activé');
  getDb()
    .then(() => console.log('✅ Base de données initialisée'))
    .catch(err => console.error('❌ Erreur DB:', err));
});