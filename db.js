let db = null;
const DB_NAME = "gestion_db";
const STORE_NAME = "sqlite_db";

// Ouvrir IndexedDB
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const idb = event.target.result;
      if (!idb.objectStoreNames.contains(STORE_NAME)) {
        idb.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Lire une base depuis IndexedDB
async function loadFromIndexedDB(key = "db") {
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
    console.warn("⚠️ IndexedDB non dispo:", e);
    return null;
  }
}

// Sauvegarder une base dans IndexedDB
async function saveToIndexedDB(data, key = "db") {
  try {
    const idb = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(data, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("⚠️ IndexedDB non dispo:", e);
    return false;
  }
}

// Charger la DB active
export async function getDb(activeKey = "db") {
  if (db) return db;

  const SQL = await initSqlJs({
    locateFile: () => "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm",
  });

  try {
    let savedDb = await loadFromIndexedDB(activeKey);

    // fallback LocalStorage
    if (!savedDb) {
      const lsData = localStorage.getItem(activeKey);
      if (lsData) savedDb = Uint8Array.from(atob(lsData), c => c.charCodeAt(0));
    }

    if (savedDb) {
      db = new SQL.Database(savedDb);
    } else {
      // Charger base initiale
      const response = await fetch("./gestion.db");
      if (!response.ok) throw new Error("Impossible de charger gestion.db");
      const buffer = await response.arrayBuffer();
      db = new SQL.Database(new Uint8Array(buffer));
      await saveDbToStorage(db, activeKey);
    }

    return db;
  } catch (error) {
    console.error("❌ Erreur chargement DB:", error);
    throw error;
  }
}

// Sauvegarde
export async function saveDbToStorage(database, key = "db") {
  try {
    const dbBinary = database.export();
    await saveToIndexedDB(dbBinary, key);

    const binaryString = String.fromCharCode(...dbBinary);
    localStorage.setItem(key, btoa(binaryString));
    console.log(`💾 Base sauvegardée sous "${key}"`);
  } catch (error) {
    console.error("❌ Erreur sauvegarde DB:", error);
  }
}

// Alias ancien code
export { saveDbToStorage as saveDbToLocalStorage };

// Reset complet
export async function resetDatabase(activeKey = "db") {
  localStorage.removeItem(activeKey);
  try {
    const idb = await openIndexedDB();
    const tx = idb.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(activeKey);
  } catch (e) {
    console.warn("⚠️ Impossible de reset IndexedDB:", e);
  }
  db = null;
  alert("Base de données réinitialisée !");
}

// Taille approximative
export async function getDbSize(activeKey = "db") {
  let idbData = await loadFromIndexedDB(activeKey);
  if (idbData) return idbData.length;
  const savedDb = localStorage.getItem(activeKey);
  return savedDb ? savedDb.length : 0;
}
