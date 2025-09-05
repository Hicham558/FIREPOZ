import { getDb } from './db.js';

// Utility functions for decimal conversion
function toDotDecimal(value) {
  if (!value || typeof value !== 'string') return 0.0;
  return parseFloat(value.replace(',', '.').replace(/[^0-9.]/g, '')) || 0.0;
}

function toCommaDecimal(value) {
  if (value == null || isNaN(value)) return '0,00';
  return value.toFixed(2).replace('.', ',');
}

// Calculate EAN-13 check digit
function calculateEan13CheckDigit(code12) {
  const digits = code12.split('').map(Number);
  const oddSum = digits.filter((_, i) => i % 2 === 0).reduce((sum, d) => sum + d, 0);
  const evenSum = digits.filter((_, i) => i % 2 === 1).reduce((sum, d) => sum + d, 0);
  const total = oddSum * 3 + evenSum;
  const nextMultipleOf10 = Math.ceil(total / 10) * 10;
  return nextMultipleOf10 - total;
}

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

export async function listeProduits() {
  try {
    console.log("Exécution de listeProduits...");
    const db = await getDb();
    const stmtInfo = db.prepare("PRAGMA table_info(item)");
    const columns = [];
    while (stmtInfo.step()) {
      columns.push(stmtInfo.getAsObject().name);
    }
    stmtInfo.free();
    console.log("Colonnes de la table item :", columns);

    const stmt = db.prepare('SELECT numero_item, bar, designation, qte, prix, prixba, ref FROM item ORDER BY designation');
    const produits = [];
    while (stmt.step()) {
      const row = stmt.get();
      console.log("Produit brut récupéré :", row);
      const prixFloat = toDotDecimal(row[4]);
      const prixbaFloat = toDotDecimal(row[5]);
      produits.push({
        numero_item: row[0] !== null ? row[0] : '',
        bar: row[1] !== null ? row[1] : '',
        designation: row[2] !== null ? row[2] : '',
        qte: row[3] !== null ? parseInt(row[3]) : 0,
        prix: row[4] !== null ? row[4] : '0,00',
        prixba: row[5] !== null ? row[5] : '0,00',
        ref: row[6] !== null ? row[6] : '',
        prix_num: prixFloat,
        prixba_num: prixbaFloat,
        prix_fmt: toCommaDecimal(prixFloat),
        prixba_fmt: toCommaDecimal(prixbaFloat),
        qte_fmt: `${parseInt(row[3]) || 0}`
      });
    }
    stmt.free();
    console.log("Produits formatés retournés :", produits);
    return produits;
  } catch (error) {
    console.error("Erreur listeProduits :", error);
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

export async function ajouterItem(data) {
  try {
    console.log("Exécution de ajouterItem avec data :", data);
    const db = await getDb();
    const { designation, bar, prix, qte, prixba, ref } = data;

    // Validate required fields
    if (!designation || prix == null || qte == null) {
      console.error("Erreur : Champs obligatoires manquants (designation, prix, qte)");
      return { erreur: "Champs obligatoires manquants (designation, prix, qte)", status: 400 };
    }

    const prixFloat = toDotDecimal(prix);
    const qteInt = parseInt(qte) || 0;
    const prixbaStr = prixba != null ? toCommaDecimal(toDotDecimal(prixba)) : null;

    if (prixFloat < 0 || qteInt < 0) {
      console.error("Erreur : Le prix et la quantité doivent être positifs");
      return { erreur: "Le prix et la quantité doivent être positifs", status: 400 };
    }

    // Start a transaction
    db.run('BEGIN TRANSACTION');

    try {
      // Check barcode uniqueness if provided
      if (bar) {
        const stmtBar = db.prepare('SELECT 1 FROM item WHERE bar = ?');
        stmtBar.step([bar]);
        const exists = stmtBar.get();
        stmtBar.free();
        if (exists) {
          console.error("Erreur : Ce code-barres existe déjà");
          db.run('ROLLBACK');
          return { erreur: "Ce code-barres existe déjà", status: 409 };
        }
      }

      // Generate unique ref
      const stmtRefs = db.prepare('SELECT ref FROM item WHERE ref LIKE "P%"');
      const refs = [];
      while (stmtRefs.step()) {
        const { ref } = stmtRefs.getAsObject();
        if (ref && ref.match(/^P\d+$/)) {
          refs.push(parseInt(ref.slice(1)));
        }
      }
      stmtRefs.free();
      const nextNumber = refs.length > 0 ? Math.max(...refs) + 1 : 1;
      const generatedRef = `P${nextNumber}`;

      // Generate unique barcode if not provided
      let finalBar = bar || null;
      if (!bar) {
        const code12 = `1${nextNumber.toString().padStart(11, '0')}`;
        const checkDigit = calculateEan13CheckDigit(code12);
        finalBar = `${code12}${checkDigit}`;
        
        // Verify generated barcode uniqueness
        const stmtCheckBar = db.prepare('SELECT 1 FROM item WHERE bar = ?');
        stmtCheckBar.step([finalBar]);
        const barExists = stmtCheckBar.get();
        stmtCheckBar.free();
        if (barExists) {
          console.error("Erreur : Le code EAN-13 généré existe déjà");
          db.run('ROLLBACK');
          return { erreur: "Le code EAN-13 généré existe déjà", status: 409 };
        }
      }

      // Insert item
      const stmtInsert = db.prepare(`
        INSERT INTO item (designation, bar, prix, qte, prixba, ref)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmtInsert.run([designation, finalBar, toCommaDecimal(prixFloat), qteInt, prixbaStr, generatedRef]);
      stmtInsert.free();

      // Get inserted ID
      const idStmt = db.prepare('SELECT last_insert_rowid() AS id');
      idStmt.step();
      const { id } = idStmt.getAsObject();
      idStmt.free();

      // Commit transaction
      db.run('COMMIT');

      await saveDbToIndexedDB(db);
      console.log("Produit ajouté : ID =", id, ", Référence =", generatedRef, ", Code-barres =", finalBar || 'aucun');
      return { statut: "Item ajouté", id, ref: generatedRef, bar: finalBar || 'aucun', status: 201 };
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error("Erreur ajouterItem :", error);
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

export async function modifierItem(numero_item, data) {
  try {
    console.log("Exécution de modifierItem :", numero_item, data);
    const db = await getDb();
    const { designation, bar, prix, qte, prixba } = data;

    if (!designation || !bar || prix == null || qte == null) {
      console.error("Erreur : Champs obligatoires manquants (designation, bar, prix, qte)");
      return { erreur: "Champs obligatoires manquants (designation, bar, prix, qte)", status: 400 };
    }

    const prixFloat = toDotDecimal(prix);
    const qteFloat = parseFloat(qte) || 0;
    const prixbaStr = prixba != null ? toCommaDecimal(toDotDecimal(prixba)) : '0,00';

    if (prixFloat < 0 || qteFloat < 0) {
      console.error("Erreur : Le prix et la quantité doivent être positifs");
      return { erreur: "Le prix et la quantité doivent être positifs", status: 400 };
    }

    const stmtCheck = db.prepare('SELECT 1 FROM item WHERE numero_item = ?');
    stmtCheck.step([numero_item]);
    const exists = stmtCheck.get();
    stmtCheck.free();
    if (!exists) {
      console.error("Erreur : Produit non trouvé");
      return { erreur: "Produit non trouvé", status: 404 };
    }

    const stmtBar = db.prepare('SELECT 1 FROM item WHERE bar = ? AND numero_item != ?');
    stmtBar.step([bar, numero_item]);
    const barExists = stmtBar.get();
    stmtBar.free();
    if (barExists) {
      console.error("Erreur : Ce code-barres est déjà utilisé par un autre produit");
      return { erreur: "Ce code-barres est déjà utilisé par un autre produit", status: 409 };
    }

    const stmt = db.prepare(`
      UPDATE item SET 
        designation = ?, bar = ?, prix = ?, qte = ?, prixba = ?, prixb = ?, prixvh = ? 
      WHERE numero_item = ?
    `);
    stmt.run([designation, bar, toCommaDecimal(prixFloat), qteFloat, prixbaStr, prixbaStr, toCommaDecimal(prixFloat), numero_item]);
    const changes = db.getRowsModified();
    stmt.free();

    if (changes === 0) {
      console.error("Erreur : Produit non trouvé");
      return { erreur: "Produit non trouvé", status: 404 };
    }

    await saveDbToIndexedDB(db);
    console.log("Produit modifié : changements =", changes);
    return { statut: "Produit modifié", numero_item, qte: qteFloat, status: 200 };
  } catch (error) {
    console.error("Erreur modifierItem :", error);
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

export async function supprimerItem(numero_item) {
  try {
    console.log("Exécution de supprimerItem :", numero_item);
    const db = await getDb();
    const stmt = db.prepare('DELETE FROM item WHERE numero_item = ?');
    stmt.run([numero_item]);
    const changes = db.getRowsModified();
    stmt.free();

    if (changes === 0) {
      console.error("Erreur : Produit non trouvé");
      return { erreur: "Produit non trouvé", status: 404 };
    }

    await saveDbToIndexedDB(db);
    console.log("Produit supprimé : changements =", changes);
    return { statut: "Produit supprimé", status: 200 };
  } catch (error) {
    console.error("Erreur supprimerItem :", error);
    return { erreur: error.message, status: 500 };
  }
}

export async function dashboard(period = 'day') {
  try {
    console.log("Exécution de dashboard avec period:", period);
    const db = await getDb();

    // Set date range based on period
    const now = new Date();
    let date_start, date_end;
    if (period === 'week') {
      date_end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      date_start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
    } else {
      date_start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      date_end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    }

    // Format dates for SQLite
    const formatDate = (date) => {
      return date.toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
    };
    const date_start_str = formatDate(date_start);
    const date_end_str = formatDate(date_end);

    console.log("📅 Date range:", date_start_str, "to", date_end_str);

    // KPI query - CORRIGÉE
    const query_kpi = `
      SELECT 
        COALESCE(SUM(CAST(REPLACE(COALESCE(NULLIF(a.prixt, ''), '0'), ',', '.') AS REAL)), 0) AS total_ca,
        COALESCE(SUM(
          CAST(REPLACE(COALESCE(NULLIF(a.prixt, ''), '0'), ',', '.') AS REAL) - 
          (a.quantite * CAST(REPLACE(COALESCE(NULLIF(i.prixba, ''), '0'), ',', '.') AS REAL))
        ), 0) AS total_profit,
        COUNT(DISTINCT c.numero_comande) AS sales_count
      FROM comande c
      JOIN attache a ON c.numero_comande = a.numero_comande
      JOIN item i ON a.numero_item = i.numero_item
      WHERE c.date_comande >= ? AND c.date_comande <= ?
    `;

    console.log("🔍 KPI Query:", query_kpi);
    
    const stmt_kpi = db.prepare(query_kpi);
    stmt_kpi.bind([date_start_str, date_end_str]);
    const kpi_data = stmt_kpi.getAsObject() || { total_ca: 0, total_profit: 0, sales_count: 0 };
    stmt_kpi.free();

    console.log("📊 KPI Data:", kpi_data);

    // Low stock query
    const query_low_stock = `SELECT COUNT(*) AS low_stock FROM item WHERE qte < 10`;
    const stmt_low_stock = db.prepare(query_low_stock);
    const low_stock_data = stmt_low_stock.getAsObject();
    const low_stock_count = low_stock_data.low_stock || 0;
    stmt_low_stock.free();

    // Top client query
    const query_top_client = `
      SELECT 
        cl.nom,
        COALESCE(SUM(CAST(REPLACE(COALESCE(NULLIF(a.prixt, ''), '0'), ',', '.') AS REAL)), 0) AS client_ca
      FROM comande c
      JOIN attache a ON c.numero_comande = a.numero_comande
      LEFT JOIN client cl ON c.numero_table = cl.numero_clt
      WHERE c.date_comande >= ? AND c.date_comande <= ?
      GROUP BY cl.nom
      ORDER BY client_ca DESC
      LIMIT 1
    `;
    const stmt_top_client = db.prepare(query_top_client);
    stmt_top_client.bind([date_start_str, date_end_str]);
    const top_client = stmt_top_client.getAsObject() || { nom: 'N/A', client_ca: 0 };
    stmt_top_client.free();

    // Chart data query
    const query_chart = `
      SELECT 
        DATE(c.date_comande) AS sale_date,
        COALESCE(SUM(CAST(REPLACE(COALESCE(NULLIF(a.prixt, ''), '0'), ',', '.') AS REAL)), 0) AS daily_ca
      FROM comande c
      JOIN attache a ON c.numero_comande = a.numero_comande
      WHERE c.date_comande >= ? AND c.date_comande <= ?
      GROUP BY DATE(c.date_comande)
      ORDER BY sale_date
    `;
    const stmt_chart = db.prepare(query_chart);
    stmt_chart.bind([date_start_str, date_end_str]);
    const chart_data = [];
    while (stmt_chart.step()) {
      chart_data.push(stmt_chart.getAsObject());
    }
    stmt_chart.free();

    // Generate chart labels and values
    const chart_labels = [];
    const chart_values = [];
    let current_date = new Date(date_start);
    while (current_date <= date_end) {
      const date_str = current_date.toISOString().slice(0, 10);
      chart_labels.push(date_str);
      const daily_ca = chart_data.find(row => row.sale_date === date_str)?.daily_ca || 0;
      chart_values.push(toDotDecimal(daily_ca.toString()));
      current_date.setDate(current_date.getDate() + 1);
    }

    // Format response
    const response = {
      statut: "Dashboard data retrieved",
      data: {
        total_ca: toDotDecimal(kpi_data.total_ca.toString()),
        total_profit: toDotDecimal(kpi_data.total_profit.toString()),
        sales_count: parseInt(kpi_data.sales_count) || 0,
        low_stock_items: parseInt(low_stock_count) || 0,
        top_client: {
          name: top_client.nom || 'N/A',
          ca: toDotDecimal(top_client.client_ca.toString())
        },
        chart_data: {
          labels: chart_labels,
          values: chart_values
        }
      },
      status: 200
    };

    console.log("✅ Résultat dashboard:", response);
    return response;
  } catch (error) {
    console.error("❌ Erreur dashboard:", error);
    return { erreur: error.message, status: 500 };
  }
}
