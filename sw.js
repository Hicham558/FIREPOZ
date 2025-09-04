// sw.js
importScripts('./apiRoutes.js');

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // On n’intercepte que les appels vers "localhostDB"
  if (url.origin.includes("localhostDB")) {
    event.respondWith(handleRequest(url, event.request));
  }
});

async function handleRequest(url, request) {
  const method = request.method.toUpperCase();
  const path = url.pathname;
  let res;

  try {
    // ----------- TEST -----------
    if (path === "/test" && method === "GET") {
      return jsonResponse({ message: "Connexion réussie !" }, 200);
    }

    // ----------- LECTURE -----------
    if (path === "/tables" && method === "GET") {
      res = await listeTables();
      return jsonResponse(res, 200);
    }
    if (path === "/liste_clients" && method === "GET") {
      res = await listeClients();
      return jsonResponse(res, 200);
    }
    if (path === "/liste_fournisseurs" && method === "GET") {
      res = await listeFournisseurs();
      return jsonResponse(res, 200);
    }
    if (path === "/liste_utilisateurs" && method === "GET") {
      res = await listeUtilisateurs();
      return jsonResponse(res, res.erreur ? 400 : 200);
    }
    if (path === "/liste_produits" && method === "GET") {
      res = await listeProduits();
      return jsonResponse(res, res.erreur ? 400 : 200);
    }
    if (path.startsWith("/dashboard") && method === "GET") {
      const period = url.searchParams.get("period") || "day";
      res = await dashboard(period);
      return jsonResponse(res, res.erreur ? 400 : 200);
    }

    // ----------- AJOUT -----------
    if (path === "/ajouter_client" && method === "POST") {
      const body = await request.json();
      res = await ajouterClient(body);
      return jsonResponse(res, res.erreur ? 400 : 201);
    }
    if (path === "/ajouter_fournisseur" && method === "POST") {
      const body = await request.json();
      res = await ajouterFournisseur(body);
      return jsonResponse(res, res.erreur ? 400 : 201);
    }
    if (path === "/ajouter_utilisateur" && method === "POST") {
      const body = await request.json();
      res = await ajouterUtilisateur(body);
      return jsonResponse(res, res.erreur ? 400 : 201);
    }
    if (path === "/ajouter_item" && method === "POST") {
      const body = await request.json();
      res = await ajouterItem(body);
      return jsonResponse(res, res.erreur ? 400 : 201);
    }

    // ----------- MODIFICATION -----------
    if (path.startsWith("/modifier_client/") && method === "PUT") {
      const id = path.split("/").pop();
      const body = await request.json();
      res = await modifierClient(id, body);
      return jsonResponse(res, res.erreur ? 400 : 200);
    }
    if (path.startsWith("/modifier_fournisseur/") && method === "PUT") {
      const id = path.split("/").pop();
      const body = await request.json();
      res = await modifierFournisseur(id, body);
      return jsonResponse(res, res.erreur ? 400 : 200);
    }
    if (path.startsWith("/modifier_utilisateur/") && method === "PUT") {
      const id = path.split("/").pop();
      const body = await request.json();
      res = await modifierUtilisateur(id, body);
      return jsonResponse(res, res.erreur ? 400 : 200);
    }
    if (path.startsWith("/modifier_item/") && method === "PUT") {
      const id = path.split("/").pop();
      const body = await request.json();
      res = await modifierItem(id, body);
      return jsonResponse(res, res.erreur ? 400 : 200);
    }

    // ----------- SUPPRESSION -----------
    if (path.startsWith("/supprimer_client/") && method === "DELETE") {
      const id = path.split("/").pop();
      res = await supprimerClient(id);
      return jsonResponse(res, res.erreur ? 400 : 200);
    }
    if (path.startsWith("/supprimer_fournisseur/") && method === "DELETE") {
      const id = path.split("/").pop();
      res = await supprimerFournisseur(id);
      return jsonResponse(res, res.erreur ? 400 : 200);
    }
    if (path.startsWith("/supprimer_utilisateur/") && method === "DELETE") {
      const id = path.split("/").pop();
      res = await supprimerUtilisateur(id);
      return jsonResponse(res, res.erreur ? 400 : 200);
    }
    if (path.startsWith("/supprimer_item/") && method === "DELETE") {
      const id = path.split("/").pop();
      res = await supprimerItem(id);
      return jsonResponse(res, res.erreur ? 400 : 200);
    }

    // ----------- DEFAULT -----------
    return jsonResponse({ erreur: `Non géré : ${method} ${path}` }, 404);

  } catch (err) {
    return jsonResponse({ erreur: err.message }, 500);
  }
}

// Helper pour uniformiser les réponses
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
