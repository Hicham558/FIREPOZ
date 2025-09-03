import { getDb } from './db.js';

// Sauvegarder la base dans IndexedDB
async function saveDbToIndexedDB(db) {
  try {
    console.log("Sauvegarde dans IndexedDB...");
    const dbBinary = db.export();
    const request = indexedDB.open('GestionDB', 1);
    request.onupgradeneeded = event => {
      event.target.result.createObjectStore('databases', { keyPath: 'name' });
    };
    return new Promise((resolve, reject) => {
      request.onsuccess = event => {
        const idb = event.target.result;
        const transaction = idb.transaction(['databases'], 'readwrite');
        const store = transaction.objectStore('databases');
        store.put({ name: 'gestion.db', data: dbBinary });
        transaction.oncomplete = () => {
          console.log("Sauvegarde IndexedDB réussie");
          resolve();
        };
        transaction.onerror = () => reject(new Error('Erreur IndexedDB'));
      };
      request.onerror = () => reject(new Error('Erreur ouverture IndexedDB'));
    });
  } catch (error) {
    console.error("Erreur saveDbToIndexedDB :", error);
    throw error;
  }
}

// ---------------------- LISTES ----------------------
export async function listeClients() {
  const db = await getDb();
  const stmt = db.prepare(
    'SELECT numero_clt, nom, solde, reference, contact, adresse FROM client ORDER BY nom'
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
  console.log("Clients retournés :", clients);
  return clients;
}

export async function listeFournisseurs() {
  const db = await getDb();
  const stmt = db.prepare(
    'SELECT numero_fou, nom, solde, reference, contact, adresse FROM fournisseur ORDER BY nom'
  );
  let fournisseurs = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    fournisseurs.push({
      numero_fou: row.numero_fou,
      nom: row.nom || "",
      solde: row.solde || "0,00",
      reference: row.reference || "",
      contact: row.contact || "",
      adresse: row.adresse || ""
    });
  }
  stmt.free();
  console.log("Fournisseurs retournés :", fournisseurs);
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
  console.log("Tables retournées :", tables);
  return tables;
}

// ---------------------- CRUD CLIENT ----------------------
export async function ajouterClient(data) {
  const db = await getDb();
  const { nom, contact, adresse } = data;

  if (!nom) {
    console.log("Erreur : Le champ nom est obligatoire");
    return { erreur: "Le champ nom est obligatoire" };
  }

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

  const idStmt = db.prepare("SELECT last_insert_rowid() AS id");
  idStmt.step();
  const { id } = idStmt.getAsObject();
  idStmt.free();

  await saveDbToIndexedDB(db); // Sauvegarder après ajout

  console.log("Client ajouté : ID =", id, ", Référence =", reference);
  return { statut: "Client ajouté", id, reference }; // id est numero_clt
}

export async function modifierClient(numero_clt, data) {
  const db = await getDb();
  const { nom, contact, adresse } = data;

  if (!nom) {
    console.log("Erreur : Le champ nom est obligatoire");
    return { erreur: "Le champ nom est obligatoire" };
  }

  db.run(
    "UPDATE client SET nom = ?, contact = ?, adresse = ? WHERE numero_clt = ?",
    [nom, contact, adresse, numero_clt]
  );

  const stmt = db.prepare("SELECT changes() AS modif");
  stmt.step();
  const { modif } = stmt.getAsObject();
  stmt.free();

  if (modif === 0) {
    console.log("Erreur : Client non trouvé, numero_clt =", numero_clt);
    return { erreur: "Client non trouvé" };
  }

  await saveDbToIndexedDB(db); // Sauvegarder après modification

  console.log("Client modifié : numero_clt =", numero_clt);
  return { statut: "Client modifié" };
}

export async function supprimerClient(numero_clt) {
  const db = await getDb();

  db.run("DELETE FROM client WHERE numero_clt = ?", [numero_clt]);

  const stmt = db.prepare("SELECT changes() AS suppr");
  stmt.step();
  const { suppr } = stmt.getAsObject();
  stmt.free();

  if (suppr === 0) {
    console.log("Erreur : Client non trouvé, numero_clt =", numero_clt);
    return { erreur: "Client non trouvé" };
  }

  await saveDbToIndexedDB(db); // Sauvegarder après suppression

  console.log("Client supprimé : numero_clt =", numero_clt);
  return { statut: "Client supprimé" };
}

// ---------------------- CRUD FOURNISSEUR ----------------------
export async function ajouterFournisseur(data) {
  const db = await getDb();
  const { nom, contact, adresse } = data;

  if (!nom) {
    console.log("Erreur : Le champ nom est obligatoire");
    return { erreur: "Le champ nom est obligatoire" };
  }

  const countStmt = db.prepare("SELECT COUNT(*) AS total FROM fournisseur");
  countStmt.step();
  const { total } = countStmt.getAsObject();
  countStmt.free();

  const reference = `F${total + 1}`;
  const solde = "0,00";

  db.run(
    "INSERT INTO fournisseur (nom, solde, reference, contact, adresse) VALUES (?, ?, ?, ?, ?)",
    [nom, solde, reference, contact, adresse]
  );

  const idStmt = db.prepare("SELECT last_insert_rowid() AS id");
  idStmt.step();
  const { id } = idStmt.getAsObject();
  idStmt.free();

  await saveDbToIndexedDB(db); // Sauvegarder après ajout

  console.log("Fournisseur ajouté : ID =", id, ", Référence =", reference);
  return { statut: "Fournisseur ajouté", id, reference }; // id est numero_fou
}

export async function modifierFournisseur(numero_fou, data) {
  const db = await getDb();
  const { nom, contact, adresse } = data;

  if (!nom) {
    console.log("Erreur : Le champ nom est obligatoire");
    return { erreur: "Le champ nom est obligatoire" };
  }

  db.run(
    "UPDATE fournisseur SET nom = ?, contact = ?, adresse = ? WHERE numero_fou = ?",
    [nom, contact, adresse, numero_fou]
  );

  const stmt = db.prepare("SELECT changes() AS modif");
  stmt.step();
  const { modif } = stmt.getAsObject();
  stmt.free();

  if (modif === 0) {
    console.log("Erreur : Fournisseur non trouvé, numero_fou =", numero_fou);
    return { erreur: "Fournisseur non trouvé" };
  }

  await saveDbToIndexedDB(db); // Sauvegarder après modification

  console.log("Fournisseur modifié : numero_fou =", numero_fou);
  return { statut: "Fournisseur modifié" };
}

export async function supprimerFournisseur(numero_fou) {
  const db = await getDb();

  db.run("DELETE FROM fournisseur WHERE numero_fou = ?", [numero_fou]);

  const stmt = db.prepare("SELECT changes() AS suppr");
  stmt.step();
  const { suppr } = stmt.getAsObject();
  stmt.free();

  if (suppr === 0) {
    console.log("Erreur : Fournisseur non trouvé, numero_fou =", numero_fou);
    return { erreur: "Fournisseur non trouvé" };
  }

  await saveDbToIndexedDB(db); // Sauvegarder après suppression

  console.log("Fournisseur supprimé : numero_fou =", numero_fou);
  return { statut: "Fournisseur supprimé" };
}
