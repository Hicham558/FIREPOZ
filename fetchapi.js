import { 
  listeClients, 
  listeFournisseurs, 
  listeTables, 
  ajouterClient, 
  modifierClient, 
  supprimerClient 
} from './apiRoutes.js';

export async function fetchApi(url, options = {}) {
  const method = options.method ? options.method.toUpperCase() : "GET";

  // ---------------------- LECTURE ----------------------
  if (url === '/liste_clients' && method === 'GET') {
    const clients = await listeClients();
    return { ok: true, json: async () => clients };
  }

  if (url === '/liste_fournisseurs' && method === 'GET') {
    const fournisseurs = await listeFournisseurs();
    return { ok: true, json: async () => fournisseurs };
  }

  if (url === '/tables' && method === 'GET') {
    const tables = await listeTables();
    return { ok: true, json: async () => tables };
  }

  // ---------------------- AJOUT ----------------------
  if (url === '/ajouter_client' && method === 'POST') {
    const data = JSON.parse(options.body || "{}");
    const res = await ajouterClient(data);
    return { ok: !res.erreur, json: async () => res };
  }

  // ---------------------- MODIFICATION ----------------------
  if (url.startsWith('/modifier_client/') && method === 'PUT') {
    const numero_clt = url.split('/').pop();
    const data = JSON.parse(options.body || "{}");
    const res = await modifierClient(numero_clt, data);
    return { ok: !res.erreur, json: async () => res };
  }

  // ---------------------- SUPPRESSION ----------------------
  if (url.startsWith('/supprimer_client/') && method === 'DELETE') {
    const numero_clt = url.split('/').pop();
    const res = await supprimerClient(numero_clt);
    return { ok: !res.erreur, json: async () => res };
  }

  // ---------------------- FALLBACK ----------------------
  return fetch(url, options);
}
