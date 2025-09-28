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

export async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs({
    locateFile: () =>
      "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm",
  });

  try {
    let savedDb = null;

    // 🔍 Essayer IndexedDB
    const idbData = await loadFromIndexedDB();
    if (idbData) {
      console.log("📦 Chargement de la base depuis IndexedDB");
      savedDb = idbData;
    }

    // 🔍 Sinon, fallback LocalStorage
    if (!savedDb) {
      const lsData =
        localStorage.getItem("gestion_db") || localStorage.getItem("gestion");
      if (lsData) {
        console.log("📦 Chargement de la base depuis LocalStorage");
        savedDb = Uint8Array.from(atob(lsData), (c) => c.charCodeAt(0));
      }
    }

    if (savedDb) {
      db = new SQL.Database(savedDb);
    } else {
      // 📥 Charger la base initiale gestion.db
      console.log("📥 Chargement de la base initiale depuis gestion.db");
      const response = await fetch("./gestion.db");
      if (!response.ok) throw new Error("Impossible de charger gestion.db");
      const arrayBuffer = await response.arrayBuffer();
      db = new SQL.Database(new Uint8Array(arrayBuffer));

      // Sauvegarde immédiate
      await saveDbToStorage(db);
    }

    return db;
  } catch (error) {
    console.error("❌ Erreur chargement DB:", error);
    throw error;
  }
}

// Sauvegarder dans IndexedDB (+ LocalStorage en backup)
export async function saveDbToStorage(database) {
  try {
    const dbBinary = database.export();

    // IndexedDB
    await saveToIndexedDB(dbBinary);

    // LocalStorage (fallback compatibilité, mais limité)
    const binaryString = String.fromCharCode(...dbBinary);
    const base64String = btoa(binaryString);
    localStorage.setItem("gestion_db", base64String);

    console.log("💾 Base sauvegardée (IndexedDB + LocalStorage)");
  } catch (error) {
    console.error("❌ Erreur sauvegarde DB:", error);
  }
}

// ✅ Alias pour compatibilité avec l'ancien code
export { saveDbToStorage as saveDbToLocalStorage };

// Reset complet
export async function resetDatabase() {
  localStorage.removeItem("gestion_db");
  localStorage.removeItem("gestion");

  try {
    const idb = await openIndexedDB();
    const tx = idb.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete("db");
    console.log("🔄 Base supprimée d'IndexedDB");
  } catch (e) {
    console.warn("⚠️ Impossible de reset IndexedDB:", e);
  }

  db = null;
  alert("Base de données réinitialisée !");
}

// Taille approx
export async function getDbSize() {
  const idbData = await loadFromIndexedDB();
  if (idbData) return idbData.length;

  const savedDb =
    localStorage.getItem("gestion_db") || localStorage.getItem("gestion");
  return savedDb ? savedDb.length : 0;
}
export async function setActiveDb(base64Data) {
  const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  db = await initSqlJs().then(SQL => new SQL.Database(bytes));
  await saveDbToStorage(db); // sauvegarde dans IndexedDB + LocalStorage
  localStorage.setItem('gestion_db', base64Data);
}
