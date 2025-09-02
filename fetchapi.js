//fetchapi.js

import * as api from './apiRoutes.js';

export async function fetchApi(url, options = {}) {
if (url === '/liste_clients' && (!options.method || options.method === 'GET')) {
const clients = api.listeClients();
return { ok: true, json: async () => clients };
}

if (url === '/liste_fournisseurs' && (!options.method || options.method === 'GET')) {
const fournisseurs = api.listeFournisseurs();
return { ok: true, json: async () => fournisseurs };
}

// sinon, faire un fetch natif
return fetch(url, options);
}