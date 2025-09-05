// db.js
import { initSqlJs } from 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.min.js';

let db = null;

export async function getDb() {
  if (db) return db;

  try {
    const SQL = await initSqlJs({
      locateFile: () => 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.wasm'
    });

    // Vérifier si une version de la base existe dans localStorage
    const dbBinaryBase64 = localStorage.getItem('gestion.db');
    if (dbBinaryBase64) {
      console.log('Chargement de la base SQLite depuis localStorage');
      const dbBinary = Uint8Array.from(atob(dbBinaryBase64), c => c.charCodeAt(0));
      db = new SQL.Database(dbBinary);
    } else {
      console.log('Aucune base trouvée dans localStorage, chargement depuis ./gestion.db');
      try {
        const response = await fetch('./gestion.db');
        if (!response.ok) throw new Error(`Impossible de charger gestion.db: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        db = new SQL.Database(new Uint8Array(arrayBuffer));
        await saveDbToLocalStorage(db);
      } catch (fetchError) {
        console.error('Erreur lors du chargement de gestion.db, création d\'une base vide');
        db = new SQL.Database();
        // Créer les tables nécessaires
        db.run(`
          CREATE TABLE IF NOT EXISTS client (
            numero_clt INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            solde TEXT,
            reference TEXT,
            contact TEXT,
            adresse TEXT
          );
          CREATE TABLE IF NOT EXISTS fournisseur (
            numero_fou INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            solde TEXT,
            reference TEXT,
            contact TEXT,
            adresse TEXT
          );
          CREATE TABLE IF NOT EXISTS utilisateur (
            numero_util INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            password2 TEXT NOT NULL,
            statue TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS item (
            numero_item INTEGER PRIMARY KEY AUTOINCREMENT,
            bar TEXT,
            designation TEXT NOT NULL,
            qte INTEGER NOT NULL,
            prix TEXT NOT NULL,
            prixba TEXT,
            prixb TEXT,
            prixvh TEXT,
            ref TEXT
          );
          CREATE TABLE IF NOT EXISTS comande (
            numero_comande INTEGER PRIMARY KEY AUTOINCREMENT,
            numero_table INTEGER,
            date_comande TEXT,
            FOREIGN KEY (numero_table) REFERENCES client(numero_clt)
          );
          CREATE TABLE IF NOT EXISTS attache (
            numero_comande INTEGER,
            numero_item INTEGER,
            quantite INTEGER,
            prixt TEXT,
            FOREIGN KEY (numero_comande) REFERENCES comande(numero_comande),
            FOREIGN KEY (numero_item) REFERENCES item(numero_item)
          );
        `);
        await saveDbToLocalStorage(db);
      }
    }

    console.log('Base de données SQLite initialisée');
    return db;
  } catch (error) {
    console.error('Erreur init DB:', error);
    throw error;
  }
}

export async function saveDbToLocalStorage(database) {
  console.log('Sauvegarde de la base dans localStorage...');
  try {
    const dbBinary = database.export();
    const dbBinaryBase64 = btoa(String.fromCharCode(...dbBinary));
    localStorage.setItem('gestion.db', dbBinaryBase64);
    console.log('Base sauvegardée dans localStorage');
  } catch (error) {
    console.error('Erreur lors de la sauvegarde dans localStorage:', error);
    console.log('La base est trop volumineuse pour localStorage, proposer un téléchargement manuel');
    downloadDb(database);
    throw error;
  }
}

function downloadDb(database) {
  const dbBinary = database.export();
  const blob = new Blob([dbBinary], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gestion.db';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log('Base téléchargée sous gestion.db');
}

export async function loadDbFromFile(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    db = new SQL.Database(new Uint8Array(arrayBuffer));
    await saveDbToLocalStorage(db);
    console.log('Base chargée depuis le fichier téléversé');
    return db;
  } catch (error) {
    console.error('Erreur lors du chargement du fichier:', error);
    throw error;
  }
}
