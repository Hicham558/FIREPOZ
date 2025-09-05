// db.js
import { initSqlJs } from 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.min.js';

let db = null;

export async function getDb() {
  if (db) return db;

  try {
    const SQL = await initSqlJs({
      locateFile: () => 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm'
    });

    // Vérifier si une version de la base existe dans localStorage
    const dbBinaryBase64 = localStorage.getItem('gestion.db');
    if (dbBinaryBase64) {
      console.log('Chargement de la base SQLite depuis localStorage');
      // Décoder la chaîne base64 en tableau binaire
      const dbBinary = Uint8Array.from(atob(dbBinaryBase64), c => c.charCodeAt(0));
      db = new SQL.Database(dbBinary);
    } else {
      console.log('Aucune base trouvée dans localStorage, chargement depuis ./gestion.db');
      const response = await fetch('./gestion.db');
      if (!response.ok) throw new Error('Impossible de charger gestion.db');
      const arrayBuffer = await response.arrayBuffer();
      db = new SQL.Database(new Uint8Array(arrayBuffer));
      // Sauvegarder la base initiale dans localStorage
      await saveDbToLocalStorage(db);
    }

    console.log('Base de données SQLite initialisée');
    return db;
  } catch (error) {
    console.error('Erreur init DB:', error);
    throw error;
  }
}

// Fonction pour sauvegarder la base dans localStorage
export async function saveDbToLocalStorage(database) {
  console.log('Sauvegarde de la base dans localStorage...');
  try {
    const dbBinary = database.export();
    // Convertir le tableau binaire en chaîne base64
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

// Télécharger la base sous forme de fichier
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

// Charger la base depuis un fichier téléversé par l'utilisateur
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
