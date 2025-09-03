import { getDb } from './db.js';

async function saveDbToIndexedDB(db) {
  console.log("Sauvegarde de la base dans IndexedDB...");
  try {
    const dbBinary = db.export();
    const request = indexedDB.open('gestionDB', 1);

    request.onupgradeneeded = () => {
      console.log("Création de la base IndexedDB");
      request.result.createObjectStore('databases');
    };

    await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const idb = request.result;
        const transaction = idb.transaction(['databases'], 'readwrite');
        const store = transaction.objectStore('databases');
        const putRequest = store.put(dbBinary, 'gestion.db');
        putRequest.onsuccess = () => {
          console.log("Base sauvegardée dans IndexedDB");
          resolve();
        };
        putRequest.onerror = () => reject(putRequest.error);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Erreur lors de la sauvegarde dans IndexedDB :", error);
    throw error;
  }
}

export async function listeTables() {
  try {
    console.log("Exécution de listeTables...");
    const db = await getDb();
    const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table'");
    const tables = [];
    while (stmt.step()) tables.push(stmt.getAsObject().name);
    stmt.free();
    console.log("Tables retournées :", tables);
    return tables;
  } catch (error) {
    console.error("Erreur listeTables :", error);
    return [];
  }
}

export async function listeClients() {
  try {
    console.log("Exécution de listeClients...");
    const db = await getDb();
    const stmtInfo = db.prepare("PRAGMA table_info(client)");
    const columns = [];
    while (stmtInfo.step()) {
      columns.push(stmtInfo.getAsObject().name);
    }
    stmtInfo.free();
    console.log("Colonnes de la table client :", columns);

    const stmt = db.prepare('SELECT numero_clt, nom, solde, reference, contact, adresse FROM client');
    const clients = [];
    while (stmt.step()) {
      const row = stmt.get();
      console.log("Client brut récupéré :", row);
      clients.push({
        numero_clt: row[0] !== null ? row[0] : '',
        nom: row[1] !== null ? row[1] : '',
        solde: row[2] !== null ? row[2] : '0,00',
        reference: row[3] !== null ? row[3] : '',
        contact: row[4] !== null ? row[4] : '',
        adresse: row[5] !== null ? row[5] : ''
      });
    }
    stmt.free();
    console.log("Clients formatés retournés :", clients);
    return clients;
  } catch (error) {
    console.error("Erreur listeClients :", error);
    return [];
  }
}

export async function listeFournisseurs() {
  try {
    console.log("Exécution de listeFournisseurs...");
    const db = await getDb();
    const stmtInfo = db.prepare("PRAGMA table_info(fournisseur)");
    const columns = [];
    while (stmtInfo.step()) {
      columns.push(stmtInfo.getAsObject().name);
    }
    stmtInfo.free();
    console.log("Colonnes de la table fournisseur :", columns);

    const stmt = db.prepare('SELECT numero_fou, nom, solde, reference, contact, adresse FROM fournisseur');
    const fournisseurs = [];
    while (stmt.step()) {
      const row = stmt.get();
      console.log("Fournisseur brut récupéré :", row);
      fournisseurs.push({
        numero_fou: row[0] !== null ? row[0] : '',
        nom: row[1] !== null ? row[1] : '',
        solde: row[2] !== null ? row[2] : '0,00',
        reference: row[3] !== null ? row[3] : '',
        contact: row[4] !== null ? row[4] : '',
        adresse: row[5] !== null ? row[5] : ''
      });
    }
    stmt.free();
    console.log("Fournisseurs formatés retournés :", fournisseurs);
    return fournisseurs;
  } catch (error) {
    console.error("Erreur listeFournisseurs :", error);
    return [];
  }
}

export async function listeUtilisateurs() {
  try {
    console.log("Exécution de listeUtilisateurs...");
    const db = await getDb();
    const stmtInfo = db.prepare("PRAGMA table_info(utilisateur)");
    const columns = [];
    while (stmtInfo.step()) {
      columns.push(stmtInfo.getAsObject().name);
    }
    stmtInfo.free();
    console.log("Colonnes de la table utilisateur :", columns);

    const stmt = db.prepare('SELECT numero_util, nom, statue FROM utilisateur ORDER BY nom');
    const utilisateurs = [];
    while (stmt.step()) {
      const row = stmt.get();
      console.log("Utilisateur brut récupéré :", row);
      utilisateurs.push({
        numero: row[0] !== null ? row[0] : '',
        nom: row[1] !== null ? row[1] : '',
        statut: row[2] !== null ? row[2] : ''
      });
    }
    stmt.free();
    console.log("Utilisateurs formatés retournés :", utilisateurs);
    return utilisateurs;
  } catch (error) {
    console.error("Erreur listeUtilisateurs :", error);
    return { erreur: error.message, status: 500 };
  }
}

export async function ajouterClient(data) {
  try {
    console.log("Exécution de ajouterClient avec data :", data);
    const db = await getDb();
    const { nom, contact, adresse } = data;

    if (!nom) {
      console.error("Erreur : Le champ nom est obligatoire");
      return { erreur: "Le champ nom est obligatoire", status: 400 };
    }

    const countStmt = db.prepare("SELECT COUNT(*) AS total FROM client");
    countStmt.step();
    const { total } = countStmt.getAsObject();
    countStmt.free();

    const reference = `C${total + 1}`;
    const solde = "0,00";

    const stmt = db.prepare(
      "INSERT INTO client (nom, solde, reference, contact, adresse) VALUES (?, ?, ?, ?, ?)"
    );
    stmt.run([nom, solde, reference, contact || null, adresse || null]);
    stmt.free();

    const idStmt = db.prepare("SELECT last_insert_rowid() AS id");
    idStmt.step();
    const { id } = idStmt.getAsObject();
    idStmt.free();

    await saveDbToIndexedDB(db);
    console.log("Client ajouté : ID =", id, ", Référence =", reference);
    return { statut: "Client ajouté", id, reference, status: 201 };
  } catch (error) {
    console.error("Erreur ajouterClient :", error);
    return { erreur: error.message, status: 500 };
  }
}

export async function ajouterFournisseur(data) {
  try {
    console.log("Exécution de ajouterFournisseur avec data :", data);
    const db = await getDb();
    const { nom, contact, adresse } = data;

    if (!nom) {
      console.error("Erreur : Le champ nom est obligatoire");
      return { erreur: "Le champ nom est obligatoire", status: 400 };
    }

    const countStmt = db.prepare("SELECT COUNT(*) AS total FROM fournisseur");
    countStmt.step();
    const { total } = countStmt.getAsObject();
    countStmt.free();

    const reference = `F${total + 1}`;
    const solde = "0,00";

    const stmt = db.prepare(
      "INSERT INTO fournisseur (nom, solde, reference, contact, adresse) VALUES (?, ?, ?, ?, ?)"
    );
    stmt.run([nom, solde, reference, contact || null, adresse || null]);
    stmt.free();

    const idStmt = db.prepare("SELECT last_insert_rowid() AS id");
    idStmt.step();
    const { id } = idStmt.getAsObject();
    idStmt.free();

    await saveDbToIndexedDB(db);
    console.log("Fournisseur ajouté : ID =", id, ", Référence =", reference);
    return { statut: "Fournisseur ajouté", id, reference, status: 201 };
  } catch (error) {
    console.error("Erreur ajouterFournisseur :", error);
    return { erreur: error.message, status: 500 };
  }
}

export async function ajouterUtilisateur(data) {
  try {
    console.log("Exécution de ajouterUtilisateur avec data :", data);
    const db = await getDb();
    const { nom, password2, statue } = data;

    if (!nom || !password2 || !statue) {
      console.error("Erreur : Champs obligatoires manquants (nom, password2, statue)");
      return { erreur: "Champs obligatoires manquants (nom, password2, statue)", status: 400 };
    }

    if (!['admin', 'emplo'].includes(statue)) {
      console.error("Erreur : Statue invalide (doit être 'admin' ou 'emplo')");
      return { erreur: "Statue invalide (doit être 'admin' ou 'emplo')", status: 400 };
    }

    const stmt = db.prepare(
      "INSERT INTO utilisateur (nom, password2, statue) VALUES (?, ?, ?)"
    );
    stmt.run([nom, password2, statue]);
    stmt.free();

    const idStmt = db.prepare("SELECT last_insert_rowid() AS id");
    idStmt.step();
    const { id } = idStmt.getAsObject();
    idStmt.free();

    await saveDbToIndexedDB(db);
    console.log("Utilisateur ajouté : ID =", id);
    return { statut: "Utilisateur ajouté", id, status: 201 };
  } catch (error) {
    console.error("Erreur ajouterUtilisateur :", error);
    return { erreur: error.message, status: 500 };
  }
}

export async function modifierClient(numero_clt, data) {
  try {
    console.log("Exécution de modifierClient :", numero_clt, data);
    const db = await getDb();
    const { nom, contact, adresse } = data;

    if (!nom) {
      console.error("Erreur : Le champ nom est obligatoire");
      return { erreur: "Le champ nom est obligatoire", status: 400 };
    }

    const stmt = db.prepare(
      'UPDATE client SET nom = ?, contact = ?, adresse = ? WHERE numero_clt = ?'
    );
    stmt.run([nom, contact || null, adresse || null, numero_clt]);
    const changes = db.getRowsModified();
    stmt.free();

    await saveDbToIndexedDB(db);
    console.log("Client modifié : changements =", changes);
    return { statut: changes > 0 ? 'Client modifié' : 'Aucun client modifié', status: 200 };
  } catch (error) {
    console.error("Erreur modifierClient :", error);
    return { erreur: error.message, status: 500 };
  }
}

export async function modifierFournisseur(numero_fou, data) {
  try {
    console.log("Exécution de modifierFournisseur :", numero_fou, data);
    const db = await getDb();
    const { nom, contact, adresse } = data;

    if (!nom) {
      console.error("Erreur : Le champ nom est obligatoire");
      return { erreur: "Le champ nom est obligatoire", status: 400 };
    }

    const stmt = db.prepare(
      'UPDATE fournisseur SET nom = ?, contact = ?, adresse = ? WHERE numero_fou = ?'
    );
    stmt.run([nom, contact || null, adresse || null, numero_fou]);
    const changes = db.getRowsModified();
    stmt.free();

    await saveDbToIndexedDB(db);
    console.log("Fournisseur modifié : changements =", changes);
    return { statut: changes > 0 ? 'Fournisseur modifié' : 'Aucun fournisseur modifié', status: 200 };
  } catch (error) {
    console.error("Erreur modifierFournisseur :", error);
    return { erreur: error.message, status: 500 };
  }
}

export async function modifierUtilisateur(numero_util, data) {
  try {
    console.log("Exécution de modifierUtilisateur :", numero_util, data);
    const db = await getDb();
    const { nom, password2, statue } = data;

    if (!nom || !statue) {
      console.error("Erreur : Champs obligatoires manquants (nom, statue)");
      return { erreur: "Champs obligatoires manquants (nom, statue)", status: 400 };
    }

    if (!['admin', 'emplo'].includes(statue)) {
      console.error("Erreur : Statue invalide (doit être 'admin' ou 'emplo')");
      return { erreur: "Statue invalide (doit être 'admin' ou 'emplo')", status: 400 };
    }

    let stmt;
    if (password2) {
      stmt = db.prepare(
        'UPDATE utilisateur SET nom = ?, password2 = ?, statue = ? WHERE numero_util = ?'
      );
      stmt.run([nom, password2, statue, numero_util]);
    } else {
      stmt = db.prepare(
        'UPDATE utilisateur SET nom = ?, statue = ? WHERE numero_util = ?'
      );
      stmt.run([nom, statue, numero_util]);
    }
    const changes = db.getRowsModified();
    stmt.free();

    if (changes === 0) {
      console.error("Erreur : Utilisateur non trouvé");
      return { erreur: "Utilisateur non trouvé", status: 404 };
    }

    await saveDbToIndexedDB(db);
    console.log("Utilisateur modifié : changements =", changes);
    return { statut: "Utilisateur modifié", status: 200 };
  } catch (error) {
    console.error("Erreur modifierUtilisateur :", error);
    return { erreur: error.message, status: 500 };
  }
}

export async function supprimerClient(numero_clt) {
  try {
    console.log("Exécution de supprimerClient :", numero_clt);
    const db = await getDb();
    const stmt = db.prepare('DELETE FROM client WHERE numero_clt = ?');
    stmt.run([numero_clt]);
    const changes = db.getRowsModified();
    stmt.free();

    if (changes === 0) {
      console.error("Erreur : Client non trouvé");
      return { erreur: "Client non trouvé", status: 404 };
    }

    await saveDbToIndexedDB(db);
    console.log("Client supprimé : changements =", changes);
    return { statut: "Client supprimé", status: 200 };
  } catch (error) {
    console.error("Erreur supprimerClient :", error);
    return { erreur: error.message, status: 500 };
  }
}

export async function supprimerFournisseur(numero_fou) {
  try {
    console.log("Exécution de supprimerFournisseur :", numero_fou);
    const db = await getDb();
    const stmt = db.prepare('DELETE FROM fournisseur WHERE numero_fou = ?');
    stmt.run([numero_fou]);
    const changes = db.getRowsModified();
    stmt.free();

    if (changes === 0) {
      console.error("Erreur : Fournisseur non trouvé");
      return { erreur: "Fournisseur non trouvé", status: 404 };
    }

    await saveDbToIndexedDB(db);
    console.log("Fournisseur supprimé : changements =", changes);
    return { statut: "Fournisseur supprimé", status: 200 };
  } catch (error) {
    console.error("Erreur supprimerFournisseur :", error);
    return { erreur: error.message, status: 500 };
  }
}

export async function supprimerUtilisateur(numero_util) {
  try {
    console.log("Exécution de supprimerUtilisateur :", numero_util);
    const db = await getDb();
    const stmt = db.prepare('DELETE FROM utilisateur WHERE numero_util = ?');
    stmt.run([numero_util]);
    const changes = db.getRowsModified();
    stmt.free();

    if (changes === 0) {
      console.error("Erreur : Utilisateur non trouvé");
      return { erreur: "Utilisateur non trouvé", status: 404 };
    }

    await saveDbToIndexedDB(db);
    console.log("Utilisateur supprimé : changements =", changes);
    return { statut: "Utilisateur supprimé", status: 200 };
  } catch (error) {
    console.error("Erreur supprimerUtilisateur :", error);
    return { erreur: error.message, status: 500 };
  }
}
