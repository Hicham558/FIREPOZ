import { listeClients, listeFournisseurs } from './apiRoutes.js';

export async function fetchApi(url, options = {}) {
  if (url === '/liste_clients' && (!options.method || options.method === 'GET')) {
    const clients = await listeClients();
    return { ok: true, json: async () => clients };
  }

  if (url === '/liste_fournisseurs' && (!options.method || options.method === 'GET')) {
    const fournisseurs = await listeFournisseurs();
    return { ok: true, json: async () => fournisseurs };
  }

  return fetch(url, options);
}