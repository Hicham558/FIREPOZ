export async function getReception(numero_mouvement) {
  try {
    console.log("Exécution de getReception pour le mouvement:", numero_mouvement);
    const db = await getDb();

    // 1. Vérifier que le mouvement existe et est une réception
    const stmtMouv = db.prepare(`
      SELECT m.numero_mouvement, m.date_m, m.numero_four, m.numero_util, 
             m.nature, m.refdoc, f.nom_fou, u.nom as nom_util
      FROM mouvement m
      LEFT JOIN fournisseur f ON m.numero_four = f.numero_fou
      LEFT JOIN utilisateur u ON m.numero_util = u.numero_util
      WHERE m.numero_mouvement = ? AND m.nature LIKE '%réception%'
    `);
    stmtMouv.bind([numero_mouvement]);
    
    let mouvement = null;
    if (stmtMouv.step()) {
      mouvement = stmtMouv.getAsObject();
    }
    stmtMouv.free();

    if (!mouvement) {
      return { erreur: "Réception non trouvée", status: 404 };
    }

    // 2. Récupérer les lignes de la réception
    const stmtLignes = db.prepare(`
      SELECT a.numero_item, a.qtea, a.nprix, a.nqte, a.pump,
             i.designation, i.code_article, i.unite
      FROM attache2 a
      LEFT JOIN item i ON a.numero_item = i.numero_item
      WHERE a.numero_mouvement = ?
      ORDER BY a.numero_item
    `);
    stmtLignes.bind([numero_mouvement]);
    
    const lignes = [];
    while (stmtLignes.step()) {
      const ligne = stmtLignes.getAsObject();
      lignes.push({
        numero_item: ligne.numero_item,
        designation: ligne.designation || '',
        code_article: ligne.code_article || '',
        unite: ligne.unite || '',
        qtea: parseFloat(ligne.qtea || 0),
        prixbh: parseFloat(toDotDecimal(ligne.nprix || "0")),
        nqte: parseFloat(ligne.nqte || 0),
        pump: parseFloat(toDotDecimal(ligne.pump || "0"))
      });
    }
    stmtLignes.free();

    // 3. Formater les données pour la réponse
    const response = {
      success: true,
      data: {
        mouvement: {
          numero_mouvement: mouvement.numero_mouvement,
          date_m: mouvement.date_m,
          numero_four: mouvement.numero_four,
          numero_util: mouvement.numero_util,
          nature: mouvement.nature,
          refdoc: mouvement.refdoc,
          nom_fournisseur: mouvement.nom_fou || '',
          nom_utilisateur: mouvement.nom_util || ''
        },
        lignes: lignes,
        total: lignes.reduce((sum, ligne) => sum + (ligne.qtea * ligne.prixbh), 0)
      },
      status: 200
    };

    console.log("Réception récupérée:", response);
    return response;

  } catch (error) {
    console.error("Erreur getReception:", error);
    return { 
      erreur: `Erreur lors de la récupération de la réception: ${error.message}`, 
      status: 500 
    };
  }
}

// Fonction pour récupérer toutes les réceptions
export async function getAllReceptions(filters = {}) {
  try {
    console.log("Exécution de getAllReceptions avec filters:", filters);
    const db = await getDb();

    let whereClause = "WHERE m.nature LIKE '%réception%'";
    let params = [];

    // Filtres optionnels
    if (filters.numero_four) {
      whereClause += " AND m.numero_four = ?";
      params.push(filters.numero_four);
    }

    if (filters.date_debut) {
      whereClause += " AND m.date_m >= ?";
      params.push(filters.date_debut);
    }

    if (filters.date_fin) {
      whereClause += " AND m.date_m <= ?";
      params.push(filters.date_fin);
    }

    if (filters.etat_m) {
      whereClause += " AND m.etat_m = ?";
      params.push(filters.etat_m);
    }

    // Récupérer les mouvements de réception
    const stmtMouvements = db.prepare(`
      SELECT m.numero_mouvement, m.date_m, m.numero_four, m.numero_util, 
             m.nature, m.etat_m, m.refdoc, f.nom_fou, u.nom as nom_util,
             COUNT(a.numero_item) as nb_lignes,
             SUM(a.qtea * CAST(COALESCE(NULLIF(REPLACE(a.nprix, ',', '.'), ''), '0') AS FLOAT)) as montant_total
      FROM mouvement m
      LEFT JOIN fournisseur f ON m.numero_four = f.numero_fou
      LEFT JOIN utilisateur u ON m.numero_util = u.numero_util
      LEFT JOIN attache2 a ON m.numero_mouvement = a.numero_mouvement
      ${whereClause}
      GROUP BY m.numero_mouvement
      ORDER BY m.date_m DESC, m.numero_mouvement DESC
    `);
    stmtMouvements.bind(params);
    
    const receptions = [];
    while (stmtMouvements.step()) {
      const mouvement = stmtMouvements.getAsObject();
      receptions.push({
        numero_mouvement: mouvement.numero_mouvement,
        date_m: mouvement.date_m,
        numero_four: mouvement.numero_four,
        numero_util: mouvement.numero_util,
        nature: mouvement.nature,
        etat_m: mouvement.etat_m,
        refdoc: mouvement.refdoc,
        nom_fournisseur: mouvement.nom_fou || '',
        nom_utilisateur: mouvement.nom_util || '',
        nb_lignes: mouvement.nb_lignes || 0,
        montant_total: parseFloat(mouvement.montant_total || 0)
      });
    }
    stmtMouvements.free();

    return {
      success: true,
      data: receptions,
      total: receptions.length,
      status: 200
    };

  } catch (error) {
    console.error("Erreur getAllReceptions:", error);
    return { 
      erreur: `Erreur lors de la récupération des réceptions: ${error.message}`, 
      status: 500 
    };
  }
}

// Fonction pour vérifier si un article existe
export async function checkArticleExists(numero_item) {
  try {
    const db = await getDb();
    
    const stmt = db.prepare("SELECT numero_item, designation FROM item WHERE numero_item = ?");
    stmt.bind([numero_item]);
    
    const exists = stmt.step();
    stmt.free();
    
    return { exists, status: 200 };
    
  } catch (error) {
    console.error("Erreur checkArticleExists:", error);
    return { exists: false, erreur: error.message, status: 500 };
  }
}

// Fonctions utilitaires (déjà présentes dans votre code)
function toDotDecimal(value) {
  if (typeof value === 'string') {
    return value.replace(',', '.');
  }
  return value;
}

function toCommaDecimal(value) {
  if (typeof value === 'string') {
    return value.replace('.', ',');
  }
  return String(value).replace('.', ',');
}
