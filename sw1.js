import {
  listeClients, listeFournisseurs, listeProduits, listeUtilisateurs, dashboard,
  ajouterClient, ajouterFournisseur, ajouterItem, ajouterUtilisateur,
  modifierClient, modifierFournisseur, modifierItem, modifierUtilisateur,
  supprimerClient, supprimerFournisseur, supprimerItem, supprimerUtilisateur,
  validerVendeur, listeCategories, ajouterCategorie, modifierCategorie,
  supprimerCategorie, assignerCategorie, listeProduitsParCategorie,
  clientSolde, validerVente, modifierVente, getVente, ventesJour,
  annulerVente, validerReception, rechercherProduitCodebar,
  receptionsJour, articlesPlusVendus, profitByDate, stockValue, annulerReception,
  getReception
} from './apiRoutes.js';

// Sauvegarde de la fonction fetch originale
const originalFetch = window.fetch;

// Gestionnaires pour chaque endpoint et méthode HTTP
const handlers = {
  GET: {
    'liste_clients': async () => {
      console.log('📥 Interception GET /api/liste_clients');
      try {
        const result = await listeClients();
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur liste_clients:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'liste_fournisseurs': async () => {
      console.log('📥 Interception GET /api/liste_fournisseurs');
      try {
        const result = await listeFournisseurs();
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur liste_fournisseurs:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'liste_produits': async () => {
      console.log('📥 Interception GET /api/liste_produits');
      try {
        const result = await listeProduits();
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur liste_produits:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'liste_utilisateurs': async () => {
      console.log('📥 Interception GET /api/liste_utilisateurs');
      try {
        const result = await listeUtilisateurs();
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur liste_utilisateurs:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'liste_categories': async () => {
      console.log('📥 Interception GET /api/liste_categories');
      try {
        const result = await listeCategories();
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur liste_categories:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'client_solde': async () => {
      console.log('📥 Interception GET /api/client_solde');
      try {
        const result = await clientSolde();
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur client_solde:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'liste_produits_par_categorie': async (url) => {
      console.log('📥 Interception GET /api/liste_produits_par_categorie');
      try {
        const urlObj = new URL(url, window.location.origin);
        const numero_categorie = urlObj.searchParams.get('numero_categorie');
        const catId = numero_categorie ? parseInt(numero_categorie) : undefined;
        const result = await listeProduitsParCategorie(catId);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur liste_produits_par_categorie:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'dashboard': async (url) => {
      console.log('📥 Interception GET /api/dashboard');
      try {
        const urlParams = new URL(url, window.location.origin).searchParams;
        const period = urlParams.get('period') || 'day';
        const result = await dashboard(period);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur dashboard:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'get_vente/(\\w+)': async (id) => {
      console.log(`📥 Interception GET /api/get_vente/${id}`);
      try {
        const result = await getVente(id);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur get_vente:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'ventes_jour': async (url) => {
      console.log('📥 Interception GET /api/ventes_jour');
      try {
        const urlParams = new URL(url, window.location.origin).searchParams;
        const date = urlParams.get('date');
        const numero_clt = urlParams.get('numero_clt');
        const numero_util = urlParams.get('numero_util');
        const result = await ventesJour({ date, numero_clt, numero_util });
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur ventes_jour:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'receptions_jour': async (url) => {
      console.log('📥 Interception GET /api/receptions_jour');
      try {
        const urlParams = new URL(url, window.location.origin).searchParams;
        const date = urlParams.get('date');
        const numero_util = urlParams.get('numero_util');
        const numero_four = urlParams.get('numero_four');
        const result = await receptionsJour({ date, numero_util, numero_four });
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur receptions_jour:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'articles_plus_vendus': async (url) => {
      console.log('📥 Interception GET /api/articles_plus_vendus');
      try {
        const urlParams = new URL(url, window.location.origin).searchParams;
        const date = urlParams.get('date');
        const numero_clt = urlParams.get('numero_clt');
        const numero_util = urlParams.get('numero_util');
        const result = await articlesPlusVendus({ date, numero_clt, numero_util });
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur articles_plus_vendus:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'profit_by_date': async (url) => {
      console.log('📥 Interception GET /api/profit_by_date');
      try {
        const urlParams = new URL(url, window.location.origin).searchParams;
        const date = urlParams.get('date');
        const numero_clt = urlParams.get('numero_clt');
        const numero_util = urlParams.get('numero_util');
        const result = await profitByDate({ date, numero_clt, numero_util });
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur profit_by_date:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'stock_value': async () => {
      console.log('📥 Interception GET /api/stock_value');
      try {
        const result = await stockValue();
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur stock_value:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'rechercher_produit_codebar': async (url) => {
      console.log('📥 Interception GET /api/rechercher_produit_codebar');
      try {
        const urlParams = new URL(url, window.location.origin).searchParams;
        const codebar = urlParams.get('codebar');
        if (!codebar) {
          console.error('❌ Code-barres requis');
          return {
            body: JSON.stringify({ erreur: 'Code-barres requis', status: 400 }),
            init: { status: 400, headers: { 'Content-Type': 'application/json' } }
          };
        }
        const result = await rechercherProduitCodebar(codebar);
        if (result.statut === 'non trouvé') {
          console.log('📋 Produit non trouvé pour codebar:', codebar);
          return {
            body: JSON.stringify({ statut: 'non trouvé', message: 'Produit non trouvé dans la base', status: 404 }),
            init: { status: 404, headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' } }
          };
        }
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' } }
        };
      } catch (error) {
        console.error('❌ Erreur rechercher_produit_codebar:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'reception/:numero_mouvement': async (params) => {
      console.log(`📥 Interception GET /api/reception/${params.numero_mouvement}`);
      try {
        const numero_mouvement = parseInt(params.numero_mouvement, 10);
        if (isNaN(numero_mouvement)) {
          console.error('❌ Numéro de mouvement invalide:', params.numero_mouvement);
          return {
            body: JSON.stringify({ erreur: 'Numéro de mouvement invalide', status: 400 }),
            init: { status: 400, headers: { 'Content-Type': 'application/json' } }
          };
        }
        const result = await getReception(numero_mouvement);
        console.log(`✅ Réponse getReception:`, result);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur get_reception:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    }
  },
  POST: {
    'ajouter_client': async (body) => {
      console.log('📥 Interception POST /api/ajouter_client');
      try {
        const result = await ajouterClient(body);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur ajouter_client:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'ajouter_fournisseur': async (body) => {
      console.log('📥 Interception POST /api/ajouter_fournisseur');
      try {
        const result = await ajouterFournisseur(body);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur ajouter_fournisseur:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'ajouter_item': async (body) => {
      console.log('📥 Interception POST /api/ajouter_item');
      try {
        const result = await ajouterItem(body);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur ajouter_item:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'ajouter_utilisateur': async (body) => {
      console.log('📥 Interception POST /api/ajouter_utilisateur');
      try {
        const result = await ajouterUtilisateur(body);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur ajouter_utilisateur:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'valider_vendeur': async (body) => {
      console.log('📥 Interception POST /api/valider_vendeur');
      try {
        const result = await validerVendeur(body);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur valider_vendeur:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'ajouter_categorie': async (body) => {
      console.log('📥 Interception POST /api/ajouter_categorie');
      try {
        const result = await ajouterCategorie(body);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur ajouter_categorie:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'valider_vente': async (body) => {
      console.log('📥 Interception POST /api/valider_vente');
      try {
        const result = await validerVente(body);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur valider_vente:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'valider_reception': async (body) => {
      console.log('📥 Interception POST /api/valider_reception');
      try {
        const result = await validerReception(body);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur valider_reception:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'annuler_vente': async (body) => {
      console.log('📥 Interception POST /api/annuler_vente');
      try {
        const result = await annulerVente(body);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur annuler_vente:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'annuler_reception': async (body) => {
      console.log('📥 Interception POST /api/annuler_reception');
      try {
        const result = await annulerReception(body);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur annuler_reception:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    }
  },
  PUT: {
    'modifier_client/(\\w+)': async (id, body) => {
      console.log(`📥 Interception PUT /api/modifier_client/${id}`);
      try {
        const result = await modifierClient(id, body);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur modifier_client:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'modifier_fournisseur/(\\w+)': async (id, body) => {
      console.log(`📥 Interception PUT /api/modifier_fournisseur/${id}`);
      try {
        const result = await modifierFournisseur(id, body);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur modifier_fournisseur:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'modifier_item/(\\w+)': async (id, body) => {
      console.log(`📥 Interception PUT /api/modifier_item/${id}`);
      try {
        const result = await modifierItem(id, body);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur modifier_item:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'modifier_utilisateur/(\\w+)': async (id, body) => {
      console.log(`📥 Interception PUT /api/modifier_utilisateur/${id}`);
      try {
        const result = await modifierUtilisateur(id, body);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur modifier_utilisateur:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'modifier_categorie/(\\w+)': async (id, body) => {
      console.log(`📥 Interception PUT /api/modifier_categorie/${id}`);
      try {
        const result = await modifierCategorie(id, body);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur modifier_categorie:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'modifier_vente/(\\w+)': async (id, body) => {
      console.log(`📥 Interception PUT /api/modifier_vente/${id}`);
      try {
        const result = await modifierVente(id, body);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur modifier_vente:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'assigner_categorie': async (body) => {
      console.log('📥 Interception PUT /api/assigner_categorie');
      try {
        const result = await assignerCategorie(body);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur assigner_categorie:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    }
  },
  DELETE: {
    'supprimer_client/(\\w+)': async (id) => {
      console.log(`📥 Interception DELETE /api/supprimer_client/${id}`);
      try {
        const result = await supprimerClient(id);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur supprimer_client:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'supprimer_fournisseur/(\\w+)': async (id) => {
      console.log(`📥 Interception DELETE /api/supprimer_fournisseur/${id}`);
      try {
        const result = await supprimerFournisseur(id);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur supprimer_fournisseur:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'supprimer_item/(\\w+)': async (id) => {
      console.log(`📥 Interception DELETE /api/supprimer_item/${id}`);
      try {
        const result = await supprimerItem(id);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur supprimer_item:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'supprimer_utilisateur/(\\w+)': async (id) => {
      console.log(`📥 Interception DELETE /api/supprimer_utilisateur/${id}`);
      try {
        const result = await supprimerUtilisateur(id);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur supprimer_utilisateur:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    },
    'supprimer_categorie/(\\w+)': async (id) => {
      console.log(`📥 Interception DELETE /api/supprimer_categorie/${id}`);
      try {
        const result = await supprimerCategorie(id);
        return {
          body: JSON.stringify(result),
          init: { status: result.status || 200, headers: { 'Content-Type': 'application/json' } }
        };
      } catch (error) {
        console.error('❌ Erreur supprimer_categorie:', error);
        return {
          body: JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }),
          init: { status: 500, headers: { 'Content-Type': 'application/json' } }
        };
      }
    }
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
    console.log(`📥 Interception ${method} ${requestUrl.pathname}`);
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
        console.error(`❌ Endpoint inconnu: ${endpoint}`);
        return new Response(JSON.stringify({ erreur: 'Endpoint inconnu', status: 404 }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (error) {
      console.error(`❌ Erreur interception ${method} ${requestUrl.pathname}:`, error);
      return new Response(JSON.stringify({ erreur: error.message || 'Erreur inconnue', status: 500 }), {
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
