let db = null;
const DB_NAME = "gestion_db"; // clé standardisée
const STORE_NAME = "sqlite_db";

// Ouvrir IndexedDB
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Lire depuis IndexedDB
async function loadFromIndexedDB() {
  try {
    const idb = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get("db");

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("⚠️ IndexedDB non dispo:", e);
    return null;
  }
}

// Sauvegarder dans IndexedDB
async function saveToIndexedDB(data) {
  try {
    const idb = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(data, "db");

      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("⚠️ IndexedDB non dispo:", e);
    return false;
  }
}

// Initialiser SQL.js
let SQL = null;
async function initSQL() {
  if (SQL) return SQL;
  
  SQL = await initSqlJs({
    locateFile: () =>
      "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm",
  });
  
  return SQL;
}

export async function getDb() {
  if (db) return db;

  const SQL = await initSQL();

  try {
    let savedDb = null;

    // 🔍 Vérifier IndexedDB
    const idbData = await loadFromIndexedDB();
    if (idbData) {
      console.log("📦 Chargement de la base depuis IndexedDB");
      savedDb = idbData;
    }

    if (savedDb) {
      db = new SQL.Database(savedDb);
      console.log("✅ Base de données chargée depuis IndexedDB");
    } else {
      // 📥 Charger la base initiale gestion.db
      console.log("📥 Chargement de la base initiale depuis gestion.db");
      const response = await fetch("./gestion.db");
      if (!response.ok) throw new Error("Impossible de charger gestion.db");
      const arrayBuffer = await response.arrayBuffer();
      db = new SQL.Database(new Uint8Array(arrayBuffer));

      // Sauvegarde immédiate
      await saveDbToStorage(db);
      console.log("💾 Base initiale sauvegardée dans IndexedDB");
    }

    return db;
  } catch (error) {
    console.error("❌ Erreur chargement DB:", error);
    throw error;
  }
}

// Sauvegarder dans IndexedDB uniquement
export async function saveDbToStorage(database) {
  try {
    const dbBinary = database.export();

    // IndexedDB
    await saveToIndexedDB(dbBinary);

    console.log("💾 Base sauvegardée (IndexedDB uniquement)");
  } catch (error) {
    console.error("❌ Erreur sauvegarde DB:", error);
  }
}

// ✅ Alias pour compatibilité avec l'ancien code
export { saveDbToStorage as saveDbToLocalStorage };

// Définir une base comme active
export async function setActiveDb(base64Data) {
  try {
    const SQL = await initSQL();
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    // Créer la nouvelle instance de base
    db = new SQL.Database(bytes);
    
    // Sauvegarder
    await saveDbToStorage(db);
    
    console.log("✅ Base active mise à jour");
    return db;
  } catch (error) {
    console.error("❌ Erreur lors du changement de base active:", error);
    throw error;
  }
}

// Créer une nouvelle base vierge
export async function createNewDb() {
  try {
    const SQL = await initSQL();
    
    // Charger le modèle de base depuis gestion.db
    const response = await fetch("./gestion.db");
    if (!response.ok) throw new Error("Impossible de charger gestion.db");
    
    const arrayBuffer = await response.arrayBuffer();
    const newDb = new SQL.Database(new Uint8Array(arrayBuffer));
    
    return newDb;
  } catch (error) {
    console.error("❌ Erreur création nouvelle base:", error);
    throw error;
  }
}

// Dupliquer la base actuelle
export async function duplicateCurrentDb() {
  if (!db) {
    await getDb();
  }
  
  try {
    const SQL = await initSQL();
    const dbBinary = db.export();
    const duplicatedDb = new SQL.Database(dbBinary);
    
    return duplicatedDb;
  } catch (error) {
    console.error("❌ Erreur duplication base:", error);
    throw error;
  }
}

// Reset complet
export async function resetDatabase() {
  try {
    // Nettoyer IndexedDB
    try {
      const idb = await openIndexedDB();
      const tx = idb.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete("db");
      console.log("🔄 Base supprimée d'IndexedDB");
    } catch (e) {
      console.warn("⚠️ Impossible de reset IndexedDB:", e);
    }

    // Réinitialiser la base
    db = null;
    
    // Recharger depuis gestion.db
    await getDb();
    
    console.log("🔄 Base de données réinitialisée");
    return true;
  } catch (error) {
    console.error("❌ Erreur reset base:", error);
    return false;
  }
}

// Obtenir les informations de la base actuelle
export async function getDbInfo() {
  if (!db) {
    await getDb();
  }
  
  try {
    const dbBinary = db.export();
    const size = dbBinary.length;
    
    // Essayer d'obtenir quelques statistiques
    let tableCount = 0;
    try {
      const result = db.exec("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'");
      if (result.length > 0 && result[0].values.length > 0) {
        tableCount = result[0].values[0][0];
      }
    } catch (e) {
      console.warn("Impossible d'obtenir le nombre de tables:", e);
    }
    
    return {
      size: size,
      sizeFormatted: formatBytes(size),
      tableCount: tableCount,
      isLoaded: true
    };
  } catch (error) {
    console.error("❌ Erreur obtention info base:", error);
    return {
      size: 0,
      sizeFormatted: "0 B",
      tableCount: 0,
      isLoaded: false
    };
  }
}

// Taille approximative de la base
export async function getDbSize() {
  if (!db) {
    return 0;
  }
  
  try {
    const dbBinary = db.export();
    return dbBinary.length;
  } catch (error) {
    console.error("❌ Erreur calcul taille:", error);
    return 0;
  }
}

// Utilitaire pour formater les tailles
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Exporter la base actuelle en base64
export async function exportCurrentDb() {
  if (!db) {
    await getDb();
  }
  
  try {
    const dbBinary = db.export();
    const binaryString = String.fromCharCode(...dbBinary);
    return btoa(binaryString);
  } catch (error) {
    console.error("❌ Erreur export base:", error);
    throw error;
  }
}

// Importer une base depuis base64
export async function importDb(base64Data) {
  try {
    const SQL = await initSQL();
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    // Tester que la base est valide
    const testDb = new SQL.Database(bytes);
    testDb.close();
    
    // Si on arrive ici, la base est valide
    db = new SQL.Database(bytes);
    await saveDbToStorage(db);
    
    console.log("✅ Base importée avec succès");
    return db;
  } catch (error) {
    console.error("❌ Erreur import base:", error);
    throw new Error("Fichier de base de données invalide");
  }
}

// Vérifier si une base est chargée
export function isDbLoaded() {
  return db !== null;
}

// Obtenir une référence à la base actuelle (pour compatibilité)
export function getCurrentDb() {
  return db;
}