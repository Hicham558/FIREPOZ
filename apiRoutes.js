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

// Fonction pour calculer le chiffre de contrôle EAN-13
function calculateEAN13CheckDigit(code12) {
  if (code12.length !== 12) return '0';
  
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(code12[i]);
    sum += (i % 2 === 0) ? digit : digit * 3;
  }
  
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit.toString();
}

// apiRoutes.js - Nouvelles fonctions pour les versements

// Fonction pour ajouter un versement
export async function ajouterVersement(data) {
  try {
    console.log("Exécution de ajouterVersement avec data:", data);
    const db = await getDb();

    // 1. Validation des données
    if (!data || !data.type || !data.numero_cf || !data.montant || !data.numero_util || !data.password2) {
      return { error: "Type, numéro client/fournisseur, montant, utilisateur ou mot de passe manquant", status: 400 };
    }

    const { type, numero_cf, montant, justificatif = '', numero_util, password2 } = data;

    if (type !== 'C' && type !== 'F') {
      return { error: "Type invalide (doit être 'C' ou 'F')", status: 400 };
    }

    const montant_decimal = toDotDecimal(montant);
    if (montant_decimal === 0) {
      return { error: "Le montant ne peut pas être zéro", status: 400 };
    }

    // 2. Vérification de l'authentification
    const stmtUser = db.prepare("SELECT numero_util, nom, password2 FROM utilisateur WHERE numero_util = ?");
    stmtUser.bind([numero_util]);
    let user = null;
    if (stmtUser.step()) {
      user = stmtUser.getAsObject();
    }
    stmtUser.free();

    if (!user || user.PASSWORD2 !== password2) {
      return { error: "Authentification invalide", status: 401 };
    }

    db.run('BEGIN TRANSACTION');

    try {
      // 3. Vérification de l'entité (client ou fournisseur)
      let table, id_column, origine;
      if (type === 'C') {
        table = 'client';
        id_column = 'numero_clt';
        origine = 'VERSEMENT C';
      } else {
        table = 'fournisseur';
        id_column = 'numero_fou';
        origine = 'VERSEMENT F';
      }

      // Vérifier si l'entité existe et récupérer le solde actuel
      const stmtEntity = db.prepare(`SELECT solde FROM ${table} WHERE ${id_column} = ?`);
      stmtEntity.bind([numero_cf]);
      const entity = stmtEntity.step() ? stmtEntity.getAsObject() : null;
      stmtEntity.free();

      if (!entity) {
        db.run('ROLLBACK');
        return { error: `${type === 'C' ? 'Client' : 'Fournisseur'} non trouvé`, status: 400 };
      }

      // 4. Calcul du nouveau solde (CUMUL)
      const current_solde = toDotDecimal(entity.solde || '0,00');
      const new_solde = current_solde + montant_decimal;
      const new_solde_str = toCommaDecimal(new_solde);

      console.log(`Calcul solde: ${current_solde} (ancien) + ${montant_decimal} (versement) = ${new_solde} (nouveau)`);

      // 5. Mise à jour du solde (CUMUL)
      const stmtUpdate = db.prepare(`UPDATE ${table} SET solde = ? WHERE ${id_column} = ?`);
      stmtUpdate.run([new_solde_str, numero_cf]);
      stmtUpdate.free();

      // 6. Enregistrement du mouvement dans MOUVEMENTC
      const now = new Date();
      const date_mc = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const time_mc = now.toISOString().replace('T', ' ').slice(0, 19); // YYYY-MM-DD HH:MM:SS

      const stmtMouvement = db.prepare(`
        INSERT INTO mouvementc (date_mc, time_mc, montant, justificatif, numero_util, origine, cf, numero_cf)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmtMouvement.run([
        date_mc,
        time_mc,
        toCommaDecimal(montant_decimal),
        justificatif,
        numero_util,
        origine,
        type,
        numero_cf
      ]);
      stmtMouvement.free();

      // 7. Récupérer l'ID du mouvement créé
      const idStmt = db.prepare('SELECT last_insert_rowid() AS numero_mc');
      idStmt.step();
      const { numero_mc } = idStmt.getAsObject();
      idStmt.free();

      db.run('COMMIT');
      saveDbToLocalStorage(db);

      console.log(`Versement ajouté: numero_mc=${numero_mc}, type=${type}, montant=${toCommaDecimal(montant_decimal)}, ancien_solde=${toCommaDecimal(current_solde)}, nouveau_solde=${new_solde_str}`);

      return {
        success: true,
        numero_mc,
        statut: "Versement ajouté",
        ancien_solde: toCommaDecimal(current_solde),
        nouveau_solde: new_solde_str,
        status: 201
      };

    } catch (error) {
      db.run('ROLLBACK');
      console.error("Erreur dans la transaction:", error);
      throw error;
    }

  } catch (error) {
    console.error("Erreur ajouterVersement:", error);
    return { error: error.message, status: 500 };
  }
}
// Fonction pour récupérer l'historique des versements
export async function historiqueVersements(params = {}) {
  try {
    console.log("Exécution de historiqueVersements avec params:", params);
    const db = await getDb();

    const { date, type } = params;
    let date_start, date_end;

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { erreur: 'Format de date invalide (attendu: YYYY-MM-DD)', status: 400 };
      }
      date_start = `${date} 00:00:00`;
      date_end = `${date} 23:59:59`;
    } else {
      const today = new Date().toISOString().split('T')[0];
      date_start = `${today} 00:00:00`;
      date_end = `${today} 23:59:59`;
    }

    let query = `
      SELECT 
        mc.numero_mc,
        mc.date_mc,
        mc.montant,
        mc.justificatif,
        mc.cf,
        mc.numero_cf,
        mc.numero_util,
        COALESCE(cl.nom, f.nom) AS nom_cf,
        u.nom AS utilisateur_nom
      FROM mouvementc mc
      LEFT JOIN client cl ON mc.cf = 'C' AND mc.numero_cf = cl.numero_clt
      LEFT JOIN fournisseur f ON mc.cf = 'F' AND mc.numero_cf = f.numero_fou
      LEFT JOIN utilisateur u ON mc.numero_util = u.numero_util
      WHERE mc.time_mc BETWEEN ? AND ?
      AND mc.origine IN ('VERSEMENT C', 'VERSEMENT F')
    `;

    const params_query = [date_start, date_end];

    if (type && (type === 'C' || type === 'F')) {
      query += " AND mc.cf = ?";
      params_query.push(type);
    }

    query += " ORDER BY mc.date_mc DESC, mc.time_mc DESC";

    const stmt = db.prepare(query);
    stmt.bind(params_query);

    const versements = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      versements.push({
        numero_mc: row.numero_mc,
        date_mc: row.date_mc,
        montant: row.montant ? row.montant.toString() : '0,00',
        justificatif: row.justificatif || '',
        type: row.cf === 'C' ? 'Client' : 'Fournisseur',
        numero_cf: row.numero_cf,
        nom_cf: row.nom_cf || 'N/A',
        utilisateur_nom: row.utilisateur_nom || 'N/A'
      });
    }
    stmt.free();

    return versements;

  } catch (error) {
    console.error("Erreur historiqueVersements:", error);
    return { erreur: error.message, status: 500 };
  }
}

// Fonction pour récupérer la situation des versements
export async function situationVersements(params = {}) {
  try {
    console.log("Exécution de situationVersements avec params:", params);
    const db = await getDb();

    const { type, numero_cf } = params;

    if (!type || (type !== 'C' && type !== 'F')) {
      return { erreur: "Paramètre 'type' requis et doit être 'C' ou 'F'", status: 400 };
    }
    if (!numero_cf) {
      return { erreur: "Paramètre 'numero_cf' requis", status: 400 };
    }

    const query = `
      SELECT 
        mc.numero_mc,
        mc.date_mc,
        mc.montant,
        mc.justificatif,
        mc.cf,
        mc.numero_cf,
        mc.numero_util,
        COALESCE(cl.nom, f.nom) AS nom_cf,
        u.nom AS utilisateur_nom
      FROM mouvementc mc
      LEFT JOIN client cl ON mc.cf = 'C' AND mc.numero_cf = cl.numero_clt
      LEFT JOIN fournisseur f ON mc.cf = 'F' AND mc.numero_cf = f.numero_fou
      LEFT JOIN utilisateur u ON mc.numero_util = u.numero_util
      WHERE mc.origine IN ('VERSEMENT C', 'VERSEMENT F')
      AND mc.cf = ?
      AND mc.numero_cf = ?
      ORDER BY mc.date_mc DESC, mc.time_mc DESC
    `;

    const stmt = db.prepare(query);
    stmt.bind([type, numero_cf]);

    const versements = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      versements.push({
        numero_mc: row.numero_mc,
        date_mc: row.date_mc,
        montant: row.montant ? row.montant.toString() : '0,00',
        justificatif: row.justificatif || '',
        cf: row.cf,
        numero_cf: row.numero_cf,
        nom_cf: row.nom_cf || 'N/A',
        utilisateur_nom: row.utilisateur_nom || 'N/A'
      });
    }
    stmt.free();

    console.log(`Situation versements: type=${type}, numero_cf=${numero_cf}, ${versements.length} versements`);
    return versements;

  } catch (error) {
    console.error("Erreur situationVersements:", error);
    return { erreur: error.message, status: 500 };
  }
}

// Fonction pour modifier un versement
export async function modifierVersement(data) {
  try {
    console.log("Exécution de modifierVersement avec data:", data);
    const db = await getDb();

    const { numero_mc, type, numero_cf, montant, justificatif = '', numero_util, password2 } = data;

    if (!numero_mc || !type || !numero_cf || !montant || !numero_util || !password2) {
      return { error: "Numéro de versement, type, numéro client/fournisseur, montant, utilisateur ou mot de passe manquant", status: 400 };
    }

    if (type !== 'C' && type !== 'F') {
      return { error: "Type invalide (doit être 'C' ou 'F')", status: 400 };
    }

    const montant_decimal = toDotDecimal(montant);
    if (montant_decimal === 0) {
      return { error: "Le montant ne peut pas être zéro", status: 400 };
    }

    db.run('BEGIN TRANSACTION');

    try {
      // Vérification de l'utilisateur et du mot de passe
      const stmtUser = db.prepare("SELECT password2 FROM utilisateur WHERE numero_util = ?");
      stmtUser.bind([numero_util]);
      const utilisateur = stmtUser.step() ? stmtUser.getAsObject() : null;
      stmtUser.free();

      if (!utilisateur || utilisateur.password2 !== password2) {
        db.run('ROLLBACK');
        return { error: "Utilisateur non trouvé ou mot de passe incorrect", status: 401 };
      }

      // Vérification du versement existant
      const stmtVersement = db.prepare("SELECT montant, cf, numero_cf FROM mouvementc WHERE numero_mc = ? AND origine IN ('VERSEMENT C', 'VERSEMENT F')");
      stmtVersement.bind([numero_mc]);
      const versement = stmtVersement.step() ? stmtVersement.getAsObject() : null;
      stmtVersement.free();

      if (!versement) {
        db.run('ROLLBACK');
        return { error: "Versement non trouvé", status: 404 };
      }

      // Détermination de la table
      let table, id_column, origine;
      if (versement.cf === 'C') {
        table = 'client';
        id_column = 'numero_clt';
        origine = 'VERSEMENT C';
      } else {
        table = 'fournisseur';
        id_column = 'numero_fou';
        origine = 'VERSEMENT F';
      }

      // Vérification de l'entité (client ou fournisseur)
      const stmtEntity = db.prepare(`SELECT solde FROM ${table} WHERE ${id_column} = ?`);
      stmtEntity.bind([numero_cf]);
      const entity = stmtEntity.step() ? stmtEntity.getAsObject() : null;
      stmtEntity.free();

      if (!entity) {
        db.run('ROLLBACK');
        return { error: `${versement.cf === 'C' ? 'Client' : 'Fournisseur'} non trouvé`, status: 400 };
      }

      // Calcul du nouveau solde
      const old_montant = toDotDecimal(versement.montant);
      const current_solde = toDotDecimal(entity.solde || '0,00');
      const solde_change = -old_montant + montant_decimal;
      const new_solde = current_solde + solde_change;
      const new_solde_str = toCommaDecimal(new_solde);

      // Mise à jour du solde
      const stmtUpdate = db.prepare(`UPDATE ${table} SET solde = ? WHERE ${id_column} = ?`);
      stmtUpdate.run([new_solde_str, numero_cf]);
      stmtUpdate.free();

      // Mise à jour du versement dans mouvementc
      const now = new Date();
      const date_mc = now.toISOString().split('T')[0];
      const time_mc = formatDateForSQLite(now);

      const stmtUpdateVersement = db.prepare(`
        UPDATE mouvementc 
        SET montant = ?, justificatif = ?, date_mc = ?, time_mc = ?
        WHERE numero_mc = ? AND origine = ?
      `);
      stmtUpdateVersement.run([
        toCommaDecimal(montant_decimal),
        justificatif,
        date_mc,
        time_mc,
        numero_mc,
        origine
      ]);
      const changes = db.getRowsModified();
      stmtUpdateVersement.free();

      if (changes === 0) {
        db.run('ROLLBACK');
        return { error: "Versement non modifié", status: 500 };
      }

      db.run('COMMIT');
      saveDbToLocalStorage(db);

      console.log(`Versement modifié: numero_mc=${numero_mc}, type=${type}, montant=${toCommaDecimal(montant_decimal)}, justificatif=${justificatif}`);
      return { statut: "Versement modifié", numero_mc, status: 200 };

    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error("Erreur modifierVersement:", error);
    return { error: error.message, status: 500 };
  }
}

// Fonction pour annuler un versement
export async function annulerVersement(data) {
  try {
    console.log("Exécution de annulerVersement avec data:", data);
    const db = await getDb();

    const { numero_mc, type, numero_cf, numero_util, password2 } = data;

    if (!numero_mc || !type || !numero_cf || !numero_util || !password2) {
      return { error: "Numéro de versement, type, numéro client/fournisseur, utilisateur ou mot de passe manquant", status: 400 };
    }

    if (type !== 'C' && type !== 'F') {
      return { error: "Type invalide (doit être 'C' ou 'F')", status: 400 };
    }

    db.run('BEGIN TRANSACTION');

    try {
      // Vérification de l'utilisateur et du mot de passe
      const stmtUser = db.prepare("SELECT password2 FROM utilisateur WHERE numero_util = ?");
      stmtUser.bind([numero_util]);
      const utilisateur = stmtUser.step() ? stmtUser.getAsObject() : null;
      stmtUser.free();

      if (!utilisateur || utilisateur.password2 !== password2) {
        db.run('ROLLBACK');
        return { error: "Utilisateur non trouvé ou mot de passe incorrect", status: 401 };
      }

      // Vérification du versement existant
      const stmtVersement = db.prepare("SELECT montant, cf, numero_cf FROM mouvementc WHERE numero_mc = ? AND origine IN ('VERSEMENT C', 'VERSEMENT F')");
      stmtVersement.bind([numero_mc]);
      const versement = stmtVersement.step() ? stmtVersement.getAsObject() : null;
      stmtVersement.free();

      if (!versement) {
        db.run('ROLLBACK');
        return { error: "Versement non trouvé", status: 404 };
      }

      // Vérification de la cohérence du type
      if (type !== versement.cf) {
        db.run('ROLLBACK');
        return { error: "Type ne correspond pas au versement", status: 400 };
      }

      // Détermination de la table
      let table, id_column;
      if (versement.cf === 'C') {
        table = 'client';
        id_column = 'numero_clt';
      } else {
        table = 'fournisseur';
        id_column = 'numero_fou';
      }

      // Vérification de l'entité (client ou fournisseur)
      const stmtEntity = db.prepare(`SELECT solde FROM ${table} WHERE ${id_column} = ?`);
      stmtEntity.bind([numero_cf]);
      const entity = stmtEntity.step() ? stmtEntity.getAsObject() : null;
      stmtEntity.free();

      if (!entity) {
        db.run('ROLLBACK');
        return { error: `${versement.cf === 'C' ? 'Client' : 'Fournisseur'} non trouvé`, status: 400 };
      }

      // Calcul du nouveau solde
      const montant = toDotDecimal(versement.montant);
      const current_solde = toDotDecimal(entity.solde || '0,00');
      const new_solde = current_solde - montant;
      const new_solde_str = toCommaDecimal(new_solde);

      // Mise à jour du solde
      const stmtUpdate = db.prepare(`UPDATE ${table} SET solde = ? WHERE ${id_column} = ?`);
      stmtUpdate.run([new_solde_str, numero_cf]);
      stmtUpdate.free();

      // Suppression du versement
      const stmtDelete = db.prepare("DELETE FROM mouvementc WHERE numero_mc = ?");
      stmtDelete.run([numero_mc]);
      const changes = db.getRowsModified();
      stmtDelete.free();

      if (changes === 0) {
        db.run('ROLLBACK');
        return { error: "Versement non supprimé", status: 500 };
      }

      db.run('COMMIT');
      saveDbToLocalStorage(db);

      console.log(`Versement annulé: numero_mc=${numero_mc}, type=${type}, montant=${toCommaDecimal(montant)}`);
      return { statut: "Versement annulé", numero_mc, status: 200 };

    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error("Erreur annulerVersement:", error);
    return { error: error.message, status: 500 };
  }
}

// GET /liste_codebar_lies
export async function listeCodebarLies(params) {
  try {
    console.log('Exécution de listeCodebarLies avec params:', params);
    const db = await getDb();
    
    const { numero_item } = params;
    
    if (!numero_item) {
      return { erreur: 'numero_item est requis', status: 400 };
    }

    // Vérifier si l'item existe
    const stmtCheckItem = db.prepare('SELECT 1 FROM item WHERE numero_item = ?');
    stmtCheckItem.bind([numero_item]);
    const itemExists = stmtCheckItem.step() && stmtCheckItem.get();
    stmtCheckItem.free();
    
    if (!itemExists) {
      return { erreur: 'Produit non trouvé', status: 404 };
    }

    // Récupérer les codes-barres liés
    const stmt = db.prepare('SELECT bar2 FROM codebar WHERE bar = ? ORDER BY n');
    stmt.bind([numero_item]);
    
    const linkedBarcodes = [];
    while (stmt.step()) {
      const row = stmt.get();
      if (row[0]) {
        linkedBarcodes.push(row[0].toString());
      }
    }
    stmt.free();

    console.log('Codes-barres liés trouvés:', linkedBarcodes);
    return { linked_barcodes: linkedBarcodes, status: 200 };

  } catch (error) {
    console.error('Erreur listeCodebarLies:', error);
    return { erreur: error.message, status: 500 };
  }
}

// POST /ajouter_codebar_lie
export async function ajouterCodebarLie(data) {
  try {
    console.log('Exécution de ajouterCodebarLie avec data:', data);
    const db = await getDb();
    
    const { numero_item, barcode } = data;
    
    if (!numero_item) {
      return { erreur: 'numero_item est requis', status: 400 };
    }

    // Vérifier si l'item existe
    const stmtCheckItem = db.prepare('SELECT 1 FROM item WHERE numero_item = ?');
    stmtCheckItem.bind([numero_item]);
    const itemExists = stmtCheckItem.step() && stmtCheckItem.get();
    stmtCheckItem.free();
    
    if (!itemExists) {
      return { erreur: 'Produit non trouvé', status: 404 };
    }

    let finalBarcode = barcode;
    
    // Si aucun code-barres fourni, générer un EAN-13
    if (!finalBarcode) {
      // Récupérer tous les codes-barres existants
      const stmtAllBarcodes = db.prepare('SELECT bar2 FROM codebar');
      const existingBarcodes = [];
      while (stmtAllBarcodes.step()) {
        const row = stmtAllBarcodes.get();
        if (row[0]) {
          existingBarcodes.push(row[0].toString());
        }
      }
      stmtAllBarcodes.free();

      // Trouver le prochain numéro disponible
      let nextNumber = 1;
      const usedNumbers = [];
      
      for (const code of existingBarcodes) {
        if (code.startsWith('1') && code.length === 13) {
          const numericPart = code.substring(1, 12);
          if (/^\d{11}$/.test(numericPart)) {
            usedNumbers.push(parseInt(numericPart));
          }
        }
      }
      
      usedNumbers.sort((a, b) => a - b);
      
      for (const num of usedNumbers) {
        if (num === nextNumber) {
          nextNumber++;
        } else if (num > nextNumber) {
          break;
        }
      }
      
      // Générer le code EAN-13
      const code12 = `1${nextNumber.toString().padStart(11, '0')}`;
      const checkDigit = calculateEAN13CheckDigit(code12);
      finalBarcode = `${code12}${checkDigit}`;
      
      // Vérifier que le code généré n'existe pas déjà
      const stmtCheckBarcode = db.prepare('SELECT 1 FROM codebar WHERE bar2 = ?');
      stmtCheckBarcode.bind([finalBarcode]);
      const barcodeExists = stmtCheckBarcode.step() && stmtCheckBarcode.get();
      stmtCheckBarcode.free();
      
      if (barcodeExists) {
        return { erreur: 'Le code EAN-13 généré existe déjà', status: 409 };
      }
    } else {
      // Vérifier que le code-barres fourni n'existe pas déjà
      const stmtCheckBarcode = db.prepare('SELECT 1 FROM codebar WHERE bar2 = ?');
      stmtCheckBarcode.bind([finalBarcode]);
      const barcodeExists = stmtCheckBarcode.step() && stmtCheckBarcode.get();
      stmtCheckBarcode.free();
      
      if (barcodeExists) {
        return { erreur: 'Ce code-barres lié existe déjà', status: 409 };
      }
    }

    // Insérer le nouveau code-barres lié
    const stmtInsert = db.prepare('INSERT INTO codebar (bar2, bar) VALUES (?, ?)');
    stmtInsert.run([finalBarcode, numero_item]);
    const changes = db.getRowsModified();
    stmtInsert.free();

    if (changes === 0) {
      return { erreur: 'Échec de l\'ajout du code-barres lié', status: 500 };
    }

    // Récupérer l'ID inséré
    const idStmt = db.prepare('SELECT last_insert_rowid() AS id');
    idStmt.step();
    const { id } = idStmt.getAsObject();
    idStmt.free();

    saveDbToLocalStorage(db);
    console.log('Code-barres lié ajouté avec succès:', { id, bar2: finalBarcode });
    
    return { 
      statut: 'Code-barres lié ajouté', 
      id, 
      bar2: finalBarcode, 
      status: 201 
    };

  } catch (error) {
    console.error('Erreur ajouterCodebarLie:', error);
    return { erreur: error.message, status: 500 };
  }
}

// POST /supprimer_codebar_lie
export async function supprimerCodebarLie(data) {
  try {
    console.log('Exécution de supprimerCodebarLie avec data:', data);
    const db = await getDb();
    
    const { numero_item, bar2 } = data;
    
    if (!numero_item || !bar2) {
      return { erreur: 'numero_item et bar2 sont requis', status: 400 };
    }

    // Vérifier que le code-barres lié existe pour cet item
    const stmtCheck = db.prepare('SELECT 1 FROM codebar WHERE bar2 = ? AND bar = ?');
    stmtCheck.bind([bar2, numero_item]);
    const exists = stmtCheck.step() && stmtCheck.get();
    stmtCheck.free();
    
    if (!exists) {
      return { erreur: 'Code-barres lié non trouvé pour ce produit', status: 404 };
    }

    // Supprimer le code-barres lié
    const stmtDelete = db.prepare('DELETE FROM codebar WHERE bar2 = ? AND bar = ?');
    stmtDelete.run([bar2, numero_item]);
    const changes = db.getRowsModified();
    stmtDelete.free();

    if (changes === 0) {
      return { erreur: 'Échec de la suppression du code-barres lié', status: 500 };
    }

    saveDbToLocalStorage(db);
    console.log('Code-barres lié supprimé avec succès:', { bar2 });
    
    return { 
      statut: 'Code-barres lié supprimé', 
      status: 200 
    };

  } catch (error) {
    console.error('Erreur supprimerCodebarLie:', error);
    return { erreur: error.message, status: 500 };
  }
}
export async function rechercherProduitCodebar(codebar) {
  try {
    console.log("📥 Exécution de rechercherProduitCodebar avec codebar:", codebar);
    const db = await getDb();

    if (!codebar) {
      console.error("❌ Erreur : Code-barres requis");
      return { erreur: "Code-barres requis", status: 400 };
    }

    // Première recherche directe dans la table item
    let stmt = db.prepare(`
      SELECT numero_item, bar, designation, prix, prixba, qte
      FROM item
      WHERE bar = ?
    `);
    stmt.bind([codebar]);

    let produit = null;
    let columns = ['numero_item', 'bar', 'designation', 'prix', 'prixba', 'qte'];
    
    if (stmt.step()) {
      const row = stmt.get();
      produit = {};
      for (let i = 0; i < columns.length; i++) {
        produit[columns[i]] = row[i];
      }
      console.log("📦 Produit principal trouvé:", produit);
      
      stmt.free();
      return {
        statut: 'trouvé',
        type: 'principal',
        produit: {
          numero_item: produit.numero_item?.toString() || '',
          bar: produit.bar?.toString() || '',
          designation: produit.designation?.toString() || '',
          prix: toCommaDecimal(toDotDecimal(produit.prix?.toString() || '0')),
          prixba: toCommaDecimal(toDotDecimal(produit.prixba?.toString() || '0')),
          qte: toCommaDecimal(produit.qte?.toString() || '0')
        },
        status: 200
      };
    }
    stmt.free();

    // Deuxième recherche dans la table codebar pour les codes liés
    stmt = db.prepare(`
      SELECT i.numero_item, i.bar, i.designation, i.prix, i.prixba, i.qte
      FROM codebar c
      JOIN item i ON CAST(c.bar AS VARCHAR(50)) = CAST(i.numero_item AS VARCHAR(50))
      WHERE c.bar2 = ?
    `);
    stmt.bind([codebar]);

    if (stmt.step()) {
      const row = stmt.get();
      produit = {};
      for (let i = 0; i < columns.length; i++) {
        produit[columns[i]] = row[i];
      }
      console.log("📦 Produit lié trouvé:", produit);
      
      stmt.free();
      return {
        statut: 'trouvé',
        type: 'lié',
        produit: {
          numero_item: produit.numero_item?.toString() || '',
          bar: produit.bar?.toString() || '',
          designation: produit.designation?.toString() || '',
          prix: toCommaDecimal(toDotDecimal(produit.prix?.toString() || '0')),
          prixba: toCommaDecimal(toDotDecimal(produit.prixba?.toString() || '0')),
          qte: toCommaDecimal(produit.qte?.toString() || '0')
        },
        status: 200
      };
    }
    stmt.free();

    console.log("🔍 Produit non trouvé pour codebar:", codebar);
    return { erreur: "Produit non trouvé", status: 404 };

  } catch (error) {
    console.error("❌ Erreur rechercherProduitCodebar:", error);
    return { erreur: error.message, status: 500 };
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
    console.log("Exécution de getDashboardData avec period:", period);
    const db = await getDb();

    // Calcul des dates de début et fin
    const now = new Date();
    let date_start, date_end;

    if (period === 'week') {
      date_end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      date_start = new Date(now.getTime() - (6 * 24 * 60 * 60 * 1000));
      date_start.setHours(0, 0, 0, 0);
    } else {
      date_start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      date_end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    }

    const date_start_str = date_start.toISOString();
    const date_end_str = date_end.toISOString();

    // Fonction pour parser les décimaux avec virgule
    function parseDecimal(value) {
      if (value === null || value === undefined || value === '') {
        return 0.0;
      }
      try {
        return parseFloat(String(value).replace(',', '.'));
      } catch {
        return 0.0;
      }
    }

    // 1. KPI principaux (CA, profit, nombre de ventes)
    const queryKpi = `
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
    
    const stmtKpi = db.prepare(queryKpi);
    stmtKpi.bind([date_start_str, date_end_str]);
    let kpiData = { total_ca: 0, total_profit: 0, sales_count: 0 };
    if (stmtKpi.step()) {
      kpiData = stmtKpi.getAsObject();
    }
    stmtKpi.free();

    // 2. Articles en rupture de stock
    const stmtLowStock = db.prepare("SELECT COUNT(*) AS low_stock FROM item WHERE qte < 10");
    stmtLowStock.step();
    const lowStockData = stmtLowStock.getAsObject();
    stmtLowStock.free();

    // 3. Meilleur client (AVEC LOG POUR DEBUG)
    const queryTopClient = `
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
    
    const stmtTopClient = db.prepare(queryTopClient);
    stmtTopClient.bind([date_start_str, date_end_str]);
    let topClient = { nom: 'N/A', client_ca: 0 };
    if (stmtTopClient.step()) {
      topClient = stmtTopClient.getAsObject();
      console.log('Top client trouvé:', topClient); // LOG DE DEBUG
    }
    stmtTopClient.free();

    // 4. Données pour le graphique
    const queryChart = `
      SELECT 
        DATE(c.date_comande) AS sale_date,
        COALESCE(SUM(CAST(REPLACE(COALESCE(NULLIF(a.prixt, ''), '0'), ',', '.') AS REAL)), 0) AS daily_ca
      FROM comande c
      JOIN attache a ON c.numero_comande = a.numero_comande
      WHERE c.date_comande >= ? AND c.date_comande <= ?
      GROUP BY DATE(c.date_comande)
      ORDER BY sale_date
    `;
    
    const stmtChart = db.prepare(queryChart);
    stmtChart.bind([date_start_str, date_end_str]);
    const chartData = [];
    while (stmtChart.step()) {
      chartData.push(stmtChart.getAsObject());
    }
    stmtChart.free();

    // 5. Préparation des données du graphique
    const chartLabels = [];
    const chartValues = [];
    const currentDate = new Date(date_start);
    
    while (currentDate <= date_end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      chartLabels.push(dateStr);
      
      const dailyCa = chartData.find(row => row.sale_date === dateStr);
      chartValues.push(dailyCa ? parseDecimal(dailyCa.daily_ca) : 0);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // 6. Retour des données avec gestion sécurisée des valeurs
    const safeParseFloat = (value) => {
      const parsed = parseFloat(value || 0);
      return isNaN(parsed) ? 0.0 : parsed;
    };

    const safeParseInt = (value) => {
      const parsed = parseInt(value || 0);
      return isNaN(parsed) ? 0 : parsed;
    };

    // FORMAT COMPATIBLE AVEC LE HTML - TOUTES LES CLÉS EN MINUSCULES ✅
    return {
      total_ca: safeParseFloat(kpiData.total_ca),
      total_profit: safeParseFloat(kpiData.total_profit),
      sales_count: safeParseInt(kpiData.sales_count),
      low_stock_items: safeParseInt(lowStockData.low_stock),
      top_client: {
        name: topClient.nom || 'N/A',
        ca: safeParseFloat(topClient.client_ca)
      },
      chart_data: {
        labels: chartLabels,
        values: chartValues.map(v => safeParseFloat(v))
      }
    };

  } catch (error) {
    console.error("Erreur getDashboardData:", error);
    return { 
      total_ca: 0,
      total_profit: 0,
      sales_count: 0,
      low_stock_items: 0,
      top_client: {
        name: 'N/A',
        ca: 0
      },
      chart_data: {
        labels: [],
        values: []
      }
    };
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

    // Validation des données (identique à Flask)
    if (!data || typeof data !== 'object') {
      console.error('Données JSON manquantes dans la requête');
      return { erreur: 'Données JSON requises', status: 400 };
    }

    const numero_item = data.numero_item;
    let numero_categorie = data.numer_categorie; // Note: 'numer_categorie' comme dans Flask

    console.log(`Requête reçue: numero_item=${numero_item}, numer_categorie=${numero_categorie}`);

    // Validation numero_item (identique à Flask)
    if (numero_item === undefined || numero_item === null) {
      console.error('numero_item manquant dans la requête');
      return { erreur: 'Numéro d\'article requis', status: 400 };
    }

    // Conversion sécurisée (identique à Flask)
    let itemId;
    try {
      itemId = parseInt(numero_item);
      if (isNaN(itemId)) throw new Error('NaN');
    } catch (e) {
      console.error(`numero_item invalide: ${numero_item}, erreur: ${e}`);
      return { erreur: 'Numéro d\'article doit être un entier', status: 400 };
    }

    // Conversion sécurisée numero_categorie (identique à Flask)
    let catId = null;
    if (numero_categorie !== undefined && numero_categorie !== null) {
      try {
        catId = parseInt(numero_categorie);
        if (isNaN(catId)) throw new Error('NaN');
      } catch (e) {
        console.error(`numero_categorie invalide: ${numero_categorie}, erreur: ${e}`);
        return { erreur: 'Numéro de catégorie doit être un entier', status: 400 };
      }
    }

    db.run("BEGIN TRANSACTION");

    try {
      // Vérifier si l'article existe (identique à Flask)
      const stmtCheckItem = db.prepare('SELECT numero_item, designation FROM item WHERE numero_item = ?');
      stmtCheckItem.bind([itemId]);
      const itemExists = stmtCheckItem.step();
      const item = stmtCheckItem.getAsObject();
      stmtCheckItem.free();

      if (!itemExists) {
        db.run('ROLLBACK');
        console.error(`Article non trouvé: numero_item=${itemId}`);
        return { erreur: `Article ${itemId} non trouvé`, status: 404 };
      }

      // Vérifier si la catégorie existe (si fournie) (identique à Flask)
      if (catId !== null) {
        const stmtCheckCat = db.prepare('SELECT numer_categorie, description_c FROM categorie WHERE numer_categorie = ?');
        stmtCheckCat.bind([catId]);
        const catExists = stmtCheckCat.step();
        const category = stmtCheckCat.getAsObject();
        stmtCheckCat.free();

        if (!catExists) {
          db.run('ROLLBACK');
          console.error(`Catégorie non trouvée: numer_categorie=${catId}`);
          return { erreur: `Catégorie ${catId} non trouvée`, status: 404 };
        }
      }

      // Mettre à jour la catégorie (identique à Flask)
      const stmtUpdate = db.prepare('UPDATE item SET numero_categorie = ? WHERE numero_item = ?');
      stmtUpdate.run([catId, itemId]);
      const changes = db.getRowsModified();
      stmtUpdate.free();

      if (changes === 0) {
        db.run('ROLLBACK');
        console.error(`Aucun article mis à jour: numero_item=${itemId}`);
        return { erreur: 'Aucun article mis à jour, vérifiez les données', status: 404 };
      }

      // Récupérer la valeur mise à jour (similaire au RETURNING de PostgreSQL)
      const stmtGetUpdated = db.prepare('SELECT numero_categorie FROM item WHERE numero_item = ?');
      stmtGetUpdated.bind([itemId]);
      stmtGetUpdated.step();
      const updated = stmtGetUpdated.getAsObject();
      stmtGetUpdated.free();

      db.run('COMMIT');
      await saveDbToLocalStorage(db);

      console.log(`Catégorie assignée: numero_item=${itemId}, numer_categorie=${catId}`);
      
      // Réponse identique à Flask
      return {
        statut: 'Catégorie assignée',
        numero_item: itemId,
        numer_categorie: catId,
        status: 200
      };

    } catch (error) {
      db.run('ROLLBACK');
      console.error('Erreur dans la transaction:', error);
      throw error;
    }

  } catch (error) {
    console.error('Erreur assignerCategorie:', error);
    return { 
      erreur: `Erreur serveur: ${error.message}`,
      status: 500 
    };
  }
}



export async function listeProduitsParCategorie(numero_categorie) {
  try {
    console.log('🔍 Exécution listeProduitsParCategorie avec paramètre:', numero_categorie);
    const db = await getDb();

    // CAS 1: Produits sans catégorie (Flask: numero_categorie is None and 'numero_categorie' in request.args)
    if (numero_categorie === 'SANS_CATEGORIE') {
      console.log('📦 FLASK MODE: Récupération des produits SANS catégorie');
      const stmt = db.prepare('SELECT numero_item, designation FROM item WHERE numero_categorie IS NULL');
      const produits = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        console.log('📦 Produit sans catégorie:', row);
        produits.push({
          numero_item: row.NUMERO_ITEM || row.numero_item || '',
          designation: row.DESIGNATION || row.designation || ''
        });
      }
      stmt.free();
      console.log('✅ Produits sans catégorie trouvés:', produits);
      return { produits };
      
    } 
    // CAS 2: Toutes les catégories (Flask: pas de paramètre du tout)
    else if (numero_categorie === 'TOUTES_CATEGORIES') {
      console.log('📂 FLASK MODE: Récupération de TOUTES les catégories avec leurs produits');
      
      // Reproduire la requête Flask: WHERE c.numer_categorie = %s OR %s IS NULL avec NULL
      const query = `
        SELECT c.numer_categorie, c.description_c, i.numero_item, i.designation
        FROM categorie c
        LEFT JOIN item i ON c.numer_categorie = i.numero_categorie
        ORDER BY c.numer_categorie
      `;
      
      const stmt = db.prepare(query);
      const categories = {};
      let rowCount = 0;
      
      while (stmt.step()) {
        rowCount++;
        const row = stmt.getAsObject();
        console.log('📊 Ligne brute', rowCount, ':', row);
        
        const numer_categorie = row.NUMER_CATEGORIE || row.numer_categorie || '';
        const description_c = row.DESCRIPTION_C || row.description_c || '';
        const numero_item = row.NUMERO_ITEM || row.numero_item || '';
        const designation = row.DESIGNATION || row.designation || '';

        console.log('🔍 Données extraites:', { numer_categorie, description_c, numero_item, designation });

        if (!categories[numer_categorie]) {
          categories[numer_categorie] = {
            numero_categorie: numer_categorie,
            description_c: description_c,
            produits: []
          };
        }

        if (numero_item) {
          categories[numer_categorie].produits.push({
            numero_item: numero_item,
            designation: designation
          });
        }
      }
      stmt.free();
      
      const resultArray = Object.values(categories);
      console.log('✅ Toutes les catégories (Flask mode):', resultArray);
      console.log('📊 Nombre total de lignes traitées:', rowCount);
      return { categories: resultArray };
      
    } 
    // CAS 3: Catégorie spécifique (Flask: numero_categorie a une valeur)
    else {
      const numCat = Number(numero_categorie);
      console.log('🔍 FLASK MODE: Recherche pour catégorie ID:', numCat);
      
      if (isNaN(numCat)) {
        console.error('❌ Paramètre de catégorie invalide:', numero_categorie);
        return { erreur: 'Paramètre de catégorie invalide', status: 400 };
      }
      
      // Reproduire exactement la requête Flask
      const query = `
        SELECT c.numer_categorie, c.description_c, i.numero_item, i.designation
        FROM categorie c
        LEFT JOIN item i ON c.numer_categorie = i.numero_categorie
        WHERE c.numer_categorie = ?
      `;
      console.log('📝 Requête SQL (Flask style):', query);
      
      const stmt = db.prepare(query);
      stmt.bind([numCat]);

      const categories = {};
      let rowCount = 0;
      
      while (stmt.step()) {
        rowCount++;
        const row = stmt.getAsObject();
        console.log('📊 Ligne brute', rowCount, ':', row);
        
        const numer_categorie = row.NUMER_CATEGORIE || row.numer_categorie || '';
        const description_c = row.DESCRIPTION_C || row.description_c || '';
        const numero_item = row.NUMERO_ITEM || row.numero_item || '';
        const designation = row.DESIGNATION || row.designation || '';

        console.log('🔍 Données extraites:', { numer_categorie, description_c, numero_item, designation });

        if (!categories[numer_categorie]) {
          categories[numer_categorie] = {
            numero_categorie: numer_categorie,
            description_c: description_c,
            produits: []
          };
        }

        if (numero_item) {
          categories[numer_categorie].produits.push({
            numero_item: numero_item,
            designation: designation
          });
        }
      }
      stmt.free();

      console.log('📊 Nombre total de lignes traitées:', rowCount);
      const resultArray = Object.values(categories);
      console.log('✅ Résultat final (Flask mode):', resultArray);
      
      return { categories: resultArray };
    }
  } catch (error) {
    console.error('❌ Erreur listeProduitsParCategorie:', error);
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

    // 1. Validation des données (comme dans validerVente)
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

    // 2. Vérification de l'authentification (comme dans validerVente)
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
      // 3. Vérifier l'existence de la commande
      const stmtCommande = db.prepare("SELECT numero_table, nature FROM comande WHERE numero_comande = ?");
      stmtCommande.bind([numero_comande]);
      let commande = null;
      if (stmtCommande.step()) {
        commande = stmtCommande.getAsObject();
      }
      stmtCommande.free();

      if (!commande) {
        return { erreur: "Commande non trouvée", status: 404 };
      }

      const ancien_numero_table = commande.NUMERO_TABLE || 0;
      const ancienne_nature = commande.NATURE || 'TICKET';

      // 4. Récupérer l'ancien encaisse
      const stmtAncienEncaisse = db.prepare("SELECT soldeR FROM encaisse WHERE numero_comande = ?");
      stmtAncienEncaisse.bind([numero_comande]);
      let ancienEncaisse = null;
      if (stmtAncienEncaisse.step()) {
        ancienEncaisse = stmtAncienEncaisse.getAsObject();
      }
      stmtAncienEncaisse.free();
      
      const ancienSoldeRestant = ancienEncaisse ? toDotDecimal(ancienEncaisse.SOLDER || '0,00') : 0;

      // 5. Restaurer le solde client si ancien paiement à terme
      if (ancien_numero_table !== 0 && ancienne_nature !== 'TICKET') {
        const stmtClient = db.prepare("SELECT COALESCE(CAST(solde AS REAL), 0) AS solde FROM client WHERE numero_clt = ?");
        stmtClient.bind([ancien_numero_table]);
        let clientSolde = 0;
        if (stmtClient.step()) {
          const client = stmtClient.getAsObject();
          clientSolde = parseFloat(client.SOLDE) || 0;
        }
        stmtClient.free();

        // Restaurer le solde (soustraire l'ancienne dette)
        const nouveauSolde = clientSolde - ancienSoldeRestant;
        const stmtUpdateClient = db.prepare("UPDATE client SET solde = ? WHERE numero_clt = ?");
        stmtUpdateClient.run([nouveauSolde.toString(), ancien_numero_table]);
        stmtUpdateClient.free();
      }

      // 6. Restaurer le stock des anciens articles
      const stmtLignes = db.prepare("SELECT numero_item, quantite FROM attache WHERE numero_comande = ?");
      stmtLignes.bind([numero_comande]);
      const anciennesLignes = [];
      while (stmtLignes.step()) {
        anciennesLignes.push(stmtLignes.getAsObject());
      }
      stmtLignes.free();

      for (const ligne of anciennesLignes) {
        const quantite = ligne.QUANTITE != null ? toDotDecimal(ligne.QUANTITE.toString()) : 0;
        const numero_item = ligne.NUMERO_ITEM || 0;
        
        if (numero_item && !isNaN(quantite)) {
          const stmtUpdateStock = db.prepare("UPDATE item SET qte = qte + ? WHERE numero_item = ?");
          stmtUpdateStock.run([quantite, numero_item]);
          stmtUpdateStock.free();
        }
      }

      // 7. Supprimer les anciennes données
      const stmtDeleteAttache = db.prepare("DELETE FROM attache WHERE numero_comande = ?");
      stmtDeleteAttache.run([numero_comande]);
      stmtDeleteAttache.free();

      const stmtDeleteEncaisse = db.prepare("DELETE FROM encaisse WHERE numero_comande = ?");
      stmtDeleteEncaisse.run([numero_comande]);
      stmtDeleteEncaisse.free();

      // 8. Mettre à jour la commande
      const stmtUpdateCommande = db.prepare(`
        UPDATE comande 
        SET numero_table = ?, nature = ?, numero_util = ?, date_comande = datetime('now')
        WHERE numero_comande = ?
      `);
      stmtUpdateCommande.run([numero_table, nature, numero_util, numero_comande]);
      stmtUpdateCommande.free();

      // 9. Traiter les nouvelles lignes (comme dans validerVente)
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

      // 10. Calculs des montants (comme dans validerVente)
      const total_vente_str = toCommaDecimal(total_vente);
      const montant_reglement = payment_mode === 'espece' ? total_vente : amount_paid;
      const montant_reglement_str = toCommaDecimal(montant_reglement);

      const solde_restant_vente = total_vente - amount_paid;
      const solde_restant_str = toCommaDecimal(solde_restant_vente);

      // 11. Insertion dans encaisse (comme dans validerVente)
      const stmtEncaisse = db.prepare(`
        INSERT INTO encaisse (apaye, reglement, tva, ht, numero_comande, origine, time_enc, soldeR)
        VALUES (?, ?, '0,00', ?, ?, ?, datetime('now'), ?)
      `);
      stmtEncaisse.run([
        total_vente_str, montant_reglement_str, total_vente_str, 
        numero_comande, nature, solde_restant_str
      ]);
      stmtEncaisse.free();

      // 12. Mise à jour du solde client si vente à terme (comme dans validerVente)
      if (payment_mode === 'a_terme' && numero_table !== 0) {
        const stmtClient = db.prepare("SELECT COALESCE(CAST(solde AS REAL), 0) AS solde FROM client WHERE numero_clt = ?");
        stmtClient.bind([numero_table]);
        let oldSolde = 0.0;
        if (stmtClient.step()) {
          const client = stmtClient.getAsObject();
          oldSolde = parseFloat(client.SOLDE) || 0.0;
        }
        stmtClient.free();

        const nouvelle_dette = -(solde_restant_vente);
        const newSolde = oldSolde + nouvelle_dette;

        const stmtUpdateClient = db.prepare("UPDATE client SET solde = ? WHERE numero_clt = ?");
        stmtUpdateClient.run([newSolde.toString(), numero_table]);
        stmtUpdateClient.free();

        console.log(`✅ Solde client modifié: ${oldSolde} + (${nouvelle_dette}) = ${newSolde}`);
      }

      db.run('COMMIT');
      saveDbToLocalStorage(db);

      return {
        success: true,
        numero_comande: parseInt(numero_comande),
        total_vente: total_vente_str,
        montant_verse: amount_paid_str,
        reglement: montant_reglement_str,
        solde_restant: payment_mode === 'a_terme' ? solde_restant_str : "0,00",
        status: 200
      };

    } catch (error) {
      db.run('ROLLBACK');
      console.error("Erreur dans la transaction:", error);
      return { erreur: error.message, status: 500 };
    }

  } catch (error) {
    console.error("Erreur modifierVente:", error);
    return { erreur: error.message, status: 500 };
  }
}
export async function getVente(numero_comande) {
  console.log(`📥 Exécution de getVente avec numero_comande: ${numero_comande}`);
  const db = await getDb();
  try {
    const stmtCommande = db.prepare(`
      SELECT c.numero_comande, c.numero_table, c.date_comande, c.nature, c.numero_util,
             cl.nom AS client_nom, u.nom AS utilisateur_nom
      FROM comande c
      LEFT JOIN client cl ON c.numero_table = cl.numero_clt
      LEFT JOIN utilisateur u ON c.numero_util = u.numero_util
      WHERE c.numero_comande = ?
    `);
    stmtCommande.bind([numero_comande]);
    const commande = stmtCommande.step() ? stmtCommande.getAsObject() : null;
    stmtCommande.free();

    if (!commande) {
      console.error(`❌ Commande non trouvée pour numero_comande: ${numero_comande}`);
      return { error: "Commande non trouvée", status: 404 };
    }
    console.log("✅ Commande trouvée:", commande);

    const stmtLignes = db.prepare(`
      SELECT a.numero_item, a.quantite, a.prixt, a.remarque, a.prixbh, i.designation
      FROM attache a
      JOIN item i ON a.numero_item = i.numero_item
      WHERE a.numero_comande = ?
    `);
    stmtLignes.bind([numero_comande]);
    const lignes = [];
    while (stmtLignes.step()) {
      const ligne = stmtLignes.getAsObject();
      lignes.push({
        numero_item: ligne.numero_item || ligne.NUMERO_ITEM,
        designation: ligne.designation || ligne.DESIGNATION || "N/A",
        quantite: parseFloat(ligne.quantite || ligne.QUANTITE || 0),
        prixt: parseFloat(ligne.prixt || ligne.PRIXT || 0).toFixed(2), // Chaîne avec point décimal
        remarque: ligne.remarque || ligne.REMARQUE || "",
        prixbh: parseFloat(ligne.prixbh || ligne.PRIXBH || 0).toFixed(2) // Chaîne avec point décimal
      });
    }
    stmtLignes.free();
    console.log("📋 Lignes de commande:", lignes);

    const response = {
      numero_comande: commande.numero_comande || commande.NUMERO_COMANDE,
      numero_table: commande.numero_table || commande.NUMERO_TABLE || 0,
      date_comande: commande.date_comande || commande.DATE_COMANDE || new Date().toISOString(),
      nature: commande.nature || commande.NATURE || "",
      client_nom: commande.client_nom || commande.CLIENT_NOM || "Comptoir",
      utilisateur_nom: commande.utilisateur_nom || commande.UTILISATEUR_NOM || "N/A",
      lignes: lignes
    };

    console.log(`✅ Vente récupérée: numero_comande=${numero_comande}`);
    return response;
  } catch (err) {
    console.error("❌ Erreur récupération vente:", err);
    return { error: err.message || "Erreur inconnue", status: 500 };
  } finally {
    await saveDbToLocalStorage(db);
  }
}
export async function getReception(numero_mouvement) {
  console.log(`📥 Exécution de getReception avec numero_mouvement: ${numero_mouvement}`);
  const db = await getDb();
  
  try {
    // Récupérer les détails du mouvement
    const stmtMouvement = db.prepare(`
      SELECT m.numero_mouvement, m.numero_four, m.date_m, m.nature, m.numero_util,
             f.nom AS fournisseur_nom, u.nom AS utilisateur_nom
      FROM mouvement m
      LEFT JOIN fournisseur f ON m.numero_four = f.numero_fou
      LEFT JOIN utilisateur u ON m.numero_util = u.numero_util
      WHERE m.numero_mouvement = ? AND m.nature = 'Bon de réception'
    `);
    stmtMouvement.bind([numero_mouvement]);
    
    const mouvement = stmtMouvement.step() ? stmtMouvement.getAsObject() : null;
    stmtMouvement.free();

    if (!mouvement) {
      console.error(`❌ Mouvement ${numero_mouvement} non trouvé`);
      return { error: "Mouvement non trouvé", status: 404 };
    }
    console.log("✅ Mouvement trouvé:", mouvement);

    // Récupérer les lignes du mouvement
    const stmtLignes = db.prepare(`
      SELECT a2.numero_item, a2.qtea, a2.nprix, a2.nqte, a2.pump, i.designation
      FROM attache2 a2
      JOIN item i ON a2.numero_item = i.numero_item
      WHERE a2.numero_mouvement = ?
    `);
    stmtLignes.bind([numero_mouvement]);
    
    const lignes = [];
    while (stmtLignes.step()) {
      const ligne = stmtLignes.getAsObject();
      lignes.push({
        numero_item: ligne.numero_item || ligne.NUMERO_ITEM,
        designation: ligne.designation || ligne.DESIGNATION || "N/A",
        qtea: parseFloat(ligne.qtea || ligne.QTEA || 0),
        nprix: parseFloat(ligne.nprix || ligne.NPRIX || 0).toFixed(2),
        nqte: parseFloat(ligne.nqte || ligne.NQTE || 0),
        pump: parseFloat(ligne.pump || ligne.PUMP || 0).toFixed(2)
      });
    }
    stmtLignes.free();
    console.log("📋 Lignes de réception:", lignes);

    // CORRECTION: Convertir la date en objet Date avant d'appeler toISOString()
    const dateValue = mouvement.date_m || mouvement.DATE_M;
    const dateObject = dateValue ? new Date(dateValue) : new Date();
    
    // Formater la réponse comme l'endpoint Flask
    const response = {
      numero_mouvement: mouvement.numero_mouvement || mouvement.NUMERO_MOUVEMENT,
      numero_four: mouvement.numero_four || mouvement.NUMERO_FOUR || 0,
      date_m: dateObject.toISOString(), // ← CORRIGÉ ICI
      nature: mouvement.nature || mouvement.NATURE || "",
      fournisseur_nom: mouvement.fournisseur_nom || mouvement.FOURNISSEUR_NOM || "N/A",
      utilisateur_nom: mouvement.utilisateur_nom || mouvement.UTILISATEUR_NOM || "N/A",
      lignes: lignes
    };

    console.log(`✅ Réception récupérée: numero_mouvement=${numero_mouvement}`);
    return response;

  } catch (err) {
    console.error("❌ Erreur récupération réception:", err);
    return { error: err.message || "Erreur inconnue", status: 500 };
  } finally {
    await saveDbToLocalStorage(db);
  }
}
export async function ventesJour(params = {}) {
  try {
    console.log("Exécution de ventesJour avec params:", params);
    const db = await getDb();

    const { date, numero_clt, numero_util } = params;
    let date_start, date_end;

    // Gestion des dates
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return {
          tickets: [],
          bons: [],
          total: "0,00",
          status: 400,
          erreur: "Format de date invalide. Utilisez YYYY-MM-DD"
        };
      }
      date_start = `${date} 00:00:00`;
      date_end = `${date} 23:59:59`;
    } else {
      const today = new Date().toISOString().split("T")[0];
      date_start = `${today} 00:00:00`;
      date_end = `${today} 23:59:59`;
    }

    console.log("Plage de dates recherchée:", date_start, "à", date_end);

    // Requête SQL
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

    if (numero_clt && numero_clt !== "0") {
      query += " AND c.numero_table = ?";
      queryParams.push(parseInt(numero_clt));
    }

    if (numero_util && numero_util !== "0") {
      query += " AND c.numero_util = ?";
      queryParams.push(parseInt(numero_util));
    }

    query += " ORDER BY c.numero_comande DESC";

    console.log("Requête SQL:", query);
    console.log("Paramètres:", queryParams);

    const stmt = db.prepare(query);
    stmt.bind(queryParams);

    const ventesMap = {};
    let total = 0;
    let rowCount = 0;

    while (stmt.step()) {
      rowCount++;
      const row = stmt.getAsObject();
      console.log(`Ligne ${rowCount} brute:`, row);

      // Sécurisation colonnes (MAJUSCULES / minuscules)
      const numero_comande = row.NUMERO_COMANDE || row.numero_comande;
      if (!numero_comande) {
        console.warn("Ligne ignorée, pas de numero_comande:", row);
        continue;
      }

      const date_comande    = row.DATE_COMANDE || row.date_comande;
      const nature          = row.NATURE || row.nature;
      const numero_table    = row.NUMERO_TABLE || row.numero_table || 0;
      const client_nom      = row.CLIENT_NOM || row.client_nom || "N/A";
      const utilisateur_nom = row.UTILISATEUR_NOM || row.utilisateur_nom || "N/A";

      if (!ventesMap[numero_comande]) {
        ventesMap[numero_comande] = {
          numero_comande,
          date_comande,
          nature,
          client_nom: numero_table == 0 ? "Comptoir" : client_nom,
          utilisateur_nom,
          lignes: []
        };
      }

      // Ligne attachée
      ventesMap[numero_comande].lignes.push({
        numero_item: row.NUMERO_ITEM || row.numero_item,
        designation: row.DESIGNATION || row.designation || "N/A",
        quantite: row.QUANTITE || row.quantite || 0,
        prixt: row.PRIXT || row.prixt || "0,00",
        remarque: row.REMARQUE || row.remarque || ""
      });

      // Total (avec conversion sécurisée)
      total += toDotDecimal(row.PRIXT || row.prixt || "0");
    }
    stmt.free();

    console.log(`Total lignes traitées: ${rowCount}`);
    console.log(`Commandes groupées: ${Object.keys(ventesMap).length}`);

    const tickets = [];
    const bons = [];

    Object.values(ventesMap).forEach(vente => {
      if (vente.nature === "TICKET") {
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
    return {
      tickets: [],
      bons: [],
      total: "0,00",
      erreur: error.message,
      status: 500
    };
  }
}

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
          SELECT 
            COALESCE(qte, 0) AS qte,
            CAST(COALESCE(NULLIF(REPLACE(prixba, ',', '.'), ''), '0') AS FLOAT) AS prixba
          FROM item WHERE numero_item = ?
        `);
        stmtItem.bind([numero_item]);
        if (!stmtItem.step()) {
          stmtItem.free();
          throw new Error(`Article ${numero_item} non trouvé`);
        }
        const item = stmtItem.getAsObject();
        stmtItem.free();

        // Conversion explicite de la quantité actuelle
        const current_qte = parseFloat(item.qte) || 0;
        const prixba = parseFloat(item.prixba || 0);
        const nqte = current_qte + qtea;

        console.log(`Article ${numero_item}: qte actuelle=${current_qte}, qtea=${qtea}, nouvelle qte=${nqte}`);

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

        // CORRECTION : Mise à jour avec la valeur numérique directe
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

export async function modifierReception(numero_mouvement, data) {
  try {
    console.log("Exécution de modifierReception avec data:", { numero_mouvement, data });
    const db = await getDb();

    // 1. Validation des données
    if (!data || !data.lignes || !data.numero_four || !data.numero_util || !data.password2) {
      return { erreur: "Données invalides (fournisseur, utilisateur ou mot de passe manquant)", status: 400 };
    }

    const numero_four = data.numero_four;
    const numero_util = data.numero_util;
    const password2 = data.password2;
    const lignes = data.lignes;

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
    const stmtFour = db.prepare("SELECT numero_fou, solde FROM fournisseur WHERE numero_fou = ?");
    stmtFour.bind([numero_four]);
    let fournisseur = null;
    if (stmtFour.step()) {
      fournisseur = stmtFour.getAsObject();
    }
    stmtFour.free();

    if (!fournisseur) {
      return { erreur: "Fournisseur non trouvé", status: 400 };
    }

    // 4. Vérifier que la réception existe
    const stmtMouv = db.prepare("SELECT numero_mouvement, numero_four FROM mouvement WHERE numero_mouvement = ?");
    stmtMouv.bind([numero_mouvement]);
    let mouvement = null;
    if (stmtMouv.step()) {
      mouvement = stmtMouv.getAsObject();
    }
    stmtMouv.free();

    if (!mouvement) {
      return { erreur: "Réception non trouvée", status: 404 };
    }

    db.run("BEGIN TRANSACTION");

    try {
      // 5. Récupérer les lignes précédentes de la réception
      const stmtOldLines = db.prepare(`
        SELECT numero_item, qtea, nprix 
        FROM attache2 
        WHERE numero_mouvement = ?
      `);
      stmtOldLines.bind([numero_mouvement]);
      
      const old_lines = [];
      while (stmtOldLines.step()) {
        const line = stmtOldLines.getAsObject();
        old_lines.push({
          numero_item: line.numero_item,
          qtea: parseFloat(line.qtea || 0),
          nprix: parseFloat(toDotDecimal(line.nprix || "0"))
        });
      }
      stmtOldLines.free();

      const old_lines_dict = {};
      let old_total_cost = 0;
      for (const line of old_lines) {
        old_lines_dict[line.numero_item] = line;
        old_total_cost += line.qtea * line.nprix;
      }
      console.log(`Coût total réception précédente: ${old_total_cost}`);

      // 6. Calculer le solde restauré
      const current_solde = parseFloat(toDotDecimal(fournisseur.solde || "0"));
      const restored_solde = current_solde + old_total_cost;
      console.log(`Solde restauré: ${restored_solde}`);

      // 7. RÉCUPÉRATION DES ARTICLES - APPROCHE CORRIGÉE
      const item_ids = [...new Set([
        ...lignes.map(l => parseInt(l.numero_item)), 
        ...Object.keys(old_lines_dict).map(Number)
      ])].filter(id => !isNaN(id) && id > 0);

      console.log("IDs d'articles à traiter:", item_ids);

      const items = {};
      const articles_manquants = [];

      if (item_ids.length > 0) {
        const placeholders = item_ids.map(() => '?').join(',');
        const stmtItems = db.prepare(`
          SELECT numero_item, qte, prixba, designation 
          FROM item 
          WHERE numero_item IN (${placeholders})
        `);
        stmtItems.bind(item_ids);
        
        while (stmtItems.step()) {
          const item = stmtItems.getAsObject();
          items[item.numero_item] = {
            qte: parseFloat(item.qte || 0),
            prixba: parseFloat(toDotDecimal(item.prixba || "0")),
            designation: item.designation || 'Article inconnu'
          };
        }
        stmtItems.free();

        // Gestion souple des articles manquants
        for (const id of item_ids) {
          if (!items[id]) {
            articles_manquants.push(id);
            console.warn(`Article ${id} non trouvé dans la base, création d'entrée temporaire`);
            
            // Créer une entrée temporaire pour éviter l'erreur
            items[id] = {
              qte: 0,
              prixba: 0,
              designation: `Article ${id} (supprimé)`
            };
          }
        }
      }

      if (articles_manquants.length > 0) {
        console.warn(`Articles non trouvés mais traités: ${articles_manquants.join(', ')}`);
      }

      // 8. Calculer le nouveau coût total et préparer les mises à jour
      let new_total_cost = 0;
      const stock_updates = {};

      for (const ligne of lignes) {
        const numero_item = parseInt(ligne.numero_item);
        if (isNaN(numero_item)) {
          throw new Error(`Numéro d'article invalide: ${ligne.numero_item}`);
        }

        const new_qtea = parseFloat(toDotDecimal(ligne.qtea || "0"));
        const prixbh = parseFloat(toDotDecimal(ligne.prixbh || "0"));

        if (new_qtea < 0) throw new Error("La quantité ajoutée ne peut pas être négative");
        if (prixbh < 0) throw new Error("Le prix d'achat ne peut pas être négatif");

        const item = items[numero_item];
        if (!item) {
          console.warn(`Article ${numero_item} non trouvé, création d'entrée temporaire`);
          items[numero_item] = {
            qte: 0,
            prixba: 0,
            designation: `Article ${numero_item} (supprimé)`
          };
        }

        const current_qte = items[numero_item].qte;
        const old_qtea = old_lines_dict[numero_item] ? old_lines_dict[numero_item].qtea : 0;

        new_total_cost += new_qtea * prixbh;

        stock_updates[numero_item] = {
          old_qtea: old_qtea,
          new_qtea: new_qtea,
          prixbh: prixbh,
          current_qte: current_qte,
          current_prixba: items[numero_item].prixba,
          designation: items[numero_item].designation
        };
      }

      // 9. Traiter les articles supprimés de l'ancienne réception
      for (const numero_item in old_lines_dict) {
        const num_item = parseInt(numero_item);
        if (!stock_updates[num_item]) {
          const item = items[num_item] || {
            qte: 0,
            prixba: 0,
            designation: `Article ${num_item} (supprimé)`
          };
          
          stock_updates[num_item] = {
            old_qtea: old_lines_dict[numero_item].qtea,
            new_qtea: 0,
            prixbh: 0,
            current_qte: item.qte,
            current_prixba: item.prixba,
            designation: item.designation
          };
        }
      }

      // 10. Mettre à jour le solde du fournisseur
      const new_solde = restored_solde - new_total_cost;
      const new_solde_str = toCommaDecimal(new_solde);
      
      const stmtUpdateFour = db.prepare("UPDATE fournisseur SET solde = ? WHERE numero_fou = ?");
      stmtUpdateFour.run([new_solde_str, numero_four]);
      stmtUpdateFour.free();
      console.log(`Solde fournisseur mis à jour: numero_fou=${numero_four}, new_total_cost=${new_total_cost}, new_solde=${new_solde_str}`);

      // 11. Supprimer les anciennes lignes
      const stmtDeleteLines = db.prepare("DELETE FROM attache2 WHERE numero_mouvement = ?");
      stmtDeleteLines.run([numero_mouvement]);
      stmtDeleteLines.free();

      // 12. Insérer les nouvelles lignes et mettre à jour le stock
      for (const numero_item in stock_updates) {
        const update = stock_updates[numero_item];
        const old_qtea = update.old_qtea;
        const new_qtea = update.new_qtea;
        const prixbh = update.prixbh;
        const current_qte = update.current_qte;
        const current_prixba = update.current_prixba;

        // Restaurer le stock initial et appliquer la nouvelle quantité
        const restored_qte = current_qte - old_qtea;
        const new_qte = restored_qte + new_qtea;

        if (new_qte < 0) {
          throw new Error(`Stock négatif pour l'article ${numero_item} (${update.designation}): ${new_qte}`);
        }

        // Insérer dans attache2 si nouvelle quantité > 0
        if (new_qtea > 0) {
          const prixbh_str = toCommaDecimal(prixbh);
          const stmtAtt = db.prepare(`
            INSERT INTO attache2 (numero_item, numero_mouvement, qtea, nqte, nprix, pump, send)
            VALUES (?, ?, ?, ?, ?, ?, 1)
          `);
          stmtAtt.run([numero_item, numero_mouvement, new_qtea, new_qte, prixbh_str, prixbh_str]);
          stmtAtt.free();
        }

        // Mettre à jour le stock et le prix d'achat
        const new_prixba = new_qtea > 0 ? toCommaDecimal(prixbh) : toCommaDecimal(current_prixba);
        const stmtUpdateItem = db.prepare("UPDATE item SET qte = ?, prixba = ? WHERE numero_item = ?");
        stmtUpdateItem.run([new_qte, new_prixba, numero_item]);
        stmtUpdateItem.free();
        
        console.log(`Stock mis à jour: ${update.designation}, old_qtea=${old_qtea}, new_qtea=${new_qtea}, new_qte=${new_qte}`);
      }

      // 13. Mettre à jour le mouvement
      const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const stmtUpdateMouv = db.prepare(`
        UPDATE mouvement 
        SET numero_four = ?, numero_util = ?, date_m = ?
        WHERE numero_mouvement = ?
      `);
      stmtUpdateMouv.run([numero_four, numero_util, currentDate, numero_mouvement]);
      stmtUpdateMouv.free();

      db.run("COMMIT");
      await saveDbToLocalStorage(db);

      return {
        success: true,
        numero_mouvement: numero_mouvement,
        total_cost: toCommaDecimal(new_total_cost),
        new_solde: new_solde_str,
        articles_manquants: articles_manquants,
        status: 200
      };

    } catch (err) {
      db.run("ROLLBACK");
      console.error("Erreur modifierReception transaction:", err);
      throw err;
    }

  } catch (error) {
    console.error("Erreur modifierReception:", error);
    return { erreur: error.message, status: 500 };
  }
}
export async function receptionsJour(params = {}) {
  try {
    console.log("Exécution de receptionsJour avec params:", params);
    const db = await getDb();

    const { date, numero_util, numero_four } = params;
    
    // Validation et formatage des dates
    let date_start, date_end;
    if (date) {
      // Valider le format de la date
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { 
          receptions: [], 
          total: "0,00", 
          status: 400,
          erreur: "Format de date invalide. Utilisez YYYY-MM-DD" 
        };
      }
      date_start = `${date} 00:00:00`;
      date_end = `${date} 23:59:59`;
    } else {
      const today = new Date().toISOString().split('T')[0];
      date_start = `${today} 00:00:00`;
      date_end = `${today} 23:59:59`;
    }

    console.log("Plage de dates recherchée:", date_start, "à", date_end);

    let query = `
      SELECT m.*, f.nom as fournisseur_nom, u.nom as utilisateur_nom,
             a2.numero_item, a2.qtea, a2.nprix, a2.nqte, i.designation
      FROM mouvement m
      LEFT JOIN fournisseur f ON m.numero_four = f.numero_fou
      LEFT JOIN utilisateur u ON m.numero_util = u.numero_util
      JOIN attache2 a2 ON m.numero_mouvement = a2.numero_mouvement
      JOIN item i ON a2.numero_item = i.numero_item
      WHERE m.date_m BETWEEN ? AND ? AND m.nature = 'Bon de réception'
    `;

    const queryParams = [date_start, date_end];

    if (numero_util && numero_util !== '0') {
      query += ' AND m.numero_util = ?';
      queryParams.push(parseInt(numero_util));
    }

    if (numero_four && numero_four !== '') {
      query += ' AND m.numero_four = ?';
      queryParams.push(numero_four);
    }

    query += ' ORDER BY m.numero_mouvement DESC';

    console.log("Requête SQL:", query);
    console.log("Paramètres:", queryParams);

    const stmt = db.prepare(query);
    stmt.bind(queryParams);

    const receptionsMap = {};
    let total = 0;
    let rowCount = 0;

    while (stmt.step()) {
      rowCount++;
      const row = stmt.getAsObject();
      console.log(`Ligne ${rowCount} brute:`, row);

      // CORRECTION : SQL.js retourne les colonnes en MAJUSCULES
      const numero_mouvement = row.NUMERO_MOUVEMENT || row.numero_mouvement;
      
      if (!numero_mouvement) {
        console.warn("Ligne sans numero_mouvement, ignorée:", row);
        continue;
      }

      if (!receptionsMap[numero_mouvement]) {
        receptionsMap[numero_mouvement] = {
          numero_mouvement: numero_mouvement,
          date_m: row.DATE_M || row.date_m,
          nature: row.NATURE || row.nature,
          fournisseur_nom: row.FOURNISSEUR_NOM || row.fournisseur_nom || 'N/A',
          utilisateur_nom: row.UTILISATEUR_NOM || row.utilisateur_nom || 'N/A',
          lignes: []
        };
      }

      // Calcul du total ligne avec gestion des erreurs
      let total_ligne = 0;
      try {
        const nprix = toDotDecimal(row.NPRIX || row.nprix || "0");
        const qtea = parseFloat(row.QTEA || row.qtea || 0);
        total_ligne = nprix * qtea;
      } catch (error) {
        console.error("Erreur calcul total_ligne:", error, "pour la ligne:", row);
        total_ligne = 0;
      }

      receptionsMap[numero_mouvement].lignes.push({
        numero_item: row.NUMERO_ITEM || row.numero_item,
        designation: row.DESIGNATION || row.designation || 'N/A',
        qtea: row.QTEA || row.qtea || 0,
        nprix: row.NPRIX || row.nprix || "0,00",
        total_ligne: toCommaDecimal(total_ligne)
      });

      total += total_ligne;
    }
    stmt.free();

    console.log(`Total lignes traitées: ${rowCount}`);
    console.log(`Réceptions groupées: ${Object.keys(receptionsMap).length}`);

    const receptions = Object.values(receptionsMap);

    // Debug: Vérifier le contenu des réceptions
    receptions.forEach((rec, index) => {
      console.log(`Réception ${index + 1}:`, rec);
    });

    return {
      receptions,
      total: toCommaDecimal(total),
      status: 200
    };

  } catch (error) {
    console.error("Erreur receptionsJour:", error);
    return { 
      receptions: [], 
      total: "0,00", 
      erreur: error.message, 
      status: 500 
    };
  }
}
export async function articlesPlusVendus(params = {}) {
  try {
    console.log("Exécution de articlesPlusVendus avec params:", params);
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

    console.log("Plage de dates:", date_start, "à", date_end);

    let query = `
      SELECT 
        i.numero_item,
        i.designation,
        SUM(a.quantite) AS quantite,
        SUM(CAST(COALESCE(NULLIF(REPLACE(a.prixt, ',', '.'), ''), '0') AS REAL)) AS total_vente
      FROM comande c
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

    query += `
      GROUP BY i.numero_item, i.designation
      ORDER BY quantite DESC
      LIMIT 10
    `;

    console.log("Query articles plus vendus:", query);
    console.log("Query params:", queryParams);

    const stmt = db.prepare(query);
    stmt.bind(queryParams);

    const articles = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      console.log("Ligne brute récupérée:", row);
      
      // CORRECTION : SQL.js retourne les noms de colonnes exacts, pas les alias
      // Utilisez get() pour obtenir les valeurs par index ou analysez la structure
      const rowData = stmt.get();
      console.log("Données brutes par index:", rowData);
      
      // Méthode 1: Par index (plus fiable)
      const numero_item = rowData[0] !== null ? rowData[0] : '';
      const designation = rowData[1] !== null ? rowData[1] : 'N/A';
      const quantite = rowData[2] !== null ? parseInt(rowData[2]) : 0;
      const total_vente = rowData[3] !== null ? parseFloat(rowData[3]) : 0;

      // Méthode alternative: Par nom de colonne (si SQL.js supporte les alias)
      // const numero_item = row.numero_item || row.NUMERO_ITEM || '';
      // const designation = row.designation || row.DESIGNATION || 'N/A';
      // const quantite = parseInt(row.quantite || row.QUANTITE || 0);
      // const total_vente = parseFloat(row.total_vente || row.TOTAL_VENTE || 0);

      articles.push({
        numero_item: numero_item,
        designation: designation,
        quantite: quantite,
        total_vente: toCommaDecimal(total_vente)
      });
    }
    stmt.free();

    console.log("Articles formatés:", articles);
    return articles;

  } catch (error) {
    console.error("Erreur articlesPlusVendus:", error);
    return { erreur: error.message, status: 500 };
  }
}
export async function profitByDate(params = {}) {
  try {
    console.log("Exécution de profitByDate avec params:", params);
    const db = await getDb();

    const { date, numero_clt, numero_util } = params;
    let date_start, date_end;

    if (date) {
      // Si une date est fournie, utiliser cette date
      date_start = new Date(`${date}T00:00:00`);
      date_end = new Date(`${date}T23:59:59.999`);
    } else {
      // Par défaut, 30 derniers jours
      date_end = new Date();
      date_end.setHours(23, 59, 59, 999);
      date_start = new Date(date_end);
      date_start.setDate(date_start.getDate() - 30);
      date_start.setHours(0, 0, 0, 0);
    }

    // Formater les dates pour SQLite (format YYYY-MM-DD HH:MM:SS)
    const formatDateForSQL = (dateObj) => {
      return dateObj.toISOString().replace('T', ' ').slice(0, 19);
    };

    const date_start_str = formatDateForSQL(date_start);
    const date_end_str = formatDateForSQL(date_end);

    console.log("Plage de dates:", date_start_str, "à", date_end_str);

    let query = `
      SELECT
        DATE(c.date_comande) AS date,
        SUM(CAST(COALESCE(NULLIF(REPLACE(a.prixt, ',', '.'), ''), '0') AS REAL) -
            (a.quantite * CAST(COALESCE(NULLIF(REPLACE(i.prixba, ',', '.'), ''), '0') AS REAL))) AS profit
      FROM comande c
      JOIN attache a ON c.numero_comande = a.numero_comande
      JOIN item i ON a.numero_item = i.numero_item
      WHERE c.date_comande BETWEEN ? AND ?
    `;

    const queryParams = [date_start_str, date_end_str];

    if (numero_clt && numero_clt !== '0') {
      query += ' AND c.numero_table = ?';
      queryParams.push(parseInt(numero_clt));
    }

    if (numero_util && numero_util !== '0') {
      query += ' AND c.numero_util = ?';
      queryParams.push(parseInt(numero_util));
    }

    query += `
      GROUP BY DATE(c.date_comande)
      ORDER BY DATE(c.date_comande) DESC
    `;

    console.log("Query profit:", query);
    console.log("Query params:", queryParams);

    const stmt = db.prepare(query);
    stmt.bind(queryParams);

    const profits = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      profits.push({
        date: row.date,
        profit: toCommaDecimal(parseFloat(row.profit || 0))
      });
    }
    stmt.free();

    console.log("Profits calculés:", profits);
    return profits;

  } catch (error) {
    console.error("Erreur profitByDate:", error);
    return { erreur: error.message, status: 500 };
  }
}
export async function stockValue() {
  try {
    console.log("Exécution de stockValue...");
    const db = await getDb();

    // Calculer la valeur du stock en excluant les articles avec qte négative
    const stmt = db.prepare(`
      SELECT 
        SUM(COALESCE(CAST(NULLIF(REPLACE(prixb, ',', '.'), '') AS FLOAT), 0) * COALESCE(qte, 0)) AS valeur_achat,
        SUM(COALESCE(CAST(NULLIF(REPLACE(prix, ',', '.'), '') AS FLOAT), 0) * COALESCE(qte, 0)) AS valeur_vente
      FROM item
      WHERE qte >= 0 AND GERE = 1
    `);
    
    stmt.step();
    const result = stmt.getAsObject();
    stmt.free();

    // Extraire les valeurs
    const valeur_achat = parseFloat(result.valeur_achat || 0);
    const valeur_vente = parseFloat(result.valeur_vente || 0);

    // Calculer la zakat (2.5% de la valeur de vente)
    const zakat = valeur_vente * 0.025;

    return {
      valeur_achat: toCommaDecimal(valeur_achat),
      valeur_vente: toCommaDecimal(valeur_vente),
      zakat: toCommaDecimal(zakat),
      status: 200
    };

  } catch (error) {
    console.error("Erreur stockValue:", error);
    return { erreur: error.message, status: 500 };
  }
}
export async function annulerVente(data) {
  console.log("📥 Exécution de annulerVente avec data:", data);

  // Vérification des données d'entrée
  if (!data || !data.numero_comande || !data.password2) {
    console.error("❌ Erreur: Numéro de commande ou mot de passe manquant");
    return { erreur: "Numéro de commande ou mot de passe manquant", status: 400 };
  }

  const db = await getDb();
  db.run("BEGIN TRANSACTION");

  try {
    // Étape 1: Vérifier l'existence de la commande
    const stmtComande = db.prepare(`
      SELECT numero_table, nature, numero_util
      FROM comande
      WHERE numero_comande = ?
    `);
    stmtComande.bind([data.numero_comande]);
    const commande = stmtComande.step() ? stmtComande.getAsObject() : null;
    stmtComande.free();

    if (!commande) {
      console.error(`❌ Commande non trouvée pour numero_comande: ${data.numero_comande}`);
      throw new Error("Commande non trouvée");
    }
    console.log("✅ Commande trouvée:", commande);

    const commandeData = {
      numero_table: commande.NUMERO_TABLE || commande.numero_table || 0,
      nature: commande.NATURE || commande.nature,
      numero_util: commande.NUMERO_UTIL || commande.numero_util
    };

    // Étape 2: Vérifier le mot de passe utilisateur
    const stmtUser = db.prepare(`SELECT password2, PASSWORD2 FROM utilisateur WHERE numero_util = ?`);
    stmtUser.bind([commandeData.numero_util]);
    const user = stmtUser.step() ? stmtUser.getAsObject() : null;
    stmtUser.free();

    if (!user) {
      console.error(`❌ Utilisateur non trouvé pour numero_util: ${commandeData.numero_util}`);
      throw new Error("Utilisateur associé non trouvé");
    }

    const password_db = user.PASSWORD2 || user.password2;
    console.log("🔑 Mot de passe DB:", password_db);
    if (password_db !== data.password2) {
      console.error("❌ Mot de passe incorrect");
      throw new Error("Mot de passe incorrect");
    }

    // Étape 3: Récupérer les lignes de la commande
    const stmtLignes = db.prepare(`
      SELECT numero_item, NUMERO_ITEM, quantite, QUANTITE, prixt, PRIXT
      FROM attache
      WHERE numero_comande = ?
    `);
    stmtLignes.bind([data.numero_comande]);
    const lignes = [];
    while (stmtLignes.step()) {
      const ligne = stmtLignes.getAsObject();
      lignes.push({
        numero_item: ligne.NUMERO_ITEM || ligne.numero_item,
        quantite: parseFloat(ligne.QUANTITE || ligne.quantite || 0),
        prixt: ligne.PRIXT || ligne.prixt || "0,00"
      });
    }
    stmtLignes.free();

    if (!lignes.length) {
      console.error("❌ Aucune ligne de vente trouvée pour numero_comande:", data.numero_comande);
      throw new Error("Aucune ligne de vente trouvée");
    }
    console.log("📋 Lignes de vente:", lignes);

    // Étape 4: Restaurer le stock
    for (const ligne of lignes) {
      console.log(`📦 Restauration stock pour item ${ligne.numero_item}, quantité: ${ligne.quantite}`);
      const stmtStock = db.prepare(`UPDATE item SET qte = qte + ? WHERE numero_item = ?`);
      stmtStock.run([ligne.quantite, ligne.numero_item]);
      const changes = db.getRowsModified();
      stmtStock.free();

      if (changes === 0) {
        console.error(`❌ Item non trouvé pour numero_item: ${ligne.numero_item}`);
        throw new Error(`Item ${ligne.numero_item} non trouvé`);
      }
    }

    // Étape 5: Mettre à jour le solde client si vente à terme
    if (commandeData.numero_table !== 0) {
      const total_sale = lignes.reduce((sum, l) => sum + toDotDecimal(l.prixt || "0,00"), 0);
      console.log("💰 Total vente:", total_sale);

      const stmtClient = db.prepare(`SELECT solde, SOLDE FROM client WHERE numero_clt = ?`);
      stmtClient.bind([commandeData.numero_table]);
      const client = stmtClient.step() ? stmtClient.getAsObject() : null;
      stmtClient.free();

      if (!client) {
        console.error(`❌ Client non trouvé pour numero_clt: ${commandeData.numero_table}`);
        throw new Error("Client non trouvé");
      }

      const current_solde = toDotDecimal(client.SOLDE || client.solde || "0,00");
      const new_solde = current_solde - total_sale;
      console.log(`🔄 Mise à jour solde client: ${current_solde} - ${total_sale} = ${new_solde}`);

      const stmtUpdateClient = db.prepare(`UPDATE client SET solde = ? WHERE numero_clt = ?`);
      stmtUpdateClient.run([toCommaDecimal(new_solde), commandeData.numero_table]);
      stmtUpdateClient.free();
    }

    // Étape 6: Supprimer encaisse
    const stmtEncaisse = db.prepare(`DELETE FROM encaisse WHERE numero_comande = ?`);
    stmtEncaisse.run([data.numero_comande]);
    stmtEncaisse.free();
    console.log("🗑️ Encaisse supprimé");

    // Étape 7: Supprimer attache
    const stmtAttache = db.prepare(`DELETE FROM attache WHERE numero_comande = ?`);
    stmtAttache.run([data.numero_comande]);
    stmtAttache.free();
    console.log("🗑️ Attache supprimé");

    // Étape 8: Supprimer commande
    const stmtCommandeDelete = db.prepare(`DELETE FROM comande WHERE numero_comande = ?`);
    stmtCommandeDelete.run([data.numero_comande]);
    const changes = db.getRowsModified();
    stmtCommandeDelete.free();
    console.log("🗑️ Commande supprimée, changements:", changes);

    if (changes === 0) {
      console.error("❌ Aucune commande supprimée");
      throw new Error("Aucune commande supprimée");
    }

    db.run("COMMIT");
    await saveDbToLocalStorage(db);
    console.log("✅ Vente annulée avec succès");
    return { statut: "Vente annulée", status: 200 };

  } catch (err) {
    db.run("ROLLBACK");
    console.error("❌ Erreur annulation vente:", err);
    return { erreur: err.message || "Erreur inconnue", status: 500 };
  }
}

export async function annulerReception(data) {
  console.log("📥 Exécution de annulerReception avec data:", data);

  // Vérification des données d'entrée
  if (!data || !data.numero_mouvement || !data.password2) {
    console.error("❌ Erreur: Numéro de mouvement ou mot de passe manquant");
    return { erreur: "Numéro de mouvement ou mot de passe manquant", status: 400 };
  }

  const db = await getDb();
  db.run("BEGIN TRANSACTION");

  try {
    // Étape 1: Vérifier l'existence du mouvement
    const stmtMouvement = db.prepare(`
      SELECT numero_four, NUMERO_FOUR, numero_util, NUMERO_UTIL
      FROM mouvement
      WHERE numero_mouvement = ? AND (nature = 'Bon de réception' OR NATURE = 'Bon de réception')
    `);
    stmtMouvement.bind([data.numero_mouvement]);
    const mouvement = stmtMouvement.step() ? stmtMouvement.getAsObject() : null;
    stmtMouvement.free();

    if (!mouvement) {
      console.error(`❌ Mouvement non trouvé pour numero_mouvement: ${data.numero_mouvement}`);
      throw new Error("Mouvement non trouvé");
    }
    console.log("✅ Mouvement trouvé:", mouvement);

    const mouvementData = {
      numero_four: mouvement.NUMERO_FOUR || mouvement.numero_four,
      numero_util: mouvement.NUMERO_UTIL || mouvement.numero_util
    };

    // Étape 2: Vérifier le mot de passe utilisateur
    const stmtUser = db.prepare(`SELECT password2, PASSWORD2 FROM utilisateur WHERE numero_util = ?`);
    stmtUser.bind([mouvementData.numero_util]);
    const user = stmtUser.step() ? stmtUser.getAsObject() : null;
    stmtUser.free();

    if (!user) {
      console.error(`❌ Utilisateur non trouvé pour numero_util: ${mouvementData.numero_util}`);
      throw new Error("Utilisateur associé non trouvé");
    }

    const password_db = user.PASSWORD2 || user.password2;
    console.log("🔑 Mot de passe DB:", password_db);
    if (password_db !== data.password2) {
      console.error("❌ Mot de passe incorrect");
      throw new Error("Mot de passe incorrect");
    }

    // Étape 3: Récupérer les lignes de réception
    const stmtLignes = db.prepare(`
      SELECT numero_item, NUMERO_ITEM, qtea, QTEA, nprix, NPRIX
      FROM attache2
      WHERE numero_mouvement = ?
    `);
    stmtLignes.bind([data.numero_mouvement]);
    const lignes = [];
    while (stmtLignes.step()) {
      const ligne = stmtLignes.getAsObject();
      lignes.push({
        numero_item: ligne.NUMERO_ITEM || ligne.numero_item,
        qtea: parseFloat(ligne.QTEA || ligne.qtea || 0),
        nprix: ligne.NPRIX || ligne.nprix || "0,00"
      });
    }
    stmtLignes.free();

    if (!lignes.length) {
      console.error("❌ Aucune ligne de réception trouvée pour numero_mouvement:", data.numero_mouvement);
      throw new Error("Aucune ligne de réception trouvée");
    }
    console.log("📋 Lignes de réception:", lignes);

    // Étape 4: Mettre à jour le stock (sans vérification)
    for (const ligne of lignes) {
      console.log(`📦 Mise à jour stock pour item ${ligne.numero_item}, quantité: ${ligne.qtea}`);
      const stmtUpdateStock = db.prepare(`UPDATE item SET qte = qte - ? WHERE numero_item = ?`);
      stmtUpdateStock.run([ligne.qtea, ligne.numero_item]);
      const changes = db.getRowsModified();
      stmtUpdateStock.free();

      if (changes === 0) {
        console.error(`❌ Item non mis à jour pour numero_item: ${ligne.numero_item}`);
        throw new Error(`Item ${ligne.numero_item} non mis à jour`);
      }
    }

    // Étape 5: Mettre à jour le solde fournisseur
    const total_cost = lignes.reduce(
      (sum, l) => sum + toDotDecimal(l.qtea) * toDotDecimal(l.nprix),
      0
    );
    console.log("💰 Coût total:", total_cost);

    const stmtFournisseur = db.prepare(`SELECT solde, SOLDE FROM fournisseur WHERE numero_fou = ?`);
    stmtFournisseur.bind([mouvementData.numero_four]);
    const fournisseur = stmtFournisseur.step() ? stmtFournisseur.getAsObject() : null;
    stmtFournisseur.free();

    if (!fournisseur) {
      console.error(`❌ Fournisseur non trouvé pour numero_fou: ${mouvementData.numero_four}`);
      throw new Error("Fournisseur non trouvé");
    }

    const current_solde = toDotDecimal(fournisseur.SOLDE || fournisseur.solde || "0,00");
    const new_solde = current_solde + total_cost;
    console.log(`🔄 Mise à jour solde fournisseur: ${current_solde} + ${total_cost} = ${new_solde}`);

    const stmtUpdateFournisseur = db.prepare(`UPDATE fournisseur SET solde = ? WHERE numero_fou = ?`);
    stmtUpdateFournisseur.run([toCommaDecimal(new_solde), mouvementData.numero_four]);
    stmtUpdateFournisseur.free();

    // Étape 6: Supprimer attache2
    const stmtAttache2 = db.prepare(`DELETE FROM attache2 WHERE numero_mouvement = ?`);
    stmtAttache2.run([data.numero_mouvement]);
    stmtAttache2.free();
    console.log("🗑️ Attache2 supprimé");

    // Étape 7: Supprimer mouvement
    const stmtMouvementDelete = db.prepare(`DELETE FROM mouvement WHERE numero_mouvement = ?`);
    stmtMouvementDelete.run([data.numero_mouvement]);
    const changes = db.getRowsModified();
    stmtMouvementDelete.free();
    console.log("🗑️ Mouvement supprimé, changements:", changes);

    if (changes === 0) {
      console.error("❌ Aucun mouvement supprimé");
      throw new Error("Aucun mouvement supprimé");
    }

    db.run("COMMIT");
    await saveDbToLocalStorage(db);
    console.log("✅ Réception annulée avec succès");
    return { statut: "Réception annulée", status: 200 };

  } catch (err) {
    db.run("ROLLBACK");
    console.error("❌ Erreur annulation réception:", err);
    return { erreur: err.message || "Erreur inconnue", status: 500 };
  }
}
