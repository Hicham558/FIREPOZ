// intercept.js
import { 
  listeClients, listeFournisseurs, listeProduits, listeUtilisateurs, dashboard,
  ajouterClient, ajouterFournisseur, ajouterItem, ajouterUtilisateur,
  modifierClient, modifierFournisseur, modifierItem, modifierUtilisateur,
  supprimerClient, supprimerFournisseur, supprimerItem, supprimerUtilisateur,
  validerVendeur,
  listeCategories, ajouterCategorie, modifierCategorie, supprimerCategorie,
  assignerCategorie, listeProduitsParCategorie
} from './apiRoutes.js';

// Sauvegarde de la fonction fetch originale
const originalFetch = window.fetch;

// Gestionnaires pour chaque endpoint et méthode HTTP
const handlers = {
  GET: {
    'liste_clients': () => listeClients(),
    'liste_fournisseurs': () => listeFournisseurs(),
    'liste_produits': () => listeProduits(),
    'liste_utilisateurs': () => listeUtilisateurs(),
    'liste_categories': () => listeCategories(),
    'liste_produits_par_categorie': (url) => {
      try {
        const urlObj = new URL(url, window.location.origin);
        const numero_categorie = urlObj.searchParams.get('numero_categorie');
        const catId = numero_categorie ? parseInt(numero_categorie) : undefined;
        return listeProduitsParCategorie(catId);
      } catch (error) {
        console.error('❌ Erreur URL liste_produits_par_categorie:', error);
        return listeProduitsParCategorie(undefined);
      }
    },
    'dashboard': (url) => {
      try {
        const urlParams = new URL(url, window.location.origin).searchParams;
        const period = urlParams.get('period') || 'day';
        return dashboard(period);
      } catch (error) {
        console.error('❌ Erreur extraction paramètres dashboard:', error);
        return dashboard('day');
      }
    }
  },
  POST: {
    'ajouter_client': (body) => ajouterClient(body),
    'ajouter_fournisseur': (body) => ajouterFournisseur(body),
    'ajouter_item': (body) => ajouterItem(body),
    'ajouter_utilisateur': (body) => ajouterUtilisateur(body),
    'ajouter_categorie': (body) => ajouterCategorie(body),
    'assigner_categorie': (body) => assignerCategorie(body),
    'valider_vendeur': (body) => validerVendeur(body) 
  },
  PUT: {
    'modifier_client/(\\w+)': (id, body) => modifierClient(id, body),
    'modifier_fournisseur/(\\w+)': (id, body) => modifierFournisseur(id, body),
    'modifier_item/(\\w+)': (id, body) => modifierItem(id, body),
    'modifier_utilisateur/(\\w+)': (id, body) => modifierUtilisateur(id, body),
    'modifier_categorie/(\\w+)': (id, body) => modifierCategorie(id, body)
  },
  DELETE: {
    'supprimer_client/(\\w+)': (id) => supprimerClient(id),
    'supprimer_fournisseur/(\\w+)': (id) => supprimerFournisseur(id),
    'supprimer_item/(\\w+)': (id) => supprimerItem(id),
    'supprimer_utilisateur/(\\w+)': (id) => supprimerUtilisateur(id),
    'supprimer_categorie/(\\w+)': (id) => supprimerCategorie(id)
  }
};

// Surcharge de la fonction fetch
window.fetch = async function(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  const method = (init.method || 'GET').toUpperCase();
  const requestUrl = new URL(url, window.location.origin);

  // Vérifier si la requête commence par /api/ ou https://hicham03041979.onrender.com/
  const isApiRequest = requestUrl.pathname.startsWith('/api/') || 
                       requestUrl.href.startsWith('https://hicham03041979.onrender.com/');

  console.log('🔍 Requête interceptée:', url, 'Méthode:', method, 'isApiRequest:', isApiRequest);

  if (isApiRequest) {
    try {
      // Extraire l'endpoint
      const endpoint = requestUrl.pathname.startsWith('/api/') 
        ? requestUrl.pathname.replace('/api/', '')
        : requestUrl.pathname.replace(/^\/?(https:\/\/hicham03041979\.onrender\.com\/)?/, '');
      const methodHandlers = handlers[method] || {};

      console.log('🔍 Endpoint extrait:', endpoint);

      // Recherche du gestionnaire correspondant
      let matchedHandler = null;
      let matchParams = null;
      
      for (const [pattern, handler] of Object.entries(methodHandlers)) {
        const regex = new RegExp(`^${pattern}$`);
        const match = endpoint.match(regex);
        
        if (match) {
          matchedHandler = handler;
          matchParams = match.slice(1);
          console.log('✅ Handler trouvé pour le pattern:', pattern);
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
        
        console.log('✅ Réponse brute pour', endpoint, ':', responseData);
        if (responseData.erreur) {
          console.error('❌ Erreur dans la réponse:', responseData.erreur);
          return new Response(JSON.stringify(responseData), {
            status: responseData.status || 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        const jsonResponse = JSON.stringify(responseData);
        console.log('✅ Réponse JSON envoyée:', jsonResponse);
        return new Response(jsonResponse, {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        console.warn('❌ Aucun handler trouvé pour l\'endpoint:', endpoint);
        return new Response(JSON.stringify({ erreur: 'Endpoint inconnu', status: 404 }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (error) {
      console.error('❌ Erreur dans la gestion locale:', error);
      return new Response(JSON.stringify({ erreur: error.message, status: 500 }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } else {
    console.log('🌐 Requête non-API, transmise au réseau:', url);
    return originalFetch(input, init);
  }
};

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ Interception des fetch activée');
  // Test automatique
  setTimeout(() => {
    console.log('🧪 Test automatique de l\'intercepteur...');
    fetch('/api/liste_clients')
      .then(response => response.json())
      .then(data => console.log('✅ Test réussi - Données clients:', data))
      .catch(error => console.error('❌ Test échoué:', error));
  }, 1000);
});
