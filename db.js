let db = null;
const DB_NAME = "gestion_db";
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
    request.onerror = (event) => reject(new Error(`Erreur IndexedDB: ${event.target.error.message}`));
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
      req.onerror = () => reject(new Error(`Erreur lecture IndexedDB: ${req.error.message}`));
    });
  } catch (e) {
    console.warn("⚠️ IndexedDB non disponible:", e.message);
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
      req.onerror = () => reject(new Error(`Erreur écriture IndexedDB: ${req.error.message}`));
    });
  } catch (e) {
    console.warn("⚠️ IndexedDB non disponible:", e.message);
    return false;
  }
}

// Initialiser SQL.js
let SQL = null;
async function initSQL() {
  if (SQL) return SQL;
  SQL = await initSqlJs({
    locateFile: () => "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm",
  });
  return SQL;
}

// Configuration
const DEFAULT_DB_PATH = "./gestion.db";

// Vérifier le format de fichier
export function isDbFile(name) {
  return /\.(db|sqlite|sqlite3)$/i.test(name);
}

// Obtenir la base de données
export async function getDb() {
  if (db) return db;

  const SQL = await initSQL();

  try {
    let savedDb = null;

    // Priorité 1: Vérifier localStorage
    const activeDbData = localStorage.getItem("gestion_db");
    if (activeDbData) {
      console.log("📦 Chargement depuis localStorage");
      savedDb = Uint8Array.from(atob(activeDbData), (c) => c.charCodeAt(0));
    }

    // Priorité 2: Essayer IndexedDB
    if (!savedDb) {
      const idbData = await loadFromIndexedDB();
      if (idbData) {
        console.log("📦 Chargement depuis IndexedDB");
        savedDb = idbData;
      }
    }

    // Priorité 3: Fallback LocalStorage (anciennes versions)
    if (!savedDb) {
      const lsData = localStorage.getItem("gestion");
      if (lsData) {
        console.log("📦 Chargement depuis LocalStorage (ancien)");
        savedDb = Uint8Array.from(atob(lsData), (c) => c.charCodeAt(0));
      }
    }

    if (savedDb) {
      db = new SQL.Database(savedDb);
      console.log("✅ Base de données chargée depuis le cache");
    } else {
      console.log("📥 Chargement de la base initiale");
      const response = await fetch(DEFAULT_DB_PATH);
      if (!response.ok) throw new Error(`Impossible de charger ${DEFAULT_DB_PATH}`);
      const arrayBuffer = await response.arrayBuffer();
      db = new SQL.Database(new Uint8Array(arrayBuffer));
      await saveDbToStorage(db, false);
      console.log("💾 Base initiale sauvegardée");
    }

    return db;
  } catch (error) {
    console.error("❌ Erreur chargement base:", error.message);
    throw error;
  }
}

// Sauvegarder dans IndexedDB et localStorage
let isSaving = false;
export async function saveDbToStorage(database, updateList = true) {
  if (isSaving) {
    console.warn("⚠️ Sauvegarde en cours, opération ignorée");
    return false;
  }

  isSaving = true;
  try {
    const dbBinary = database.export();
    await saveToIndexedDB(dbBinary);

    // Vérifier la taille avant de sauvegarder dans localStorage
    const binaryString = String.fromCharCode(...dbBinary);
    const base64String = btoa(binaryString);
    try {
      localStorage.setItem("gestion_db", base64String);
      console.log("💾 Base sauvegardée (IndexedDB + LocalStorage)");
    } catch (e) {
      console.warn("⚠️ localStorage plein ou indisponible:", e.message);
      console.log("💾 Sauvegarde uniquement dans IndexedDB");
    }

    if (updateList) {
      const list = await getDbList();
      const activeIndex = await getActiveIndex();
      if (activeIndex >= 0 && list[activeIndex]) {
        list[activeIndex].data = base64String;
        list[activeIndex].size = base64String.length;
        list[activeIndex].lastModified = new Date().toISOString();
        await saveDbList(list);
      }
    }
    return true;
  } catch (error) {
    console.error("❌ Erreur sauvegarde base:", error.message);
    return false;
  } finally {
    isSaving = false;
  }
}

// Alias pour compatibilité
export { saveDbToStorage as saveDbToLocalStorage };

// Gestion multi-base
export async function getDbList() {
  try {
    const list = localStorage.getItem("gestion_db_list");
    const parsed = list ? JSON.parse(list) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("⚠️ Erreur lecture liste bases:", e.message);
    return [];
  }
}

export async function saveDbList(list) {
  try {
    if (!Array.isArray(list)) {
      console.warn("⚠️ Liste de bases invalide, sauvegarde ignorée");
      return;
    }
    localStorage.setItem("gestion_db_list", JSON.stringify(list));
  } catch (e) {
    console.warn("⚠️ Erreur sauvegarde liste bases:", e.message);
  }
}

export async function getActiveIndex() {
  try {
    const index = localStorage.getItem("gestion_db_active");
    return parseInt(index) || -1;
  } catch (e) {
    console.warn("⚠️ Erreur lecture index actif:", e.message);
    return -1;
  }
}

export async function setActiveIndex(idx) {
  try {
    localStorage.setItem("gestion_db_active", idx.toString());
  } catch (e) {
    console.warn("⚠️ Erreur sauvegarde index actif:", e.message);
  }
}

// Définir une base comme active
export async function setActiveDb(base64Data) {
  if (isSaving) {
    console.warn("⚠️ Sauvegarde en cours, opération reportée");
    throw new Error("Sauvegarde en cours, réessayez plus tard");
  }

  try {
    const SQL = await initSQL();
    const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    db = new SQL.Database(bytes);
    localStorage.setItem("gestion_db", base64Data);
    await saveToIndexedDB(bytes);
    console.log("✅ Base active mise à jour");
    return db;
  } catch (error) {
    console.error("❌ Erreur changement base active:", error.message);
    throw error;
  }
}

// Créer une nouvelle base vierge
export async function createNewDb() {
  try {
    const SQL = await initSQL();
    const response = await fetch(DEFAULT_DB_PATH);
    if (!response.ok) throw new Error(`Impossible de charger ${DEFAULT_DB_PATH}`);
    const arrayBuffer = await response.arrayBuffer();
    return new SQL.Database(new Uint8Array(arrayBuffer));
  } catch (error) {
    console.error("❌ Erreur création nouvelle base:", error.message);
    throw error;
  }
}

// Dupliquer la base actuelle
export async function duplicateCurrentDb() {
  if (!db) await getDb();
  try {
    const SQL = await initSQL();
    const dbBinary = db.export();
    return new SQL.Database(dbBinary);
  } catch (error) {
    console.error("❌ Erreur duplication base:", error.message);
    throw error;
  }
}

// Réinitialiser la base
export async function resetDatabase() {
  try {
    localStorage.removeItem("gestion_db");
    localStorage.removeItem("gestion");
    localStorage.removeItem("gestion_db_active");

    try {
      const idb = await openIndexedDB();
      const tx = idb.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete("db");
      console.log("🔄 Base supprimée d'IndexedDB");
    } catch (e) {
      console.warn("⚠️ Impossible de réinitialiser IndexedDB:", e.message);
    }

    db = null;
    const response = await fetch(DEFAULT_DB_PATH);
    if (!response.ok) throw new Error(`Impossible de charger ${DEFAULT_DB_PATH}`);
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const SQL = await initSQL();
    db = new SQL.Database(bytes);

    const base64String = btoa(String.fromCharCode(...bytes));
    localStorage.setItem("gestion_db", base64String);
    await saveToIndexedDB(bytes);
    console.log("🔄 Base de données réinitialisée");
    return true;
  } catch (error) {
    console.error("❌ Erreur réinitialisation base:", error.message);
    return false;
  }
}

// Obtenir les informations de la base
export async function getDbInfo() {
  if (!db) await getDb();
  try {
    const dbBinary = db.export();
    const size = dbBinary.length;
    let tableCount = 0;
    try {
      const result = db.exec("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'");
      if (result.length > 0 && result[0].values.length > 0) {
        tableCount = result[0].values[0][0];
      }
    } catch (e) {
      console.warn("⚠️ Impossible d'obtenir le nombre de tables:", e.message);
    }

    return {
      size,
      sizeFormatted: formatBytes(size),
      tableCount,
      isLoaded: true,
    };
  } catch (error) {
    console.error("❌ Erreur obtention info base:", error.message);
    return { size: 0, sizeFormatted: "0 B", tableCount: 0, isLoaded: false };
  }
}

// Calculer la taille de la base
export async function getDbSize() {
  if (!db) {
    const activeDbData = localStorage.getItem("gestion_db");
    return activeDbData ? activeDbData.length : 0;
  }
  try {
    return db.export().length;
  } catch (error) {
    console.error("❌ Erreur calcul taille:", error.message);
    return 0;
  }
}

// Formater les tailles
export function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Exporter la base en base64
export async function exportCurrentDb() {
  if (!db) await getDb();
  try {
    const dbBinary = db.export();
    return btoa(String.fromCharCode(...dbBinary));
  } catch (error) {
    console.error("❌ Erreur export base:", error.message);
    throw error;
  }
}

// Importer une base depuis base64
export async function importDb(base64Data) {
  if (isSaving) {
    console.warn("⚠️ Sauvegarde en cours, import reporté");
    throw new Error("Sauvegarde en cours, réessayez plus tard");
  }

  try {
    const SQL = await initSQL();
    const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const testDb = new SQL.Database(bytes);
    testDb.close();
    db = new SQL.Database(bytes);
    localStorage.setItem("gestion_db", base64Data);
    await saveToIndexedDB(bytes);
    console.log("✅ Base importée avec succès");
    return db;
  } catch (error) {
    console.error("❌ Erreur import base:", error.message);
    throw new Error("Fichier de base de données invalide");
  }
}

// Vérifier si une base est chargée
export function isDbLoaded() {
  return db !== null;
}

// Obtenir la base actuelle
export function getCurrentDb() {
  return db;
}
