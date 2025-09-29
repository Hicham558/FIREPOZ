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
    let loadSource = "";

    // 🔍 PRIORITÉ 1: IndexedDB (pour les grosses bases)
    const idbData = await loadFromIndexedDB();
    if (idbData) {
      console.log("📦 Chargement de la base depuis IndexedDB");
      savedDb = idbData;
      loadSource = "IndexedDB";
    }

    // 🔍 PRIORITÉ 2: localStorage pour la base active (si pas trouvée dans IndexedDB)
    if (!savedDb) {
      const activeDbData = localStorage.getItem("gestion_db");
      if (activeDbData) {
        console.log("📦 Chargement de la base active depuis localStorage");
        try {
          savedDb = Uint8Array.from(atob(activeDbData), (c) => c.charCodeAt(0));
          loadSource = "localStorage";
        } catch (e) {
          console.warn("⚠️ Erreur décodage base localStorage:", e);
          // Nettoyer la donnée corrompue
          localStorage.removeItem("gestion_db");
        }
      }
    }

    // 🔍 PRIORITÉ 3: Fallback LocalStorage (anciennes versions)
    if (!savedDb) {
      const lsData = localStorage.getItem("gestion");
      if (lsData) {
        console.log("📦 Chargement de la base depuis LocalStorage (ancien)");
        try {
          savedDb = Uint8Array.from(atob(lsData), (c) => c.charCodeAt(0));
          loadSource = "localStorage (ancien)";
        } catch (e) {
          console.warn("⚠️ Erreur décodage ancienne base:", e);
          localStorage.removeItem("gestion");
        }
      }
    }

    if (savedDb) {
      db = new SQL.Database(savedDb);
      const size = formatBytes(savedDb.length);
      console.log(`✅ Base de données chargée depuis ${loadSource} (${size})`);
    } else {
      // 📥 Charger la base initiale gestion.db
      console.log("📥 Chargement de la base initiale depuis gestion.db");
      const response = await fetch("./gestion.db");
      if (!response.ok) throw new Error("Impossible de charger gestion.db");
      const arrayBuffer = await response.arrayBuffer();
      db = new SQL.Database(new Uint8Array(arrayBuffer));

      // Sauvegarde initiale sans mise à jour de la liste (éviter récursion)
      await saveDbToStorage(db, false);
      console.log("💾 Base initiale sauvegardée");
    }

    return db;
  } catch (error) {
    console.error("❌ Erreur chargement DB:", error);
    throw error;
  }
}

// Flag pour éviter la récursion
let isSaving = false;

// Sauvegarder dans IndexedDB (+ LocalStorage en backup)
export async function saveDbToStorage(database, updateList = true) {
  // Éviter la récursion
  if (isSaving) {
    console.warn("⚠️ Sauvegarde déjà en cours - ignorée");
    return false;
  }
  
  if (!database) {
    console.warn("⚠️ Tentative de sauvegarde d'une base null");
    return false;
  }

  isSaving = true;

  try {
    const dbBinary = database.export();
    const binaryString = String.fromCharCode(...dbBinary);
    const base64String = btoa(binaryString);

    console.log(`📊 Taille de la base: ${formatBytes(base64String.length)}`);

    // PRIORITÉ 1: IndexedDB (pas de limite de taille)
    const idbSuccess = await saveToIndexedDB(dbBinary);
    if (idbSuccess) {
      console.log("✅ Base sauvegardée dans IndexedDB");
    }

    // PRIORITÉ 2: localStorage seulement si la taille le permet (< 4MB pour sécurité)
    const MAX_LOCALSTORAGE_SIZE = 4 * 1024 * 1024; // 4MB
    if (base64String.length < MAX_LOCALSTORAGE_SIZE) {
      try {
        // Utiliser l'API native localStorage pour éviter les déclencheurs
        if (window.localStorage._cache) {
          window.localStorage._cache["gestion_db"] = base64String;
        }
        Object.getPrototypeOf(window.localStorage).setItem.call(window.localStorage, "gestion_db", base64String);
        console.log("✅ Base sauvegardée dans localStorage (backup)");
      } catch (e) {
        if (e.name === 'QuotaExceededError') {
          console.warn("⚠️ localStorage plein - utilisation IndexedDB uniquement");
          // Nettoyer localStorage si plein
          try {
            if (window.localStorage._cache) {
              delete window.localStorage._cache["gestion_db"];
            }
            Object.getPrototypeOf(window.localStorage).removeItem.call(window.localStorage, "gestion_db");
          } catch (cleanupError) {
            console.warn("Erreur nettoyage localStorage:", cleanupError);
          }
        } else {
          console.warn("Erreur localStorage:", e);
        }
      }
    } else {
      console.log("ℹ️ Base trop volumineuse pour localStorage - utilisation IndexedDB uniquement");
      // Nettoyer localStorage si une ancienne version existe
      try {
        if (window.localStorage._cache) {
          delete window.localStorage._cache["gestion_db"];
        }
        Object.getPrototypeOf(window.localStorage).removeItem.call(window.localStorage, "gestion_db");
      } catch (e) {
        console.warn("Erreur nettoyage localStorage:", e);
      }
    }

    // Mettre à jour dans la liste des bases si demandé (sans sauvegarder)
    if (updateList) {
      const dbList = getDbList();
      const activeIndex = getActiveIndex();
      if (activeIndex >= 0 && dbList[activeIndex]) {
        dbList[activeIndex].data = base64String;
        dbList[activeIndex].size = base64String.length;
        dbList[activeIndex].lastModified = new Date().toISOString();
        
        // Sauvegarder la liste directement sans passer par localStorage patch
        const listJson = JSON.stringify(dbList);
        if (window.localStorage._cache) {
          window.localStorage._cache["gestion_db_list"] = listJson;
        }
        try {
          Object.getPrototypeOf(window.localStorage).setItem.call(window.localStorage, "gestion_db_list", listJson);
        } catch (e) {
          console.warn("Erreur sauvegarde liste:", e);
        }
      }
    }

    if (idbSuccess) {
      console.log("💾 Base sauvegardée avec succès");
      return true;
    } else {
      console.error("❌ Échec sauvegarde IndexedDB");
      return false;
    }
  } catch (error) {
    console.error("❌ Erreur sauvegarde DB:", error);
    return false;
  } finally {
    isSaving = false;
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

// ✅ Alias pour compatibilité avec l'ancien code
export { saveDbToStorage as saveDbToLocalStorage };

// Fonctions utilitaires pour la gestion multi-base (utilisation directe pour éviter récursion)
function getDbList() {
  try {
    // Essayer d'abord le cache
    if (window.localStorage._cache && window.localStorage._cache["gestion_db_list"]) {
      return JSON.parse(window.localStorage._cache["gestion_db_list"]);
    }
    
    // Fallback API native
    const list = Object.getPrototypeOf(window.localStorage).getItem.call(window.localStorage, "gestion_db_list");
    return list ? JSON.parse(list) : [];
  } catch (e) {
    console.warn("Erreur lecture liste bases:", e);
    return [];
  }
}

function saveDbList(list) {
  try {
    const listJson = JSON.stringify(list);
    
    // Sauvegarder dans le cache
    if (window.localStorage._cache) {
      window.localStorage._cache["gestion_db_list"] = listJson;
    }
    
    // Sauvegarder avec l'API native pour éviter les déclencheurs
    Object.getPrototypeOf(window.localStorage).setItem.call(window.localStorage, "gestion_db_list", listJson);
  } catch (e) {
    console.warn("Erreur sauvegarde liste bases:", e);
  }
}

function getActiveIndex() {
  try {
    // Essayer d'abord le cache
    if (window.localStorage._cache && window.localStorage._cache["gestion_db_active"]) {
      return parseInt(window.localStorage._cache["gestion_db_active"]);
    }
    
    // Fallback API native
    const index = Object.getPrototypeOf(window.localStorage).getItem.call(window.localStorage, "gestion_db_active");
    return parseInt(index || "-1");
  } catch (e) {
    console.warn("Erreur lecture index actif:", e);
    return -1;
  }
}

function setActiveIndex(idx) {
  try {
    const indexStr = idx.toString();
    
    // Sauvegarder dans le cache
    if (window.localStorage._cache) {
      window.localStorage._cache["gestion_db_active"] = indexStr;
    }
    
    // Sauvegarder avec l'API native
    Object.getPrototypeOf(window.localStorage).setItem.call(window.localStorage, "gestion_db_active", indexStr);
  } catch (e) {
    console.warn("Erreur sauvegarde index actif:", e);
  }
}

// Définir une base comme active (version sécurisée)
export async function setActiveDb(base64Data) {
  if (isSaving) {
    console.warn("⚠️ Sauvegarde en cours - setActiveDb reporté");
    return db;
  }

  try {
    const SQL = await initSQL();
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    console.log(`📊 Activation base de ${formatBytes(base64Data.length)}`);
    
    // Créer la nouvelle instance de base
    db = new SQL.Database(bytes);
    
    // PRIORITÉ 1: Sauvegarder dans IndexedDB
    await saveToIndexedDB(bytes);
    console.log("✅ Base active sauvegardée dans IndexedDB");
    
    // PRIORITÉ 2: localStorage seulement si taille raisonnable
    const MAX_LOCALSTORAGE_SIZE = 4 * 1024 * 1024; // 4MB
    if (base64Data.length < MAX_LOCALSTORAGE_SIZE) {
      try {
        if (window.localStorage._cache) {
          window.localStorage._cache["gestion_db"] = base64Data;
        }
        Object.getPrototypeOf(window.localStorage).setItem.call(window.localStorage, "gestion_db", base64Data);
        console.log("✅ Base active sauvegardée dans localStorage (backup)");
      } catch (e) {
        if (e.name === 'QuotaExceededError') {
          console.warn("⚠️ localStorage plein pour base active - IndexedDB uniquement");
        }
      }
    } else {
      console.log("ℹ️ Base trop volumineuse pour localStorage - IndexedDB uniquement");
      // Nettoyer localStorage
      try {
        if (window.localStorage._cache) {
          delete window.localStorage._cache["gestion_db"];
        }
        Object.getPrototypeOf(window.localStorage).removeItem.call(window.localStorage, "gestion_db");
      } catch (e) {
        console.warn("Erreur nettoyage localStorage:", e);
      }
    }
    
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
    // Supprimer les anciennes clés
    localStorage.removeItem("gestion_db");
    localStorage.removeItem("gestion");
    localStorage.removeItem("gestion_db_active");

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
    const response = await fetch("./gestion.db");
    if (!response.ok) throw new Error("Impossible de charger gestion.db");
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    const SQL = await initSQL();
    db = new SQL.Database(bytes);
    
    // Sauvegarder sans mise à jour de liste
    const binaryString = String.fromCharCode(...bytes);
    const base64String = btoa(binaryString);
    localStorage.setItem("gestion_db", base64String);
    await saveToIndexedDB(bytes);
    
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
    // Essayer IndexedDB d'abord
    const idbData = await loadFromIndexedDB();
    if (idbData) {
      return idbData.length;
    }
    
    // Fallback localStorage
    const activeDbData = localStorage.getItem("gestion_db");
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

// Importer une base depuis base64 (version sécurisée)
export async function importDb(base64Data) {
  if (isSaving) {
    console.warn("⚠️ Sauvegarde en cours - import reporté");
    throw new Error("Import en cours de sauvegarde, veuillez réessayer");
  }

  try {
    const SQL = await initSQL();
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    console.log(`📊 Import base de ${formatBytes(base64Data.length)}`);
    
    // Tester que la base est valide
    const testDb = new SQL.Database(bytes);
    testDb.close();
    
    // Si on arrive ici, la base est valide
    db = new SQL.Database(bytes);
    
    // PRIORITÉ 1: Sauvegarder dans IndexedDB
    await saveToIndexedDB(bytes);
    console.log("✅ Base importée dans IndexedDB");
    
    // PRIORITÉ 2: localStorage si taille raisonnable
    const MAX_LOCALSTORAGE_SIZE = 4 * 1024 * 1024; // 4MB
    if (base64Data.length < MAX_LOCALSTORAGE_SIZE) {
      try {
        if (window.localStorage._cache) {
          window.localStorage._cache["gestion_db"] = base64Data;
        }
        Object.getPrototypeOf(window.localStorage).setItem.call(window.localStorage, "gestion_db", base64Data);
        console.log("✅ Base importée dans localStorage (backup)");
      } catch (e) {
        if (e.name === 'QuotaExceededError') {
          console.warn("⚠️ localStorage plein pour import - IndexedDB uniquement");
        }
      }
    } else {
      console.log("ℹ️ Base importée trop volumineuse pour localStorage - IndexedDB uniquement");
    }
    
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

// Exporter les fonctions utilitaires pour BDD.html
export { getDbList, saveDbList, getActiveIndex, setActiveIndex };
