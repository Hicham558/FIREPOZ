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
let dbConnection = null;

export async function getDb() {
  if (db) return db;

  const SQL = await initSQL();

  try {
    // Charger depuis IndexedDB
    const savedDb = await idbGet("gestion_db");
    
    if (savedDb) {
      console.log("📦 Chargement base depuis IndexedDB");
      const bytes = Uint8Array.from(atob(savedDb), c => c.charCodeAt(0));
      db = new SQL.Database(bytes);
      console.log("✅ Base chargée (", (savedDb.length / 1024).toFixed(2), "KB)");
    } else {
      // Charger gestion.db par défaut
      console.log("📥 Chargement gestion.db initial");
      const response = await fetch("./gestion.db");
      if (!response.ok) throw new Error("Impossible de charger gestion.db");
      
      const arrayBuffer = await response.arrayBuffer();
      db = new SQL.Database(new Uint8Array(arrayBuffer));

      await saveDbToStorage(db);
      await idbSet("gestion_db_active", "gestion");
      console.log("💾 Base initiale sauvegardée");
    }

    return db;
  } catch (error) {
    console.error("❌ Erreur chargement DB:", error);
    throw error;
  }
}
// ========== FONCTION PRINCIPALE DE SAUVEGARDE AMÉLIORÉE ==========
export async function saveDbToStorage(database) {
  try {
    const startTime = performance.now();
    const dbBinary = database.export();
    const base64 = btoa(String.fromCharCode(...dbBinary));
    
    // Obtenir le nom de la base active
    const activeName = await idbGet("gestion_db_active") || "gestion";
    
    // Sauvegarder dans IndexedDB (base active)
    await idbSet("gestion_db", base64);
    
    // IMPORTANT : Sauvegarder aussi dans le backup de cette base
    await idbSet(`gestion_db_backup_${activeName}`, base64);
    
    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);
    
    console.log(`💾 Base "${activeName}" sauvegardée: ${(base64.length / 1024).toFixed(2)} KB en ${duration}ms`);
    return true;
  } catch (error) {
    console.error("❌ Erreur sauvegarde:", error);
    return false;
  }
}

// ✅ ALIAS POUR COMPATIBILITÉ - UTILISE LA MÊME FONCTION
export async function saveDbToLocalStorage(database) {
  return await saveDbToStorage(database);
}

export async function setActiveDb(base64Data) {
  try {
    const SQL = await initSQL();
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    // Fermer l'ancienne connexion
    if (db) {
      try {
        db.close();
      } catch (e) {
        console.warn("Impossible de fermer l'ancienne base");
      }
    }
    
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
    await idbRemove("gestion_db");
    await idbRemove("gestion_db_active");
    await idbRemove("gestion_db_server");
    await idbRemove("gestion_db_backup_gestion");
    await idbRemove("gestion_db_backup_serveur");

    if (db) {
      try {
        db.close();
      } catch (e) {
        console.warn("Impossible de fermer la base");
      }
    }
    
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
    const activeDbData = await idbGet("gestion_db");
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
    
    // Fermer l'ancienne
    if (db) {
      try {
        db.close();
      } catch (e) {}
    }
    
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

// ========== Fonctions pour Switch Serveur/Local ==========
export async function switchToServerDb() {
  try {
    const serverDb = await idbGet("gestion_db_server");
    if (!serverDb) {
      throw new Error("Aucune base serveur disponible. Téléchargez-la d'abord.");
    }
    
    // Sauvegarder la base actuelle avant de basculer
    if (db) {
      await saveDbToStorage(db);
    }
    
    await idbSet("gestion_db", serverDb);
    await idbSet("gestion_db_active", "serveur");
    
    // Recharger la base
    if (db) {
      try {
        db.close();
      } catch (e) {}
    }
    db = null;
    await getDb();
    
    console.log("✅ Basculé vers base serveur");
    return true;
  } catch (error) {
    console.error("❌ Erreur switch serveur:", error);
    throw error;
  }
}

export async function switchToDefaultDb() {
  try {
    // Sauvegarder la base actuelle avant de basculer
    if (db) {
      await saveDbToStorage(db);
    }
    
    // Essayer de restaurer depuis le backup
    let defaultDb = await idbGet('gestion_db_backup_gestion');
    
    if (!defaultDb) {
      // Si pas de backup, charger depuis le fichier
      const response = await fetch("./gestion.db");
      if (!response.ok) throw new Error("Impossible de charger gestion.db");
      
      const arrayBuffer = await response.arrayBuffer();
      defaultDb = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    }
    
    await idbSet("gestion_db", defaultDb);
    await idbSet("gestion_db_active", "gestion");
    
    // Recharger la base
    if (db) {
      try {
        db.close();
      } catch (e) {}
    }
    db = null;
    await getDb();
    
    console.log("✅ Basculé vers base par défaut");
    return true;
  } catch (error) {
    console.error("❌ Erreur switch défaut:", error);
    throw error;
  }
}

export async function getActiveDbName() {
  return await idbGet("gestion_db_active") || "gestion";
}

// ========== Fonction de nettoyage des anciens backups ==========
export async function cleanOldBackups() {
  try {
    const idb = await openIndexedDB();
    const tx = idb.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const allKeys = await new Promise((resolve, reject) => {
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    
    // Supprimer les anciens backups sauf gestion et serveur
    const backupsToKeep = ['gestion_db_backup_gestion', 'gestion_db_backup_serveur'];
    const backupsToDelete = allKeys.filter(key => 
      key.startsWith('gestion_db_backup_') && !backupsToKeep.includes(key)
    );
    
    for (const key of backupsToDelete) {
      await idbRemove(key);
      console.log(`🗑️ Backup supprimé: ${key}`);
    }
    
    return backupsToDelete.length;
  } catch (error) {
    console.error("❌ Erreur nettoyage backups:", error);
    return 0;
  }
}
