import { 
  listeClients, listeFournisseurs, listeProduits, listeUtilisateurs, dashboard,
  ajouterClient, ajouterFournisseur, ajouterItem, ajouterUtilisateur,
  modifierClient, modifierFournisseur, modifierItem, modifierUtilisateur,
  supprimerClient, supprimerFournisseur, supprimerItem, supprimerUtilisateur,
  validerVendeur, listeCategories, ajouterCategorie, modifierCategorie, 
  supprimerCategorie, assignerCategorie, listeProduitsParCategorie,
  clientSolde, validerVente, modifierVente, getVente, ventesJour, 
  annulerVente, validerReception, rechercherProduitCodebar,
  // NOUVELLES FONCTIONS AJOUTÉES
  receptionsJour, articlesPlusVendus, profitByDate, stockValue, annulerReception
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
        return listeProduitsParCategorie(undefined);
      }
    },
    'dashboard': (url) => {
      try {
        const urlParams = new URL(url, window.location.origin).searchParams;
        const period = urlParams.get('period') || 'day';
        return dashboard(period);
      } catch (error) {
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
        return ventesJour();
      }
    },
    // NOUVEAUX ENDPOINTS AJOUTÉS
    'receptions_jour': (url) => {
      try {
        const urlParams = new URL(url, window.location.origin).searchParams;
        const date = urlParams.get('date');
        const numero_util = urlParams.get('numero_util');
        const numero_four = urlParams.get('numero_four');
        return receptionsJour({ date, numero_util, numero_four });
      } catch (error) {
        return receptionsJour();
      }
    },
    'articles_plus_vendus': (url) => {
      try {
        const urlParams = new URL(url, window.location.origin).searchParams;
        const date = urlParams.get('date');
        const numero_clt = urlParams.get('numero_clt');
        const numero_util = urlParams.get('numero_util');
        return articlesPlusVendus({ date, numero_clt, numero_util });
      } catch (error) {
        return articlesPlusVendus();
      }
    },
    'profit_by_date': (url) => {
      try {
        const urlParams = new URL(url, window.location.origin).searchParams;
        const date = urlParams.get('date');
        const numero_clt = urlParams.get('numero_clt');
        const numero_util = urlParams.get('numero_util');
        return profitByDate({ date, numero_clt, numero_util });
      } catch (error) {
        return profitByDate();
      }
    },
    'stock_value': () => stockValue(),
    
    'rechercher_produit_codebar': async (url) => {
      try {
        const urlParams = new URL(url, window.location.origin).searchParams;
        const codebar = urlParams.get('codebar');
        if (!codebar) {
          return {
            body: JSON.stringify({ erreur: 'Code-barres requis', status: 400 }),
            init: {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            }
          };
        }
        const responseData = await rechercherProduitCodebar(codebar);
        
        // Gestion explicite du cas "non trouvé"
        if (responseData.statut === 'non trouvé') {
          return {
            body: JSON.stringify({ statut: 'non trouvé', message: 'Produit non trouvé dans la base', status: 404 }),
            init: {
              status: 404,
              headers: {
                'Content-Type': 'application/json',
                'X-Content-Type-Options': 'nosniff'
              }
            }
          };
        }
        
        return {
          body: JSON.stringify(responseData),
          init: {
            status: responseData.status || 200,
            headers: {
              'Content-Type': 'application/json',
              'X-Content-Type-Options': 'nosniff'
            }
          }
        };
      } catch (error) {
        return {
          body: JSON.stringify({ erreur: error.message, message: 'Erreur serveur lors de la recherche', status: 500 }),
          init: {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          }
        };
      }
    }
  },
  POST: {
    'ajouter_client': (body) => ajouterClient(body),
    'ajouter_fournisseur': (body) => ajouterFournisseur(body),
    'ajouter_item': (body) => ajouterItem(body),
    'ajouter_utilisateur': (body) => ajouterUtilisateur(body),
    'valider_vendeur': (body) => validerVendeur(body),
    'ajouter_categorie': (body) => ajouterCategorie(body),
    'valider_vente': (body) => validerVente(body),
    'valider_reception': (body) => validerReception(body)
  },
  PUT: {
    'modifier_client/(\\w+)': (id, body) => modifierClient(id, body),
    'modifier_fournisseur/(\\w+)': (id, body) => modifierFournisseur(id, body),
    'modifier_item/(\\w+)': (id, body) => modifierItem(id, body),
    'modifier_utilisateur/(\\w+)': (id, body) => modifierUtilisateur(id, body),
    'modifier_categorie/(\\w+)': (id, body) => modifierCategorie(id, body),
    'modifier_vente/(\\w+)': (id, body) => modifierVente(id, body),
    'assigner_categorie': (body) => assignerCategorie(body)
  },
  DELETE: {
    'supprimer_client/(\\w+)': (id) => supprimerClient(id),
    'supprimer_fournisseur/(\\w+)': (id) => supprimerFournisseur(id),
    'supprimer_item/(\\w+)': (id) => supprimerItem(id),
    'supprimer_utilisateur/(\\w+)': (id) => supprimerUtilisateur(id),
    'supprimer_categorie/(\\w+)': (id) => supprimerCategorie(id),
    'annuler_vente': (body) => annulerVente(body),
    'annuler_reception': (body) => annulerReception(body)
  }
};

// Intercepteur de fetch
window.fetch = async function(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  const method = (init.method || 'GET').toUpperCase();
  const requestUrl = new URL(url, window.location.origin);

  // Vérifier si la requête commence par /api/
  const isApiRequest = requestUrl.pathname.startsWith('/api/');

  if (isApiRequest) {
    try {
      // Extraire l'endpoint après /api/
      const endpoint = requestUrl.pathname.replace('/api/', '');
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
        let response;
        
        if (['POST', 'PUT', 'DELETE'].includes(method)) {
          const body = init.body ? JSON.parse(init.body) : {};
          response = await matchedHandler(...matchParams, body);
        } else {
          response = await matchedHandler(...matchParams, url);
        }

        // Vérifier si la réponse est un objet avec body et init
        const responseBody = response.body || JSON.stringify(response);
        const responseInit = response.init || {
          status: response.status || 200,
          headers: { 'Content-Type': 'application/json' }
        };
        
        return new Response(responseBody, responseInit);
      } else {
        return new Response(JSON.stringify({ erreur: 'Endpoint inconnu', status: 404 }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (error) {
      return new Response(JSON.stringify({ erreur: error.message, status: 500 }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } else {
    return originalFetch(input, init);
  }
};

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ Interception des fetch activée pour /api/');
});
