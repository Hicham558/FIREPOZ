import { 
  listeClients, 
  listeFournisseurs, 
  listeTables, 
  ajouterClient, 
  modifierClient, 
  supprimerClient,
  ajouterFournisseur,
  modifierFournisseur,
  supprimerFournisseur,
  listeUtilisateurs,
  ajouterUtilisateur,
  modifierUtilisateur,
  supprimerUtilisateur
} from './apiRoutes.js';

export async function fetchApi(url, options = {}) {
  console.log("fetchApi appelé avec URL:", url, "Options:", options);
  const method = options.method ? options.method.toUpperCase() : "GET";

  // Vérifier si la requête est interceptée localement
  console.log("Interception locale pour URL:", url, "Method:", method);

  // Endpoint de test
  if (url === '/test' && method === 'GET') {
    console.log("Test de connexion réussi");
    return { ok: true, json: async () => ({ message: "Connexion réussie !" }) };
  }

  // ---------------------- LECTURE ----------------------
  if (url === '/tables' && method === 'GET') {
    console.log("Appel de listeTables");
    const tables = await listeTables();
    console.log("Résultat listeTables:", tables);
    return { ok: true, json: async () => tables };
  }

  if (url === '/liste_clients' && method === 'GET') {
    console.log("Appel de listeClients");
    const clients = await listeClients();
    console.log("Résultat listeClients:", clients);
    return { ok: true, json: async () => clients };
  }

  if (url === '/liste_fournisseurs' && method === 'GET') {
    console.log("Appel de listeFournisseurs");
    const fournisseurs = await listeFournisseurs();
    console.log("Résultat listeFournisseurs:", fournisseurs);
    return { ok: true, json: async () => fournisseurs };
  }

  if (url === '/liste_utilisateurs' && method === 'GET') {
    console.log("Appel de listeUtilisateurs");
    const utilisateurs = await listeUtilisateurs();
    console.log("Résultat listeUtilisateurs:", utilisateurs);
    return { ok: !utilisateurs.erreur, json: async () => utilisateurs };
  }

  // ---------------------- AJOUT ----------------------
  if (url === '/ajouter_client' && method === 'POST') {
    const data = JSON.parse(options.body || "{}");
    console.log("Appel de ajouterClient avec data:", data);
    const res = await ajouterClient(data);
    console.log("Résultat ajouterClient:", res);
    return { ok: !res.erreur, json: async () => res };
  }

  if (url === '/ajouter_fournisseur' && method === 'POST') {
    const data = JSON.parse(options.body || "{}");
    console.log("Appel de ajouterFournisseur avec data:", data);
    const res = await ajouterFournisseur(data);
    console.log("Résultat ajouterFournisseur:", res);
    return { ok: !res.erreur, json: async () => res };
  }

  if (url === '/ajouter_utilisateur' && method === 'POST') {
    const data = JSON.parse(options.body || "{}");
    console.log("Appel de ajouterUtilisateur avec data:", data);
    const res = await ajouterUtilisateur(data);
    console.log("Résultat ajouterUtilisateur:", res);
    return { ok: !res.erreur, json: async () => res };
  }

  // ---------------------- MODIFICATION ----------------------
  if (url.startsWith('/modifier_client/') && method === 'PUT') {
    const numero_clt = url.split('/').pop();
    const data = JSON.parse(options.body || "{}");
    console.log("Appel de modifierClient avec numero_clt:", numero_clt, "data:", data);
    const res = await modifierClient(numero_clt, data);
    console.log("Résultat modifierClient:", res);
    return { ok: !res.erreur, json: async () => res };
  }

  if (url.startsWith('/modifier_fournisseur/') && method === 'PUT') {
    const numero_fou = url.split('/').pop();
    const data = JSON.parse(options.body || "{}");
    console.log("Appel de modifierFournisseur avec numero_fou:", numero_fou, "data:", data);
    const res = await modifierFournisseur(numero_fou, data);
    console.log("Résultat modifierFournisseur:", res);
    return { ok: !res.erreur, json: async () => res };
  }

  if (url.startsWith('/modifier_utilisateur/') && method === 'PUT') {
    const numero_util = url.split('/').pop();
    const data = JSON.parse(options.body || "{}");
    console.log("Appel de modifierUtilisateur avec numero_util:", numero_util, "data:", data);
    const res = await modifierUtilisateur(numero_util, data);
    console.log("Résultat modifierUtilisateur:", res);
    return { ok: !res.erreur, json: async () => res };
  }

  // ---------------------- SUPPRESSION ----------------------
  if (url.startsWith('/supprimer_client/') && method === 'DELETE') {
    const numero_clt = url.split('/').pop();
    console.log("Appel de supprimerClient avec numero_clt:", numero_clt);
    const res = await supprimerClient(numero_clt);
    console.log("Résultat supprimerClient:", res);
    return { ok: !res.erreur, json: async () => res };
  }

  if (url.startsWith('/supprimer_fournisseur/') && method === 'DELETE') {
    const numero_fou = url.split('/').pop();
    console.log("Appel de supprimerFournisseur avec numero_fou:", numero_fou);
    const res = await supprimerFournisseur(numero_fou);
    console.log("Résultat supprimerFournisseur:", res);
    return { ok: !res.erreur, json: async () => res };
  }

  if (url.startsWith('/supprimer_utilisateur/') && method === 'DELETE') {
    const numero_util = url.split('/').pop();
    console.log("Appel de supprimerUtilisateur avec numero_util:", numero_util);
    const res = await supprimerUtilisateur(numero_util);
    console.log("Résultat supprimerUtilisateur:", res);
    return { ok: !res.erreur, json: async () => res };
  }

  // ---------------------- FALLBACK ----------------------
  console.warn("Requête non interceptée, tentative d'envoi au serveur:", url);
  throw new Error(`Requête non prise en charge : ${method} ${url}`);
}
