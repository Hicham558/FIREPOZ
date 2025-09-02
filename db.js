// db.js
let db;

export async function initDb() {
  if (db) return db;

  // Charger sql.js (tu dois inclure sql-wasm.js dans index.html)
  const SQL = await initSqlJs({
    locateFile: file => `./sql-wasm.wasm`
  });

  try {
    // Essayer de charger ton fichier restocafee.db (dans assets)
    const response = await fetch("restocafee.db");
    if (!response.ok) throw new Error("Fichier introuvable");

    const buffer = await response.arrayBuffer();
    db = new SQL.Database(new Uint8Array(buffer));
    console.log("✅ Base chargée depuis restocafee.db");
  } catch (e) {
    console.warn("⚠️ Base non trouvée → création d'une nouvelle");
    db = new SQL.Database();

    // Créer tables si pas de base
    db.run(`
      CREATE TABLE client (
        numero_clt INTEGER PRIMARY KEY,
        nom TEXT,
        solde TEXT,
        reference TEXT,
        contact TEXT,
        adresse TEXT
      );
    `);

    db.run(`
      CREATE TABLE fournisseur (
        numero_fou INTEGER PRIMARY KEY,
        nom TEXT,
        solde TEXT,
        reference TEXT,
        contact TEXT,
        adresse TEXT
      );
    `);
  }

  return db;
}

export function getDb() {
  return db;
}