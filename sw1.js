import { 
  listeClients, listeFournisseurs, listeProduits, listeUtilisateurs, dashboard,
  ajouterClient, ajouterFournisseur, ajouterItem, ajouterUtilisateur,
  modifierClient, modifierFournisseur, modifierItem, modifierUtilisateur,
  supprimerClient, supprimerFournisseur, supprimerItem, supprimerUtilisateur,
  validerVendeur,
  listeCategories, ajouterCategorie, modifierCategorie, supprimerCategorie,
  assignerCategorie, listeProduitsParCategorie,
  clientSolde, validerVente,
  modifierVente, getVente, ventesJour, annulerVente, validerReception,
  rechercherProduitCodebar
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
    'client_solde': () => clientSolde(),
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
    },
    'get_vente/(\\w+)': (id) => getVente(id),
    'ventes_jour': (url) => {
      try {
        const urlParams = new URL(url, window.location.origin).searchParams;
        const date = urlParams.get('date');
        const numero_clt = urlParams.get('numero_clt');
        const numero_util = urlParams.get('numero_util');
        return ventesJour({ date, numero_clt, numero_util });
      } catch (error) {
        console.error('❌ Erreur extraction paramètres ventesJour:', error);
        return ventesJour();
      }
    },
    'rechercher_produit_codebar': async (url) => {
      try {
        const urlParams = new URL(url, window.location.origin).searchParams;
        const codebar = urlParams.get('codebar');
        if (!codebar) {
          console.error('❌ Paramètre codebar manquant');
          return {
            body: JSON.stringify({ erreur: 'Code-barres requis', status: 400 }),
            init: {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            }
          };
        }
        const responseData = await rechercherProduitCodebar(codebar);
        console.log('✅ Réponse de rechercherProduitCodebar:', responseData);
        return {
          body: JSON.stringify(responseData),
          init: {
            status: responseData.status || 200,
            headers: {
              'Content-Type': 'application/json',
              'X-Content-Type-Options': 'nosniff' // Imiter les en-têtes Flask
            }
          }
        };
      } catch (error) {
        console.error('❌ Erreur extraction paramètre codebar:', error);
        return {
          body: JSON.stringify({ erreur: error.message, status: 500 }),
          init: {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          }
        };
      }
    }
  },
  // ... (les autres méthodes POST, PUT, DELETE restent inchangées)
};

// Intercepteur de fetch
window.fetch = async function(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  const method = (init.method || 'GET').toUpperCase();
  const requestUrl = new URL(url, window.location.origin);

  // Vérifier si la requête commence par /api/
  const isApiRequest = requestUrl.pathname.startsWith('/api/');

  console.log('🔍 Requête interceptée:', url, 'isApiRequest:', isApiRequest);

  if (isApiRequest) {
    try {
      // Extraire l'endpoint après /api/
      const endpoint = requestUrl.pathname.replace('/api/', '');
      const methodHandlers = handlers[method] || {};

      console.log('🔍 Endpoint extrait:', endpoint, 'Méthode:', method);

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
        let response;
        
        if (['POST', 'PUT'].includes(method)) {
          const body = init.body ? JSON.parse(init.body) : {};
          response = await matchedHandler(...matchParams, body);
        } else {
          response = await matchedHandler(...matchParams, url);
        }

        // Vérifier si la réponse est un objet avec body et init (pour rechercher_produit_codebar)
        const responseBody = response.body || JSON.stringify(response);
        const responseInit = response.init || {
          status: response.status || 200,
          headers: { 'Content-Type': 'application/json' }
        };

        console.log('✅ Réponse locale pour', endpoint, ':', JSON.parse(responseBody));
        
        return new Response(responseBody, responseInit);
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
  console.log('✅ Interception des fetch activée pour /api/');
  // Test automatique
  setTimeout(() => {
    console.log('🧪 Test automatique de l\'intercepteur...');
    fetch('/api/liste_clients')
      .then(response => response.json())
      .then(data => console.log('✅ Test réussi - Données clients:', data))
      .catch(error => console.error('❌ Test échoué:', error));
    // Test supplémentaire pour rechercher_produit_codebar
    setTimeout(() => {
      console.log('🧪 Test automatique de rechercher_produit_codebar...');
      fetch('/api/rechercher_produit_codebar?codebar=1234567890123')
        .then(response => response.json())
        .then(data => console.log('✅ Test réussi - Données produit:', data))
        .catch(error => console.error('❌ Test échoué:', error));
    }, 1500);
  }, 1000);
});