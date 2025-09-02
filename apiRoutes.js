import { getDb } from './db.js';

// ---------------------- LISTES ----------------------
export async function listeClients() {
  const db = await getDb();
  const stmt = db.prepare(
    'SELECT numero_clt, nom, solde, reference, contact , adresse FROM client ORDER BY nom'
  );
  let clients = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    clients.push({
      numero_clt: row.numero_clt,
      nom: row.nom || "",
      solde: row.solde || "0,00",
      reference: row.reference || "",
      contact: row.contact || "",
      adresse: row.adresse || ""
    });
  }
  stmt.free();
  return clients;
}

export async function listeFournisseurs() {
  const db = await getDb();
  const stmt = db.prepare(
    'SELECT numero_fou, nom, solde , reference , contact , adresse FROM fournisseur ORDER BY nom'
  );
  let fournisseurs = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    fournisseurs.push({
      numero_fou: row.numero_fou || "",
      nom: row.nom || "",
      solde: row.solde || "0,00",
      reference: row.reference || "",
      contact: row.contact || "",
      adresse: row.adresse || ""
    });
  }
  stmt.free();
  return fournisseurs;
}

export async function listeTables() {
  const db = await getDb();
  const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table'");
  let tables = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    tables.push(row.name);
  }
  stmt.free();
  return tables;
}

// ---------------------- CRUD CLIENT ----------------------

// Ajouter un client
export async function ajouterClient(data) {
  const db = await getDb();
  const { nom, contact, adresse } = data;

  if (!nom) {
    return { erreur: "Le champ nom est obligatoire" };
  }

  // Compter les clients existants
  const countStmt = db.prepare("SELECT COUNT(*) AS total FROM client");
  countStmt.step();
  const { total } = countStmt.getAsObject();
  countStmt.free();

  const reference = `C${total + 1}`;
  const solde = "0,00";

  db.run(
    "INSERT INTO client (nom, solde, reference, contact, adresse) VALUES (?, ?, ?, ?, ?)",
    [nom, solde, reference, contact, adresse]
  );

  // Récupérer l'ID inséré
  const idStmt = db.prepare("SELECT last_insert_rowid() AS id");
  idStmt.step();
  const { id } = idStmt.getAsObject();
  idStmt.free();

  return { statut: "Client ajouté", id, reference };
}

// Modifier un client
export async function modifierClient(numero_clt, data) {
  const db = await getDb();
  const { nom, contact, adresse } = data;

  if (!nom) {
    return { erreur: "Le champ nom est obligatoire" };
  }

  db.run(
    "UPDATE client SET nom = ?, contact = ?, adresse = ? WHERE numero_clt = ?",
    [nom, contact, adresse, numero_clt]
  );

  // Vérifier si la mise à jour a eu lieu
  const stmt = db.prepare("SELECT changes() AS modif");
  stmt.step();
  const { modif } = stmt.getAsObject();
  stmt.free();

  if (modif === 0) {
    return { erreur: "Client non trouvé" };
  }

  return { statut: "Client modifié" };
}

// Supprimer un client
export async function supprimerClient(numero_clt) {
  const db = await getDb();

  db.run("DELETE FROM client WHERE numero_clt = ?", [numero_clt]);

  // Vérifier si la suppression a eu lieu
  const stmt = db.prepare("SELECT changes() AS suppr");
  stmt.step();
  const { suppr } = stmt.getAsObject();
  stmt.free();

  if (suppr === 0) {
    return { erreur: "Client non trouvé" };
  }

  return { statut: "Client supprimé" };
}
