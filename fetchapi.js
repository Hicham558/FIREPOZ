import { listeClients, listeFournisseurs, listeTables } from './apiRoutes.js';

export async function fetchApi(url, options = {}) {
  if (url === '/liste_clients' && (!options.method || options.method === 'GET')) {
    const clients = await listeClients();
    return { ok: true, json: async () => clients };
  }

  if (url === '/liste_fournisseurs' && (!options.method || options.method === 'GET')) {
    const fournisseurs = await listeFournisseurs();
    return { ok: true, json: async () => fournisseurs };
  }

  if (url === '/tables' && (!options.method || options.method === 'GET')) {
    const tables = await listeTables();
    return { ok: true, json: async () => tables };
  }

  return fetch(url, options);
}