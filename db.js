let db = null;
const DB_NAME = "FirePozDB";
const STORE_NAME = "databases";

// ========== IndexedDB Core Functions ==========
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

async function idbGet(key) {
  try {
    const idb = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("⚠️ IndexedDB erreur lecture:", e);
    return null;
  }
}

async function idbSet(key, value) {
  try {
    const idb = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);

      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("⚠️ IndexedDB erreur écriture:", e);
    return false;
  }
}

async function idbRemove(key) {
  try {
    const idb = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);

      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("⚠️ IndexedDB erreur suppression:", e);
    return false;
  }
}

// ========== Polyfill localStorage (noms compatibles) ==========
const localStorage = {
  async getItem(key) {
    return await idbGet(key);
  },
  
  async setItem(key, value) {
    return await idbSet(key, value);
  },
  
  async removeItem(key) {
    return await idbRemove(key);
  }
};

// ========== SQL.js Initialization ==========
let SQL = null;
async function initSQL() {
  if (SQL) return SQL;
  
  SQL = await initSqlJs({
    locateFile: () =>
      "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm",
  });
  
  return SQL;
}

// ========== Database Management ==========
export async function getDb() {
  if (db) return db;

  const SQL = await initSQL();

  try {
    // Charger depuis IndexedDB
    const savedDb = await localStorage.getItem("gestion_db");
    
    if (savedDb) {
      console.log("📦 Chargement base depuis IndexedDB");
      const bytes = Uint8Array.from(atob(savedDb), c => c.charCodeAt(0));
      db = new SQL.Database(bytes);
      console.log("✅ Base chargée");
    } else {
      // Charger gestion.db par défaut
      console.log("📥 Chargement gestion.db initial");
      const response = await fetch("./gestion.db");
      if (!response.ok) throw new Error("Impossible de charger gestion.db");
      
      const arrayBuffer = await response.arrayBuffer();
      db = new SQL.Database(new Uint8Array(arrayBuffer));

      await saveDbToStorage(db);
      console.log("💾 Base initiale sauvegardée");
    }

    return db;
  } catch (error) {
    console.error("❌ Erreur chargement DB:", error);
    throw error;
  }
}

export async function saveDbToStorage(database) {
  try {
    const dbBinary = database.export();
    const base64 = btoa(String.fromCharCode(...dbBinary));
    
    await localStorage.setItem("gestion_db", base64);
    console.log("💾 Base sauvegardée dans IndexedDB");
  } catch (error) {
    console.error("❌ Erreur sauvegarde:", error);
  }
}

// Alias compatibilité
export { saveDbToStorage as saveDbToLocalStorage };

export async function setActiveDb(base64Data) {
  try {
    const SQL = await initSQL();
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    db = new SQL.Database(bytes);
    await saveDbToStorage(db);
    
    console.log("✅ Base active mise à jour");
    return db;
  } catch (error) {
    console.error("❌ Erreur changement base:", error);
    throw error;
  }
}

export async function createNewDb() {
  try {
    const SQL = await initSQL();
    
    const response = await fetch("./gestion.db");
    if (!response.ok) throw new Error("Impossible de charger gestion.db");
    
    const arrayBuffer = await response.arrayBuffer();
    const newDb = new SQL.Database(new Uint8Array(arrayBuffer));
    
    return newDb;
  } catch (error) {
    console.error("❌ Erreur création base:", error);
    throw error;
  }
}

export async function duplicateCurrentDb() {
  if (!db) await getDb();
  
  try {
    const SQL = await initSQL();
    const dbBinary = db.export();
    return new SQL.Database(dbBinary);
  } catch (error) {
    console.error("❌ Erreur duplication:", error);
    throw error;
  }
}

export async function resetDatabase() {
  try {
    await localStorage.removeItem("gestion_db");
    await localStorage.removeItem("gestion_db_active");
    await localStorage.removeItem("gestion_db_server");

    db = null;
    await getDb();
    
    console.log("🔄 Base réinitialisée");
    return true;
  } catch (error) {
    console.error("❌ Erreur reset:", error);
    return false;
  }
}

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
      console.warn("Impossible d'obtenir le nombre de tables");
    }
    
    return {
      size: size,
      sizeFormatted: formatBytes(size),
      tableCount: tableCount,
      isLoaded: true
    };
  } catch (error) {
    console.error("❌ Erreur info base:", error);
    return {
      size: 0,
      sizeFormatted: "0 B",
      tableCount: 0,
      isLoaded: false
    };
  }
}

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

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export async function exportCurrentDb() {
  if (!db) await getDb();
  
  try {
    const dbBinary = db.export();
    return btoa(String.fromCharCode(...dbBinary));
  } catch (error) {
    console.error("❌ Erreur export:", error);
    throw error;
  }
}

export async function importDb(base64Data) {
  try {
    const SQL = await initSQL();
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    // Valider la base
    const testDb = new SQL.Database(bytes);
    testDb.close();
    
    // Activer la nouvelle base
    db = new SQL.Database(bytes);
    await saveDbToStorage(db);
    
    console.log("✅ Base importée");
    return db;
  } catch (error) {
    console.error("❌ Erreur import:", error);
    throw new Error("Fichier de base invalide");
  }
}

export function isDbLoaded() {
  return db !== null;
}

export function getCurrentDb() {
  return db;
}
