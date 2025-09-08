import { getDb, saveDbToLocalStorage } from './db.js';

// Fonction utilitaire pour convertir une date en format SQLite
function formatDateForSQLite(date) {
  return date.toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
}
// Convertit une chaîne avec virgule (ex. "200,00") en flottant (ex. 200.0)
function toDotDecimal(value) {
  if (value == null || value === '') return 0.0;
  try {
    // Remplacer la virgule par un point et convertir en flottant
    const cleanedValue = String(value).replace(',', '.').replace(/[^\d.-]/g, '');
    const result = parseFloat(cleanedValue);
    return isNaN(result) ? 0.0 : result;
  } catch (error) {
    console.error("Erreur dans toDotDecimal pour la valeur :", value, error);
    return 0.0;
  }
}

// Convertit un flottant (ex. 200.0) en chaîne avec virgule (ex. "200,00")
function toCommaDecimal(value) {
  if (value == null || isNaN(value)) return "0,00";
  try {
    return value.toFixed(2).replace('.', ',');
  } catch (error) {
    console.error("Erreur dans toCommaDecimal pour la valeur :", value, error);
    return "0,00";
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

    // Vérifier les colonnes de la table item
    const stmtInfo = db.prepare("PRAGMA table_info(item)");
    const columns = [];
    while (stmtInfo.step()) {
      columns.push(stmtInfo.getAsObject().name);
    }
    stmtInfo.free();
    console.log("Colonnes de la table item :", columns);

    // Récupérer les données
    const stmt = db.prepare('SELECT numero_item, bar, designation, qte, prix, prixba, ref FROM item ORDER BY designation');
    const produits = [];
    while (stmt.step()) {
      const row = stmt.get();
      console.log("Produit brut récupéré :", row);

      // Conversion des valeurs avec débogage
      const prixRaw = row[4];
      const prixbaRaw = row[5];
      console.log("Valeurs brutes - prix :", prixRaw, "prixba :", prixbaRaw);

      const prixFloat = toDotDecimal(prixRaw);
      const prixbaFloat = toDotDecimal(prixbaRaw);
      const qteInt = parseInt(row[3]) || 0;

      console.log("Valeurs converties - prixFloat :", prixFloat, "prixbaFloat :", prixbaFloat, "qteInt :", qteInt);

      produits.push({
        NUMERO_ITEM: row[0] !== null ? row[0] : '',
        BAR: row[1] !== null ? row[1] : '',
        DESIGNATION: row[2] !== null ? row[2] : '',
        QTE: qteInt,
        PRIX: prixRaw !== null && prixRaw !== '' ? prixRaw : '0,00',
        PRIXBA: prixbaRaw !== null && prixbaRaw !== '' ? prixbaRaw : '0,00',
        REF: row[6] !== null ? row[6] : '',
        PRIX_NUM: prixFloat,
        PRIXBA_NUM: prixbaFloat,
        PRIX_FMT: toCommaDecimal(prixFloat),
        PRIXBA_FMT: toCommaDecimal(prixbaFloat),
        QTE_FMT: `${qteInt}`
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

    saveDbToLocalStorage(db); // Sauvegarde LocalStorage
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

    saveDbToLocalStorage(db); // Sauvegarde LocalStorage
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

    saveDbToLocalStorage(db); // Sauvegarde LocalStorage
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
    const { designation, bar, prix, qte, prixba } = data;

    // Validation des champs obligatoires
    if (!designation || prix == null || qte == null) {
      return { erreur: "Champs obligatoires manquants (designation, prix, qte)", status: 400 };
    }

    // Conversion des valeurs
    let prixFloat, qteInt;
    try {
      prixFloat = toDotDecimal(prix);
      qteInt = parseInt(qte) || 0;
      if (isNaN(prixFloat) || isNaN(qteInt)) {
        return { erreur: "Le prix et la quantité doivent être des nombres valides", status: 400 };
      }
    } catch (error) {
      return { erreur: "Erreur de conversion des données", status: 400 };
    }

    const prixbaStr = prixba != null ? toCommaDecimal(toDotDecimal(prixba)) : "0,00";

    if (prixFloat < 0 || qteInt < 0) {
      return { erreur: "Le prix et la quantité doivent être positifs", status: 400 };
    }

    // Vérifier le contenu de la table item
    const stmtAllItems = db.prepare('SELECT * FROM item');
    const items = [];
    while (stmtAllItems.step()) {
      items.push(stmtAllItems.getAsObject());
    }
    stmtAllItems.free();
    console.log("Contenu actuel de la table item :", items);

    // Vérifier la table codebar (si elle existe)
    let codebars = [];
    try {
      const stmtCodebar = db.prepare('SELECT * FROM codebar');
      while (stmtCodebar.step()) {
        codebars.push(stmtCodebar.getAsObject());
      }
      stmtCodebar.free();
      console.log("Contenu de la table codebar :", codebars);
    } catch (error) {
      console.log("Table codebar non trouvée, ignorée");
    }

    console.log("Code-barres fourni :", bar);

    db.run('BEGIN TRANSACTION');

    try {
      // ÉTAPE 1: Pas de vérification d'unicité pour bar (supprimée)

      // ÉTAPE 2: Si bar est vide, on utilisera numero_item pour bar et ref
      let tempBar = bar || `TEMP_${Date.now()}`; // Code temporaire si bar est vide
      let generatedRef = bar ? `P${Date.now()}` : null; // Ref temporaire, sera mis à jour si bar est vide

      console.log("Code temporaire (tempBar) :", tempBar);
      console.log("Référence temporaire (generatedRef) :", generatedRef);

      // ÉTAPE 3: Insertion avec le code temporaire
      const stmtInsert = db.prepare(`
        INSERT INTO item (designation, bar, prix, qte, prixba, ref, gere, prixb, tva, disponible, tvav, prixvh, qtea)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmtInsert.run([
        designation, 
        tempBar, 
        toCommaDecimal(prixFloat), 
        qteInt, 
        prixbaStr, 
        generatedRef || "TEMP_REF", // Ref temporaire si bar est vide
        true, // gere
        prixbaStr, // prixb
        0, // tva
        true, // disponible
        "0", // tvav
        toCommaDecimal(prixFloat), // prixvh
        0 // qtea
      ]);
      stmtInsert.free();

      // ÉTAPE 4: Récupérer l'ID
      const idStmt = db.prepare('SELECT last_insert_rowid() AS id');
      idStmt.step();
      const { id } = idStmt.getAsObject();
      idStmt.free();
      console.log("ID de l'item inséré (numero_item) :", id);

      // ÉTAPE 5: Si aucun code-barres fourni, utiliser numero_item pour bar et ref
      let finalBar = bar || `${id}`; // Utiliser numero_item si bar est vide
      let finalRef = bar ? generatedRef : `P${id}`; // Utiliser P + numero_item si bar est vide

      console.log("Code-barres final (finalBar) :", finalBar);
      console.log("Référence finale (finalRef) :", finalRef);

      // Mettre à jour bar et ref avec les valeurs finales
      const stmtUpdate = db.prepare('UPDATE item SET bar = ?, ref = ? WHERE numero_item = ?');
      stmtUpdate.run([finalBar, finalRef, id]);
      stmtUpdate.free();

      db.run('COMMIT');
      saveDbToLocalStorage(db);
      
      console.log("✅ Produit ajouté avec succès:", { id, ref: finalRef, bar: finalBar });
      return { 
        statut: "Item ajouté", 
        id: id, 
        ref: finalRef, 
        bar: finalBar, 
        status: 201 
      };

    } catch (error) {
      db.run('ROLLBACK');
      console.error("❌ Erreur dans la transaction:", error);
      throw error;
    }
  } catch (error) {
    console.error("❌ Erreur ajouterItem :", error);
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

    saveDbToLocalStorage(db); // Sauvegarde LocalStorage
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

    saveDbToLocalStorage(db); // Sauvegarde LocalStorage
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

    saveDbToLocalStorage(db); // Sauvegarde LocalStorage
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

    saveDbToLocalStorage(db); // Sauvegarde LocalStorage
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

    saveDbToLocalStorage(db); // Sauvegarde LocalStorage
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

    saveDbToLocalStorage(db); // Sauvegarde LocalStorage
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

    saveDbToLocalStorage(db); // Sauvegarde LocalStorage
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

    saveDbToLocalStorage(db); // Sauvegarde LocalStorage
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

    // 1. Requête CA total
    const query_ca = `
      SELECT COALESCE(SUM(
        CAST(REPLACE(COALESCE(NULLIF(a.prixt, ''), '0'), ',', '.') AS REAL)
      ), 0) AS total_ca
      FROM comande c
      JOIN attache a ON c.numero_comande = a.numero_comande
      WHERE c.date_comande >= ? AND c.date_comande <= ?
    `;

    const stmt_ca = db.prepare(query_ca);
    stmt_ca.bind([date_start_str, date_end_str]);
    const ca_data = stmt_ca.getAsObject() || { total_ca: 0 };
    console.log("💰 CA data:", ca_data);
    stmt_ca.free();

    // 2. Requête profit total
    const query_profit = `
      SELECT COALESCE(SUM(
        CAST(REPLACE(COALESCE(NULLIF(a.prixt, ''), '0'), ',', '.') AS REAL) - 
        (a.quantite * CAST(REPLACE(COALESCE(NULLIF(i.prixba, ''), '0'), ',', '.') AS REAL))
      ), 0) AS total_profit
      FROM comande c
      JOIN attache a ON c.numero_comande = a.numero_comande
      JOIN item i ON a.numero_item = i.numero_item
      WHERE c.date_comande >= ? AND c.date_comande <= ?
    `;

    const stmt_profit = db.prepare(query_profit);
    stmt_profit.bind([date_start_str, date_end_str]);
    const profit_data = stmt_profit.getAsObject() || { total_profit: 0 };
    console.log("💵 Profit data:", profit_data);
    stmt_profit.free();

    // 3. Nombre de ventes
    const query_sales = `
      SELECT COUNT(DISTINCT c.numero_comande) AS sales_count
      FROM comande c
      WHERE c.date_comande >= ? AND c.date_comande <= ?
    `;

    const stmt_sales = db.prepare(query_sales);
    stmt_sales.bind([date_start_str, date_end_str]);
    const sales_data = stmt_sales.getAsObject() || { sales_count: 0 };
    console.log("🛒 Sales data:", sales_data);
    stmt_sales.free();

    // 4. Stock faible
    const query_low_stock = `SELECT COUNT(*) AS low_stock FROM item WHERE qte < 10`;
    const stmt_low_stock = db.prepare(query_low_stock);
    const low_stock_data = stmt_low_stock.getAsObject() || { low_stock: 0 };
    const low_stock_count = low_stock_data.low_stock || 0;
    console.log("📦 Low stock:", low_stock_count);
    stmt_low_stock.free();

    // 5. Meilleur client
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
    console.log("👑 Top client:", top_client);
    stmt_top_client.free();

    // 6. Données graphique
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
    console.log("📊 Chart data:", chart_data);

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

    // Format response - AVEC SÉCURISATION
    const response = {
      statut: "Dashboard data retrieved",
      data: {
        total_ca: toDotDecimal((ca_data.total_ca || 0).toString()),
        total_profit: toDotDecimal((profit_data.total_profit || 0).toString()),
        sales_count: parseInt(sales_data.sales_count) || 0,
        low_stock_items: parseInt(low_stock_count) || 0,
        top_client: {
          name: top_client.nom || 'N/A',
          ca: toDotDecimal((top_client.client_ca || 0).toString())
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
export async function validerVendeur(data) {
  try {
    console.log("Exécution de validerVendeur avec data:", data);
    const db = await getDb();
    const { nom, password2 } = data;

    if (!nom || !password2) {
      console.error("Erreur : Le nom et le mot de passe sont requis");
      return { erreur: "Le nom et le mot de passe sont requis", status: 400 };
    }

    // Requête SQLite pour vérifier l'utilisateur
    const stmt = db.prepare(`
      SELECT numero_util, nom, statue 
      FROM utilisateur 
      WHERE nom = ? AND password2 = ?
    `);
    
    stmt.bind([nom, password2]);
    
    let utilisateur = null;
    if (stmt.step()) {
      utilisateur = stmt.getAsObject();
    }
    stmt.free();

    // Vérifier si l'utilisateur existe
    if (!utilisateur) {
      console.error("Échec authentification pour:", nom);
      return { erreur: "Nom ou mot de passe incorrect", status: 401 };
    }

    console.log("✅ Vendeur validé:", utilisateur);
    return {
      statut: "Vendeur validé",
      utilisateur: {
        numero_util: utilisateur.numero_util,
        nom: utilisateur.nom,
        statut: utilisateur.statue
      },
      status: 200
    };

  } catch (error) {
    console.error("❌ Erreur validerVendeur:", error);
    return { erreur: error.message, status: 500 };
  }
}
/// CATEGORIES FUNCTIONS


export async function listeCategories() {
  try {
    console.log('Exécution de listeCategories...');
    const db = await getDb();

    // Vérifier les colonnes de la table categorie
    const stmtInfo = db.prepare('PRAGMA table_info(categorie)');
    const columns = [];
    while (stmtInfo.step()) {
      columns.push(stmtInfo.getAsObject().name);
    }
    stmtInfo.free();
    console.log('Colonnes de la table categorie:', columns);

    // Récupérer toutes les données
    const stmt = db.prepare('SELECT numer_categorie, description_c FROM categorie ORDER BY description_c');
    const categories = [];
    while (stmt.step()) {
      const row = stmt.get();
      console.log('Catégorie brute récupérée:', row);

      // Conversion des valeurs avec débogage
      const numer_categorieRaw = row[0];
      const description_cRaw = row[1];
      console.log('Valeurs brutes - numer_categorie:', numer_categorieRaw, 'description_c:', description_cRaw);

      const numer_categorie = numer_categorieRaw !== null && numer_categorieRaw !== undefined ? numer_categorieRaw : '';
      const description_c = description_cRaw !== null && description_cRaw !== undefined ? description_cRaw : '';

      console.log('Valeurs converties - numer_categorie:', numer_categorie, 'description_c:', description_c);

      categories.push({
        numer_categorie: numer_categorie,
        description_c: description_c
      });
    }
    stmt.free();
    console.log('Categories formatées retournées:', categories);
    return categories;
  } catch (error) {
    console.error('Erreur listeCategories:', error);
    return { erreur: error.message, status: 500 };
  }
}
// Ajoute une nouvelle catégorie
export async function ajouterCategorie(data) {
  try {
    console.log("Exécution de ajouterCategorie avec data :", data);
    const db = await getDb();
    const { description_c } = data;

    if (!description_c) {
      console.error("Erreur : Description requise");
      return { erreur: "Description requise", status: 400 };
    }

    // Vérifier le contenu de la table categorie avant insertion
    console.log("Vérification du contenu de la table categorie avant insertion...");
    const categoriesAvant = await listeCategories();
    console.log("Catégories avant insertion :", categoriesAvant);

    db.run('BEGIN TRANSACTION');

    try {
      // Vérification optionnelle des doublons (commentée)
      /*
      const stmtCheck = db.prepare('SELECT 1 FROM categorie WHERE description_c = ?');
      stmtCheck.step([description_c]);
      if (stmtCheck.get()) {
        stmtCheck.free();
        db.run('ROLLBACK');
        console.error("Erreur : Catégorie existante");
        return { erreur: "Catégorie existante", status: 409 };
      }
      stmtCheck.free();
      */

      const stmt = db.prepare('INSERT INTO categorie (description_c) VALUES (?)');
      stmt.run([description_c]);
      stmt.free();

      const idStmt = db.prepare('SELECT last_insert_rowid() AS id');
      idStmt.step();
      const { id } = idStmt.getAsObject();
      idStmt.free();

      db.run('COMMIT');
      saveDbToLocalStorage(db);

      // Vérifier après insertion
      console.log("Vérification du contenu de la table categorie après insertion...");
      const categoriesApres = await listeCategories();
      console.log("Catégories après insertion :", categoriesApres);

      console.log("Catégorie ajoutée : ID =", id);
      return { statut: "Catégorie ajoutée", id, status: 201 };
    } catch (error) {
      db.run('ROLLBACK');
      console.error("Erreur dans la transaction :", error);
      throw error;
    }
  } catch (error) {
    console.error("Erreur ajouterCategorie :", error);
    return { erreur: error.message, status: 500 };
  }
}

// Modifie une catégorie existante
export async function modifierCategorie(numer_categorie, data) {
  try {
    console.log("Exécution de modifierCategorie :", numer_categorie, data);
    const db = await getDb();
    const { description_c } = data;

    if (!description_c) {
      console.error("Erreur : Description requise");
      return { erreur: "Description requise", status: 400 };
    }

    // Vérifier le contenu de la table categorie avant modification
    console.log("Vérification du contenu de la table categorie avant modification...");
    const categoriesAvant = await listeCategories();
    console.log("Catégories avant modification :", categoriesAvant);

    db.run('BEGIN TRANSACTION');

    try {
      // Vérifier si la catégorie existe
      const stmtCheck = db.prepare('SELECT 1 FROM categorie WHERE numer_categorie = ?');
      stmtCheck.step([numer_categorie]);
      if (!stmtCheck.get()) {
        stmtCheck.free();
        db.run('ROLLBACK');
        console.error("Erreur : Catégorie non trouvée");
        return { erreur: "Catégorie non trouvée", status: 404 };
      }
      stmtCheck.free();

      // Vérification optionnelle des doublons (commentée)
      /*
      const stmtCheckDup = db.prepare('SELECT 1 FROM categorie WHERE description_c = ? AND numer_categorie != ?');
      stmtCheckDup.step([description_c, numer_categorie]);
      if (stmtCheckDup.get()) {
        stmtCheckDup.free();
        db.run('ROLLBACK');
        console.error("Erreur : Catégorie existante");
        return { erreur: "Catégorie existante", status: 409 };
      }
      stmtCheckDup.free();
      */

      const stmt = db.prepare('UPDATE categorie SET description_c = ? WHERE numer_categorie = ?');
      stmt.run([description_c, numer_categorie]);
      const changes = db.getRowsModified();
      stmt.free();

      if (changes === 0) {
        db.run('ROLLBACK');
        console.error("Erreur : Catégorie non trouvée");
        return { erreur: "Catégorie non trouvée", status: 404 };
      }

      db.run('COMMIT');
      saveDbToLocalStorage(db);

      // Vérifier après modification
      console.log("Vérification du contenu de la table categorie après modification...");
      const categoriesApres = await listeCategories();
      console.log("Catégories après modification :", categoriesApres);

      console.log("Catégorie modifiée : changements =", changes);
      return { statut: "Catégorie modifiée", status: 200 };
    } catch (error) {
      db.run('ROLLBACK');
      console.error("Erreur dans la transaction :", error);
      throw error;
    }
  } catch (error) {
    console.error("Erreur modifierCategorie :", error);
    return { erreur: error.message, status: 500 };
  }
}

export async function supprimerCategorie(numer_categorie) {
  try {
    console.log('Exécution de supprimerCategorie:', numer_categorie);
    const db = await getDb();

    // Vérifier le contenu de la table categorie avant suppression
    console.log('Vérification du contenu de la table categorie avant suppression...');
    const categoriesAvant = await listeCategories();
    console.log('Catégories avant suppression:', categoriesAvant);

    db.run('BEGIN TRANSACTION');

    try {
      // Vérifier si la catégorie existe
      const stmtCheckExist = db.prepare('SELECT 1 FROM categorie WHERE numer_categorie = ?');
      stmtCheckExist.bind([numer_categorie]);
      const exists = stmtCheckExist.step() && stmtCheckExist.get();
      stmtCheckExist.free();
      if (!exists) {
        db.run('ROLLBACK');
        console.error('Erreur: Catégorie non trouvée pour numer_categorie:', numer_categorie);
        return { erreur: 'Catégorie non trouvée', status: 404 };
      }

      // Vérifier si la catégorie est utilisée par des produits
      const stmtCheck = db.prepare('SELECT numero_item FROM item WHERE numero_categorie = ?');
      stmtCheck.bind([numer_categorie]);
      const hasProducts = stmtCheck.step();
      const productSample = hasProducts ? stmtCheck.get() : null;
      stmtCheck.free();
      console.log('Résultat vérification produits - hasProducts:', hasProducts, 'productSample:', productSample);
      if (hasProducts) {
        db.run('ROLLBACK');
        console.error('Erreur: Catégorie utilisée par des produits, exemple:', productSample);
        return { erreur: 'Catégorie utilisée par des produits', status: 400 };
      }

      // Supprimer la catégorie
      const stmt = db.prepare('DELETE FROM categorie WHERE numer_categorie = ?');
      stmt.run([numer_categorie]);
      const changes = db.getRowsModified();
      stmt.free();

      if (changes === 0) {
        db.run('ROLLBACK');
        console.error('Erreur: Aucune catégorie supprimée pour numer_categorie:', numer_categorie);
        return { erreur: 'Catégorie non trouvée', status: 404 };
      }

      db.run('COMMIT');
      await saveDbToLocalStorage(db);

      // Vérifier après suppression
      console.log('Vérification du contenu de la table categorie après suppression...');
      const categoriesApres = await listeCategories();
      console.log('Catégories après suppression:', categoriesApres);

      console.log('Catégorie supprimée: changements =', changes);
      return { statut: 'Catégorie supprimée', status: 200 };
    } catch (error) {
      db.run('ROLLBACK');
      console.error('Erreur dans la transaction:', error);
      throw error;
    }
  } catch (error) {
    console.error('Erreur supprimerCategorie:', error);
    return { erreur: error.message, status: 500 };
  }
}
// Assigne une catégorie à un produit

export async function assignerCategorie(data) {
  try {
    console.log('Exécution de assignerCategorie avec data:', data);
    const db = await getDb();
    const { numero_item, numer_categorie } = data;

    if (numero_item === undefined || numero_item === null || isNaN(parseInt(numero_item))) {
      console.error('Erreur: Numéro d\'article requis et doit être un entier');
      return { erreur: 'Numéro d\'article requis et doit être un entier', status: 400 };
    }

    // Vérifier le contenu des tables avant modification
    console.log('Vérification du contenu des tables avant assignation...');
    const produitsAvant = await listeProduits();
    const categoriesAvant = await listeCategories();
    console.log('Produits avant assignation:', produitsAvant);
    console.log('Catégories avant assignation:', categoriesAvant);

    db.run('BEGIN TRANSACTION');

    try {
      // Vérifier si l'article existe
      const stmtCheckItem = db.prepare('SELECT numero_item FROM item WHERE numero_item = ?');
      stmtCheckItem.bind([numero_item]);
      const itemExists = stmtCheckItem.step() && stmtCheckItem.get();
      stmtCheckItem.free();
      console.log('Vérification article - existe:', !!itemExists, 'détails:', itemExists);
      if (!itemExists) {
        db.run('ROLLBACK');
        console.error('Erreur: Article non trouvé pour numero_item:', numero_item);
        return { erreur: 'Article non trouvé', status: 404 };
      }

      // Vérifier si la catégorie existe (si fournie)
      if (numer_categorie !== null && numer_categorie !== undefined) {
        const stmtCheckCat = db.prepare('SELECT numer_categorie FROM categorie WHERE numer_categorie = ?');
        stmtCheckCat.bind([numer_categorie]);
        const catExists = stmtCheckCat.step() && stmtCheckCat.get();
        stmtCheckCat.free();
        console.log('Vérification catégorie - existe:', !!catExists, 'détails:', catExists);
        if (!catExists) {
          db.run('ROLLBACK');
          console.error('Erreur: Catégorie non trouvée pour numer_categorie:', numer_categorie);
          return { erreur: 'Catégorie non trouvée', status: 404 };
        }
      }

      // Mettre à jour la catégorie de l'article
      const stmt = db.prepare('UPDATE item SET numero_categorie = ? WHERE numero_item = ?');
      console.log('Exécution UPDATE avec:', { numer_categorie, numero_item });
      stmt.run([numer_categorie === undefined || numer_categorie === null ? null : numer_categorie, numero_item]);
      const changes = db.getRowsModified();
      stmt.free();
      console.log('Résultat UPDATE - changements:', changes);

      if (changes === 0) {
        db.run('ROLLBACK');
        console.error('Erreur: Aucun article mis à jour pour numero_item:', numero_item);
        return { erreur: 'Aucun article mis à jour', status: 404 };
      }

      db.run('COMMIT');
      await saveDbToLocalStorage(db);

      // Vérifier après assignation
      console.log('Vérification du contenu des tables après assignation...');
      const produitsApres = await listeProduits();
      console.log('Produits après assignation:', produitsApres);

      console.log('Catégorie assignée:', { numero_item, numer_categorie });
      return {
        statut: 'Catégorie assignée',
        numero_item: numero_item,
        numer_categorie: numer_categorie === undefined || numer_categorie === null ? null : numer_categorie,
        status: 200
      };
    } catch (error) {
      db.run('ROLLBACK');
      console.error('Erreur dans la transaction:', error);
      throw error;
    }
  } catch (error) {
    console.error('Erreur assignerCategorie:', error);
    return { erreur: error.message, status: 500 };
  }
}

export async function listeProduitsParCategorie(numero_categorie) {
  try {
    console.log('Exécution de listeProduitsParCategorie:', numero_categorie);
    const db = await getDb();

    if (numero_categorie === undefined || numero_categorie === null) {
      // Produits sans catégorie - AVEC CLÉS MINUSCULES
      const stmt = db.prepare('SELECT numero_item, designation FROM item WHERE numero_categorie IS NULL');
      const produits = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        console.log('Produit sans catégorie brut:', row);

        // Conversion des clés majuscules en minuscules
        const numero_item = row.NUMERO_ITEM !== null && row.NUMERO_ITEM !== undefined ? row.NUMERO_ITEM : '';
        const designation = row.DESIGNATION !== null && row.DESIGNATION !== undefined ? row.DESIGNATION : '';

        produits.push({
          numero_item: numero_item, // clé en minuscule
          designation: designation  // clé en minuscule
        });
      }
      stmt.free();
      console.log('Produits sans catégorie:', produits);
      return { produits };
    } else {
      // Vérifier si la catégorie existe
      const stmtCheckCat = db.prepare('SELECT 1 FROM categorie WHERE numer_categorie = ?');
      stmtCheckCat.bind([numero_categorie]);
      const exists = stmtCheckCat.step();
      stmtCheckCat.free();
      if (!exists) {
        console.error('Erreur: Catégorie non trouvée pour numer_categorie:', numero_categorie);
        return { erreur: 'Catégorie non trouvée', status: 404 };
      }

      // Produits par catégorie - AVEC CLÉS MINUSCULES
      const stmt = db.prepare(`
        SELECT c.numer_categorie, c.description_c, i.numero_item, i.designation
        FROM categorie c
        LEFT JOIN item i ON c.numer_categorie = i.numero_categorie
        WHERE c.numer_categorie = ?
      `);
      stmt.bind([numero_categorie]);

      const categories = {};
      while (stmt.step()) {
        const row = stmt.getAsObject();
        console.log('Données brutes pour catégorie:', row);

        // Conversion des clés majuscules en minuscules
        const numer_categorie = row.NUMER_CATEGORIE !== null && row.NUMER_CATEGORIE !== undefined ? row.NUMER_CATEGORIE : '';
        const description_c = row.DESCRIPTION_C !== null && row.DESCRIPTION_C !== undefined ? row.DESCRIPTION_C : '';
        const numero_item = row.NUMERO_ITEM !== null && row.NUMERO_ITEM !== undefined ? row.NUMERO_ITEM : '';
        const designation = row.DESIGNATION !== null && row.DESIGNATION !== undefined ? row.DESIGNATION : '';

        if (!categories[numer_categorie]) {
          categories[numer_categorie] = {
            numer_categorie: numer_categorie, // clé en minuscule
            description_c: description_c,     // clé en minuscule
            produits: []                      // clé en minuscule
          };
        }

        if (numero_item) {
          categories[numer_categorie].produits.push({
            numero_item: numero_item,    // clé en minuscule
            designation: designation     // clé en minuscule
          });
        }
      }
      stmt.free();

      console.log('Catégories avec produits:', Object.values(categories));
      return { categories: Object.values(categories) };
    }
  } catch (error) {
    console.error('Erreur listeProduitsParCategorie:', error);
    return { erreur: error.message, status: 500 };
  }
}
export async function clientSolde() {
  try {
    console.log("Exécution de clientSolde...");
    const db = await getDb();
    
    const stmt = db.prepare('SELECT numero_clt, solde FROM client');
    const soldes = [];
    
    while (stmt.step()) {
      const row = stmt.get();
      console.log("Solde client brut récupéré:", row);
      
      soldes.push({
        numero_clt: row[0] !== null ? row[0] : '',
        solde: row[1] !== null ? row[1] : '0,00'
      });
    }
    stmt.free();
    
    console.log("Soldes clients formatés retournés:", soldes);
    return soldes;
  } catch (error) {
    console.error("Erreur clientSolde:", error);
    return { erreur: error.message, status: 500 };
  }
}




// apiRoutes.js (ajouts aux fonctions existantes)

export async function validerVente(data) {
  try {
    console.log("Exécution de validerVente avec data:", data);
    const db = await getDb();
    
    // 1. Validation des données
    if (!data || !data.lignes || !data.numero_util || !data.password2) {
      return { erreur: "Données manquantes", status: 400 };
    }

    const numero_table = parseInt(data.numero_table) || 0;
    const payment_mode = data.payment_mode || 'espece';
    const amount_paid_str = data.amount_paid || '0,00';
    const amount_paid = toDotDecimal(amount_paid_str);
    const numero_util = data.numero_util;
    const password2 = data.password2;
    const nature = numero_table === 0 ? "TICKET" : "BON DE L.";

    // 2. Vérification de l'authentification
    const stmtUser = db.prepare("SELECT numero_util, nom, password2 FROM utilisateur WHERE numero_util = ?");
    stmtUser.bind([numero_util]);
    let user = null;
    if (stmtUser.step()) {
      user = stmtUser.getAsObject();
    }
    stmtUser.free();

    if (!user || user.PASSWORD2 !== password2) {
      return { erreur: "Authentification invalide", status: 401 };
    }

    db.run('BEGIN TRANSACTION');

    try {
      // 3. Création de la commande
      const stmtCompteur = db.prepare("SELECT COALESCE(MAX(compteur), 0) + 1 AS next_compteur FROM comande WHERE nature = ?");
      stmtCompteur.bind([nature]);
      stmtCompteur.step();
      const { next_compteur } = stmtCompteur.getAsObject();
      stmtCompteur.free();

      const stmtCommande = db.prepare(`
        INSERT INTO comande (numero_table, date_comande, etat_c, nature, connection1, compteur, numero_util)
        VALUES (?, datetime('now'), 'Cloture', ?, -1, ?, ?)
      `);
      stmtCommande.run([numero_table, nature, next_compteur, numero_util]);
      stmtCommande.free();

      // Récupérer l'ID de la commande
      const idStmt = db.prepare('SELECT last_insert_rowid() AS numero_comande');
      idStmt.step();
      const { numero_comande } = idStmt.getAsObject();
      idStmt.free();

      // 4. Traitement des lignes et calcul du total
      let total_vente = 0.0;
      
      for (const ligne of data.lignes) {
        const quantite = toDotDecimal(ligne.quantite || '1');
        const remarque = toDotDecimal(ligne.remarque || '0,00');
        const prixt = quantite * remarque;
        total_vente += prixt;

        const prixt_str = toCommaDecimal(prixt);
        const prixbh_str = toCommaDecimal(toDotDecimal(ligne.prixbh || '0,00'));
        
        // Insérer dans attache
        const stmtAttache = db.prepare(`
          INSERT INTO attache (numero_comande, numero_item, quantite, prixt, remarque, prixbh, achatfx, send)
          VALUES (?, ?, ?, ?, ?, ?, 0, 1)
        `);
        stmtAttache.run([numero_comande, ligne.numero_item, quantite, prixt_str, ligne.remarque || '', prixbh_str]);
        stmtAttache.free();

        // Mettre à jour le stock
        const stmtStock = db.prepare("UPDATE item SET qte = qte - ? WHERE numero_item = ?");
        stmtStock.run([quantite, ligne.numero_item]);
        stmtStock.free();
      }

      // 5. Calculs des montants
      const total_vente_str = toCommaDecimal(total_vente);
      const montant_reglement = payment_mode === 'espece' ? total_vente : amount_paid;
      const montant_reglement_str = toCommaDecimal(montant_reglement);

      const solde_restant_vente = total_vente - amount_paid; // montant dû (positif en brut)
      const solde_restant_str = toCommaDecimal(solde_restant_vente);

      // 6. Insertion dans encaisse
      const stmtEncaisse = db.prepare(`
        INSERT INTO encaisse (apaye, reglement, tva, ht, numero_comande, origine, time_enc, soldeR)
        VALUES (?, ?, '0,00', ?, ?, ?, datetime('now'), ?)
      `);
      stmtEncaisse.run([
        total_vente_str, montant_reglement_str, total_vente_str, 
        numero_comande, nature, solde_restant_str
      ]);
      stmtEncaisse.free();

      // 7. Mise à jour du solde client si vente à terme
      if (payment_mode === 'a_terme' && numero_table !== 0) {
        // Lire ancien solde (converti en REAL même si TEXT)
        const stmtClient = db.prepare("SELECT COALESCE(CAST(solde AS REAL), 0) AS solde FROM client WHERE numero_clt = ?");
        stmtClient.bind([numero_table]);
        let oldSolde = 0.0;
        if (stmtClient.step()) {
          const client = stmtClient.getAsObject();
          oldSolde = parseFloat(client.solde) || 0.0;
        }
        stmtClient.free();

        // Nouvelle dette (toujours négative)
        const nouvelle_dette = -(solde_restant_vente);
        const newSolde = oldSolde + nouvelle_dette;

        // Mise à jour du client
        const stmtUpdateClient = db.prepare("UPDATE client SET solde = ? WHERE numero_clt = ?");
        stmtUpdateClient.run([newSolde.toString(), numero_table]);
        stmtUpdateClient.free();

        console.log(`✅ Solde client cumulé: ${oldSolde} + (${nouvelle_dette}) = ${newSolde}`);
      }

      db.run('COMMIT');
      saveDbToLocalStorage(db);

      return {
        success: true,
        numero_comande,
        total_vente: total_vente_str,
        montant_verse: amount_paid_str,
        reglement: montant_reglement_str,
        solde_restant: payment_mode === 'a_terme' ? toCommaDecimal(solde_restant_vente) : "0,00",
        status: 200
      };

    } catch (error) {
      db.run('ROLLBACK');
      console.error("Erreur dans la transaction:", error);
      throw error;
    }

  } catch (error) {
    console.error("Erreur validerVente:", error);
    return { erreur: error.message, status: 500 };
  }
}

export async function modifierVente(numero_comande, data) {
  try {
    console.log("Exécution de modifierVente:", numero_comande, data);
    const db = await getDb();
    
    const { lignes, numero_util, password2, numero_table = 0, payment_mode = 'espece', amount_paid = '0,00' } = data;

    if (!lignes || !numero_util || !password2) {
      return { erreur: "Données manquantes", status: 400 };
    }

    const amount_paid_num = toDotDecimal(amount_paid);

    // Vérification de l'authentification
    const stmtUser = db.prepare('SELECT password2 FROM utilisateur WHERE numero_util = ?');
    stmtUser.bind([numero_util]);
    const user = stmtUser.step() ? stmtUser.getAsObject() : null;
    stmtUser.free();

    if (!user || user.password2 !== password2) {
      return { erreur: "Authentification invalide", status: 401 };
    }

    db.run('BEGIN TRANSACTION');

    try {
      // Sauvegarder l'ancien état avant modification
      const ancienEncaisse = await getAncienEncaisse(numero_comande, db);
      const ancienSoldeRestant = ancienEncaisse ? toDotDecimal(ancienEncaisse.soldeR || '0,00') : 0;
      
      // Restaurer l'ancien état (stock et solde client)
      await restaurerAncienneVente(numero_comande, db);

      // Mettre à jour la commande
      const nature = numero_table == 0 ? "TICKET" : "BON DE L.";
      const stmtUpdate = db.prepare(`
        UPDATE comande SET numero_table = ?, nature = ?, numero_util = ? WHERE numero_comande = ?
      `);
      stmtUpdate.run([numero_table, nature, numero_util, numero_comande]);
      stmtUpdate.free();

      // Traiter les nouvelles lignes
      let total_vente = 0;
      for (const ligne of lignes) {
        const quantite = toDotDecimal(ligne.quantite || '1');
        const prix_unitaire = toDotDecimal(ligne.remarque || '0,00');
        const prixt = quantite * prix_unitaire;
        total_vente += prixt;

        const prixt_str = toCommaDecimal(prixt);
        const prixbh_str = toCommaDecimal(toDotDecimal(ligne.prixbh || '0,00'));

        const stmtAttache = db.prepare(`
          INSERT INTO attache (numero_comande, numero_item, quantite, prixt, remarque, prixbh, achatfx, send)
          VALUES (?, ?, ?, ?, ?, ?, 0, 1)
        `);
        stmtAttache.run([
          numero_comande,
          ligne.numero_item,
          quantite,
          prixt_str,
          ligne.remarque || '',
          prixbh_str
        ]);
        stmtAttache.free();

        const stmtUpdateStock = db.prepare('UPDATE item SET qte = qte - ? WHERE numero_item = ?');
        stmtUpdateStock.run([quantite, ligne.numero_item]);
        stmtUpdateStock.free();
      }

      // Calcul du reste dû
      const reste = total_vente - amount_paid_num; // positif si dette
      const nouveau_solde_restant = payment_mode === 'a_terme' ? -reste : 0;

      const total_vente_str = toCommaDecimal(total_vente);
      const montant_reglement_str = toCommaDecimal(payment_mode === 'espece' ? total_vente : amount_paid_num);
      const nouveau_solde_restant_str = toCommaDecimal(nouveau_solde_restant);

      // Mettre à jour l'encaisse
      const stmtEncaisse = db.prepare(`
        UPDATE encaisse SET apaye = ?, reglement = ?, ht = ?, soldeR = ? WHERE numero_comande = ?
      `);
      stmtEncaisse.run([
        total_vente_str,
        montant_reglement_str,
        total_vente_str,
        nouveau_solde_restant_str,
        numero_comande
      ]);
      stmtEncaisse.free();

      // Mise à jour du solde client (cumule négatif)
      if (payment_mode === 'a_terme' && numero_table != 0) {
        const difference_solde = nouveau_solde_restant - ancienSoldeRestant;
        const stmtClient = db.prepare('UPDATE client SET solde = solde + ? WHERE numero_clt = ?');
        stmtClient.run([toCommaDecimal(difference_solde), numero_table]);
        stmtClient.free();
      }

      db.run('COMMIT');
      saveDbToLocalStorage(db);

      return {
        statut: "Vente modifiée",
        numero_comande,
        total_vente: total_vente_str,
        status: 200
      };

    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error("Erreur modifierVente:", error);
    return { erreur: error.message, status: 500 };
  }
}
export async function annulerVente(data) {
  try {
    console.log("Exécution de annulerVente avec data:", data);
    const db = await getDb();
    
    const { numero_comande, password2 } = data;

    if (!numero_comande || !password2) {
      return { erreur: "Données manquantes", status: 400 };
    }

    // Récupérer la commande
    const stmtComande = db.prepare('SELECT numero_table, numero_util FROM comande WHERE numero_comande = ?');
    stmtComande.bind([numero_comande]);
    const commande = stmtComande.step() ? stmtComande.getAsObject() : null;
    stmtComande.free();

    if (!commande) {
      return { erreur: "Commande non trouvée", status: 404 };
    }

    // Vérifier mot de passe
    const stmtUser = db.prepare('SELECT password2 FROM utilisateur WHERE numero_util = ?');
    stmtUser.bind([commande.numero_util]);
    const user = stmtUser.step() ? stmtUser.getAsObject() : null;
    stmtUser.free();

    if (!user || user.password2 !== password2) {
      return { erreur: "Mot de passe incorrect", status: 401 };
    }

    db.run('BEGIN TRANSACTION');

    try {
      // 1. Restaurer stock et solde client
      await restaurerAncienneVente(numero_comande, db);

      // 2. Supprimer la vente
      const stmtDeleteAttache = db.prepare('DELETE FROM attache WHERE numero_comande = ?');
      stmtDeleteAttache.run([numero_comande]);
      stmtDeleteAttache.free();

      const stmtDeleteEncaisse = db.prepare('DELETE FROM encaisse WHERE numero_comande = ?');
      stmtDeleteEncaisse.run([numero_comande]);
      stmtDeleteEncaisse.free();

      const stmtDeleteComande = db.prepare('DELETE FROM comande WHERE numero_comande = ?');
      stmtDeleteComande.run([numero_comande]);
      stmtDeleteComande.free();

      db.run('COMMIT');
      saveDbToLocalStorage(db);

      return { statut: "Vente annulée", status: 200 };

    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error("Erreur annulerVente:", error);
    return { erreur: error.message, status: 500 };
  }
}
async function restaurerAncienneVente(numero_comande, db) {
  // Récupérer les anciennes lignes de vente
  const stmtLignes = db.prepare('SELECT numero_item, quantite FROM attache WHERE numero_comande = ?');
  stmtLignes.bind([numero_comande]);
  const lignes = [];
  while (stmtLignes.step()) {
    lignes.push(stmtLignes.getAsObject());
  }
  stmtLignes.free();

  // Restaurer le stock
  for (const ligne of lignes) {
    const stmtRestore = db.prepare('UPDATE item SET qte = qte + ? WHERE numero_item = ?');
    stmtRestore.run([ligne.quantite, ligne.numero_item]);
    stmtRestore.free();
  }

  // Restaurer le solde client
  const stmtEncaisse = db.prepare('SELECT soldeR FROM encaisse WHERE numero_comande = ?');
  stmtEncaisse.bind([numero_comande]);
  const encaisse = stmtEncaisse.step() ? stmtEncaisse.getAsObject() : null;
  stmtEncaisse.free();

  const stmtComande = db.prepare('SELECT numero_table FROM comande WHERE numero_comande = ?');
  stmtComande.bind([numero_comande]);
  const commande = stmtComande.step() ? stmtComande.getAsObject() : null;
  stmtComande.free();

  if (encaisse && commande && commande.numero_table != 0) {
    const ancien_solde_restant = toDotDecimal(encaisse.soldeR || '0,00');
    // si ancien_solde_restant = -100 → on fait +100 pour l'annuler
    const correction = -ancien_solde_restant;

    const stmtClient = db.prepare('UPDATE client SET solde = solde + ? WHERE numero_clt = ?');
    stmtClient.run([toCommaDecimal(correction), commande.numero_table]);
    stmtClient.free();

    console.log(`✅ Solde client restauré: correction = ${correction}`);
  }
}

export async function getVente(numero_comande) {
  try {
    console.log("Exécution de getVente:", numero_comande);
    const db = await getDb();

    const stmtComande = db.prepare(`
      SELECT c.*, cl.nom as client_nom, u.nom as utilisateur_nom 
      FROM comande c
      LEFT JOIN client cl ON c.numero_table = cl.numero_clt
      LEFT JOIN utilisateur u ON c.numero_util = u.numero_util
      WHERE c.numero_comande = ?
    `);
    stmtComande.bind([numero_comande]);
    const commande = stmtComande.step() ? stmtComande.getAsObject() : null;
    stmtComande.free();

    if (!commande) {
      return { erreur: "Commande non trouvée", status: 404 };
    }

    const stmtLignes = db.prepare(`
      SELECT a.*, i.designation 
      FROM attache a
      JOIN item i ON a.numero_item = i.numero_item
      WHERE a.numero_comande = ?
    `);
    stmtLignes.bind([numero_comande]);
    const lignes = [];
    while (stmtLignes.step()) {
      lignes.push(stmtLignes.getAsObject());
    }
    stmtLignes.free();

    return {
      numero_comande: commande.numero_comande,
      numero_table: commande.numero_table,
      date_comande: commande.date_comande,
      nature: commande.nature,
      client_nom: commande.client_nom || 'Comptoir',
      utilisateur_nom: commande.utilisateur_nom,
      lignes: lignes.map(ligne => ({
        numero_item: ligne.numero_item,
        designation: ligne.designation,
        quantite: ligne.quantite,
        prixt: ligne.prixt,
        remarque: ligne.remarque,
        prixbh: ligne.prixbh
      })),
      status: 200
    };

  } catch (error) {
    console.error("Erreur getVente:", error);
    return { erreur: error.message, status: 500 };
  }
}
export async function ventesJour(params = {}) {
  try {
    console.log("Exécution de ventesJour avec params:", params);
    const db = await getDb();

    const { date, numero_clt, numero_util } = params;
    let date_start, date_end;

    if (date) {
      date_start = `${date} 00:00:00`;
      date_end = `${date} 23:59:59`;
    } else {
      const today = new Date().toISOString().split('T')[0];
      date_start = `${today} 00:00:00`;
      date_end = `${today} 23:59:59`;
    }

    let query = `
      SELECT c.*, cl.nom as client_nom, u.nom as utilisateur_nom,
             a.numero_item, a.quantite, a.prixt, a.remarque, i.designation
      FROM comande c
      LEFT JOIN client cl ON c.numero_table = cl.numero_clt
      LEFT JOIN utilisateur u ON c.numero_util = u.numero_util
      JOIN attache a ON c.numero_comande = a.numero_comande
      JOIN item i ON a.numero_item = i.numero_item
      WHERE c.date_comande BETWEEN ? AND ?
    `;

    const queryParams = [date_start, date_end];

    if (numero_clt && numero_clt !== '0') {
      query += ' AND c.numero_table = ?';
      queryParams.push(parseInt(numero_clt));
    }

    if (numero_util && numero_util !== '0') {
      query += ' AND c.numero_util = ?';
      queryParams.push(parseInt(numero_util));
    }

    query += ' ORDER BY c.numero_comande DESC';

    const stmt = db.prepare(query);
    stmt.bind(queryParams);

    const ventesMap = {};
    let total = 0;

    while (stmt.step()) {
      const row = stmt.getAsObject();
      const numero_comande = row.numero_comande;

      if (!ventesMap[numero_comande]) {
        ventesMap[numero_comande] = {
          numero_comande: row.numero_comande,
          date_comande: row.date_comande,
          nature: row.nature,
          client_nom: row.numero_table == 0 ? 'Comptoir' : row.client_nom,
          utilisateur_nom: row.utilisateur_nom,
          lignes: []
        };
      }

      ventesMap[numero_comande].lignes.push({
        numero_item: row.numero_item,
        designation: row.designation,
        quantite: row.quantite,
        prixt: row.prixt,
        remarque: row.remarque
      });

      total += toDotDecimal(row.prixt);
    }
    stmt.free();

    const tickets = [];
    const bons = [];

    Object.values(ventesMap).forEach(vente => {
      if (vente.nature === 'TICKET') {
        tickets.push(vente);
      } else {
        bons.push(vente);
      }
    });

    return {
      tickets,
      bons,
      total: toCommaDecimal(total),
      status: 200
    };

  } catch (error) {
    console.error("Erreur ventesJour:", error);
    return { erreur: error.message, status: 500 };
  }
}
import { getDb, saveDbToLocalStorage } from "./db.js";
import { toDotDecimal, toCommaDecimal } from "./helpers.js";

export async function validerReception(data) {
  try {
    console.log("Exécution de validerReception avec data:", data);
    const db = await getDb();

    // 1. Validation des données
    if (!data || !data.lignes || !data.numero_four || !data.numero_util || !data.password2) {
      return { erreur: "Données invalides (fournisseur, utilisateur ou mot de passe manquant)", status: 400 };
    }

    const numero_four = data.numero_four;
    const numero_util = data.numero_util;
    const password2 = data.password2;
    const lignes = data.lignes;
    const nature = "Bon de réception";

    // 2. Vérification de l'utilisateur
    const stmtUser = db.prepare("SELECT numero_util, nom, password2 FROM utilisateur WHERE numero_util = ?");
    stmtUser.bind([numero_util]);
    let user = null;
    if (stmtUser.step()) {
      user = stmtUser.getAsObject();
    }
    stmtUser.free();

    if (!user || user.PASSWORD2 !== password2) {
      return { erreur: "Authentification invalide", status: 401 };
    }

    // 3. Vérification du fournisseur
    const stmtFour = db.prepare("SELECT numero_fou FROM fournisseur WHERE numero_fou = ?");
    stmtFour.bind([numero_four]);
    if (!stmtFour.step()) {
      stmtFour.free();
      return { erreur: "Fournisseur non trouvé", status: 400 };
    }
    stmtFour.free();

    db.run("BEGIN TRANSACTION");

    try {
      // 4. Création du mouvement
      const stmtMouv = db.prepare(`
        INSERT INTO mouvement (date_m, etat_m, numero_four, refdoc, vers, nature, connection1, numero_util, cheque)
        VALUES (datetime('now'), 'cloture', ?, '', '', ?, 0, ?, '')
      `);
      stmtMouv.run([numero_four, nature, numero_util]);
      stmtMouv.free();

      // Récupérer l'ID du mouvement
      const idStmt = db.prepare("SELECT last_insert_rowid() AS numero_mouvement");
      idStmt.step();
      const { numero_mouvement } = idStmt.getAsObject();
      idStmt.free();

      // Mettre à jour le refdoc
      const stmtRefdoc = db.prepare("UPDATE mouvement SET refdoc = ? WHERE numero_mouvement = ?");
      stmtRefdoc.run([String(numero_mouvement), numero_mouvement]);
      stmtRefdoc.free();

      let total_cost = 0.0;

      // 5. Traitement des lignes
      for (const ligne of lignes) {
        const numero_item = ligne.numero_item;
        const qtea = toDotDecimal(ligne.qtea || "0");
        const prixbh = toDotDecimal(ligne.prixbh || "0");

        if (qtea <= 0) throw new Error("La quantité doit être positive");

        // Charger l'article
        const stmtItem = db.prepare(`
          SELECT qte, CAST(COALESCE(NULLIF(REPLACE(prixba, ',', '.'), ''), '0') AS FLOAT) AS prixba
          FROM item WHERE numero_item = ?
        `);
        stmtItem.bind([numero_item]);
        if (!stmtItem.step()) {
          stmtItem.free();
          throw new Error(`Article ${numero_item} non trouvé`);
        }
        const item = stmtItem.getAsObject();
        stmtItem.free();

        const current_qte = parseFloat(item.qte || 0);
        const prixba = parseFloat(item.prixba || 0);
        const nqte = current_qte + qtea;

        total_cost += qtea * prixbh;

        const prixbh_str = toCommaDecimal(prixbh);
        const prixba_str = toCommaDecimal(prixba);

        // Insérer dans attache2
        const stmtAtt = db.prepare(`
          INSERT INTO attache2 (numero_item, numero_mouvement, qtea, nqte, nprix, pump, send)
          VALUES (?, ?, ?, ?, ?, ?, 1)
        `);
        stmtAtt.run([numero_item, numero_mouvement, qtea, nqte, prixbh_str, prixba_str]);
        stmtAtt.free();

        // Mise à jour stock + fournisseur de l'article
        const stmtUpdateItem = db.prepare("UPDATE item SET qte = ?, prixba = ?, numero_fou = ? WHERE numero_item = ?");
        stmtUpdateItem.run([nqte, prixbh_str, numero_four, numero_item]);
        stmtUpdateItem.free();
      }

      // 6. Mise à jour du solde fournisseur (format TEXT cumulé)
      const stmtSolde = db.prepare(`
        SELECT CAST(COALESCE(NULLIF(REPLACE(solde, ',', '.'), ''), '0') AS FLOAT) AS solde
        FROM fournisseur WHERE numero_fou = ?
      `);
      stmtSolde.bind([numero_four]);
      stmtSolde.step();
      const fournisseur = stmtSolde.getAsObject();
      stmtSolde.free();

      const current_solde = parseFloat(fournisseur.solde || 0);
      const new_solde = current_solde - total_cost;
      const new_solde_str = toCommaDecimal(new_solde);

      const stmtUpdateFour = db.prepare("UPDATE fournisseur SET solde = ? WHERE numero_fou = ?");
      stmtUpdateFour.run([new_solde_str, numero_four]);
      stmtUpdateFour.free();

      db.run("COMMIT");
      saveDbToLocalStorage(db);

      return { success: true, numero_mouvement, new_solde: new_solde_str, status: 200 };

    } catch (err) {
      db.run("ROLLBACK");
      console.error("Erreur validerReception transaction:", err);
      throw err;
    }

  } catch (error) {
    console.error("Erreur validerReception:", error);
    return { erreur: error.message, status: 500 };
  }
}
