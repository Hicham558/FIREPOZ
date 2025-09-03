let db = null;

export async function getDb() {
  console.log("Initialisation de getDb...");
  if (db) {
    console.log("Base de données déjà chargée");
    return db;
  }

  // Use global initSqlJs from sql-wasm.min.js (loaded in index.html)
  if (!window.initSqlJs) {
    throw new Error("initSqlJs is not available. Ensure sql-wasm.min.js is loaded.");
  }

  const SQL = await window.initSqlJs({
    locateFile: () => 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm'
  });
  console.log("sql.js initialisé");

  // 1. Try loading from IndexedDB
  try {
    console.log("Tentative de chargement depuis IndexedDB...");
    const request = indexedDB.open('gestionDB', 1);

    request.onupgradeneeded = event => {
      console.log("Création/mise à jour du schéma IndexedDB");
      event.target.result.createObjectStore('databases', { keyPath: 'name' });
    };

    const dbBinary = await new Promise((resolve, reject) => {
      request.onsuccess = event => {
        const idb = event.target.result;
        const transaction = idb.transaction(['databases'], 'readonly');
        const store = transaction.objectStore('databases');
        const getRequest = store.get('gestion.db');
        getRequest.onsuccess = () => {
          if (getRequest.result) {
            console.log("Base de données trouvée dans IndexedDB, taille :", getRequest.result.data.byteLength, "octets");
            resolve(getRequest.result.data);
          } else {
            console.log("Aucune base trouvée dans IndexedDB");
            resolve(null);
          }
        };
        getRequest.onerror = () => reject(getRequest.error);
      };
      request.onerror = () => reject(request.error);
    });

    if (dbBinary) {
      db = new SQL.Database(new Uint8Array(dbBinary));
      console.log("Base de données chargée depuis IndexedDB");
      // Verify tables
      const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table';");
      console.log("Tables trouvées dans la base IndexedDB :", tables[0]?.values?.map(row => row[0]) || []);
      return db;
    }
  } catch (error) {
    console.error("Erreur lors du chargement depuis IndexedDB :", error);
  }

  // 2. Fallback: load from gestion.db
  console.log("Chargement depuis ./gestion.db...");
  const response = await fetch('./gestion.db');
  if (!response.ok) {
    console.error("Erreur lors du chargement de gestion.db :", response.statusText);
    throw new Error('Impossible de charger gestion.db');
  }
  const arrayBuffer = await response.arrayBuffer();
  console.log("gestion.db chargé, taille :", arrayBuffer.byteLength, "octets");
  db = new SQL.Database(new Uint8Array(arrayBuffer));
  console.log("Base de données initialisée depuis gestion.db");

  // Verify tables
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table';");
  console.log("Tables trouvées dans la base :", tables[0]?.values?.map(row => row[0]) || []);

  return db;
}
