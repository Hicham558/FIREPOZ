let db = null;
const DB_NAME = "gestion_db"; // clé standardisée
const STORE_NAME = "sqlite_db";

//
// 🚀 Patch localStorage pour IndexedDB
//
(function () {
  const CACHE = {};

  async function idbSet(key, value) {
    const idb = await openIndexedDB();
    const tx = idb.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    return tx.complete;
  }

  async function idbGet(key) {
    const idb = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbRemove(key) {
    const idb = await openIndexedDB();
    const tx = idb.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    return tx.complete;
  }

  window.localStorage = {
    async setItem(key, value) {
      CACHE[key] = value;
      try {
        await idbSet(key, value);
      } catch (e) {
        console.warn(`⚠️ Erreur IndexedDB setItem(${key}):`, e);
      }
    },
    async getItem(key) {
      if (CACHE[key]) return CACHE[key];
      try {
        const value = await idbGet(key);
        if (value !== null) CACHE[key] = value;
        return value;
      } catch (e) {
        console.warn(`⚠️ Erreur IndexedDB getItem(${key}):`, e);
        return null;
      }
    },
    async removeItem(key) {
      delete CACHE[key];
      try {
        await idbRemove(key);
      } catch (e) {
        console.warn(`⚠️ Erreur IndexedDB removeItem(${key}):`, e);
      }
    },
    clear() {
      for (const k in CACHE) delete CACHE[k];
      openIndexedDB().then((idb) => {
        const tx = idb.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).clear();
      });
    },
  };
})();

//
// Ouvrir IndexedDB
//
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

//
// Lire depuis IndexedDB
//
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

//
// Sauvegarder dans IndexedDB
//
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

//
// Initialiser SQL.js
//
let SQL = null;
async function initSQL() {
  if (SQL) return SQL;

  SQL = await initSqlJs({
    locateFile: () =>
      "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm",
  });

  return SQL;
}

//
// Obtenir la base
//
export async function getDb() {
  if (db) return db;

  const SQL = await initSQL();

  try {
    let savedDb = null;

    // 🔍 Priorité 1: Vérifier base active
    const activeDbData = await localStorage.getItem("gestion_db");
    if (activeDbData) {
      console.log("📦 Chargement de la base active");
      savedDb = Uint8Array.from(atob(activeDbData), (c) => c.charCodeAt(0));
    }

    // 🔍 Priorité 2: Essayer IndexedDB
    if (!savedDb) {
      const idbData = await loadFromIndexedDB();
      if (idbData) {
        console.log("📦 Chargement de la base depuis IndexedDB");
        savedDb = idbData;
      }
    }

    if (savedDb) {
      db = new SQL.Database(savedDb);
      console.log("✅ Base de données chargée depuis le cache");
    } else {
      // 📥 Charger la base initiale gestion.db
      console.log("📥 Chargement de la base initiale depuis gestion.db");
      const response = await fetch("./gestion.db");
      if (!response.ok) throw new Error("Impossible de charger gestion.db");
      const arrayBuffer = await response.arrayBuffer();
      db = new SQL.Database(new Uint8Array(arrayBuffer));

      // Sauvegarde immédiate
      await saveDbToStorage(db);
      console.log("💾 Base initiale sauvegardée");
    }

    return db;
  } catch (error) {
    console.error("❌ Erreur chargement DB:", error);
    throw error;
  }
}

//
// Sauvegarder DB
//
export async function saveDbToStorage(database) {
  try {
    const dbBinary = database.export();

    // IndexedDB
    await saveToIndexedDB(dbBinary);

    // Stockage en base64 dans localStorage (qui pointe sur IndexedDB)
    const binaryString = String.fromCharCode(...dbBinary);
    const base64String = btoa(binaryString);
    await localStorage.setItem("gestion_db", base64String);

    console.log("💾 Base sauvegardée (IndexedDB)");
  } catch (error) {
    console.error("❌ Erreur sauvegarde DB:", error);
  }
}

export { saveDbToStorage as saveDbToLocalStorage };

//
// Fonctions utilitaires multi-base
//
function getDbList() {
  return localStorage.getItem("gestion_db_list") || [];
}

function saveDbList(list) {
  localStorage.setItem("gestion_db_list", JSON.stringify(list));
}

function getActiveIndex() {
  return parseInt(localStorage.getItem("gestion_db_active") || "-1");
}

//
// Définir base active
//
export async function setActiveDb(base64Data) {
  try {
    const SQL = await initSQL();
    const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    db = new SQL.Database(bytes);

    await saveDbToStorage(db);
    await localStorage.setItem("gestion_db", base64Data);

    console.log("✅ Base active mise à jour");
    return db;
  } catch (error) {
    console.error("❌ Erreur changement base active:", error);
    throw error;
  }
}

//
// Créer nouvelle base
//
export async function createNewDb() {
  try {
    const SQL = await initSQL();
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

//
// Dupliquer DB
//
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

//
// Reset complet
//
export async function resetDatabase() {
  try {
    await localStorage.removeItem("gestion_db");
    await localStorage.removeItem("gestion");
    await localStorage.removeItem("gestion_db_active");

    try {
      const idb = await openIndexedDB();
      const tx = idb.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete("db");
      console.log("🔄 Base supprimée d'IndexedDB");
    } catch (e) {
      console.warn("⚠️ Impossible de reset IndexedDB:", e);
    }

    db = null;
    await getDb();

    console.log("🔄 Base de données réinitialisée");
    return true;
  } catch (error) {
    console.error("❌ Erreur reset base:", error);
    return false;
  }
}

//
// Infos DB
//
export async function getDbInfo() {
  if (!db) {
    await getDb();
  }

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
      console.warn("Impossible d'obtenir le nombre de tables:", e);
    }

    return {
      size,
      sizeFormatted: formatBytes(size),
      tableCount,
      isLoaded: true,
    };
  } catch (error) {
    console.error("❌ Erreur obtention info base:", error);
    return {
      size: 0,
      sizeFormatted: "0 B",
      tableCount: 0,
      isLoaded: false,
    };
  }
}

//
// Taille DB
//
export async function getDbSize() {
  if (!db) {
    const activeDbData = await localStorage.getItem("gestion_db");
    return activeDbData ? activeDbData.length : 0;
  }

  try {
    const dbBinary = db.export();
    return dbBinary.length;
  } catch (error) {
    console.error("❌ Erreur calcul taille:", error);
    return 0;
  }
}

//
// Formater tailles
//
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

//
// Export DB
//
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

//
// Import DB
//
export async function importDb(base64Data) {
  try {
    const SQL = await initSQL();
    const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    const testDb = new SQL.Database(bytes);
    testDb.close();

    db = new SQL.Database(bytes);
    await saveDbToStorage(db);

    console.log("✅ Base importée avec succès");
    return db;
  } catch (error) {
    console.error("❌ Erreur import base:", error);
    throw new Error("Fichier de base de données invalide");
  }
}

//
// Vérifier si DB chargée
//
export function isDbLoaded() {
  return db !== null;
}

//
// Obtenir DB courante
//
export function getCurrentDb() {
  return db;
}