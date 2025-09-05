// db.js
let db = null;

export async function getDb() {
  if (db) return db;
  
  const SQL = await initSqlJs({
    locateFile: () => 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm'
  });

  try {
    // Essayer de charger depuis LocalStorage
    const savedDb = localStorage.getItem('gestion_db');
    
    if (savedDb) {
      console.log('📦 Chargement de la base depuis LocalStorage');
      const binaryString = atob(savedDb);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      db = new SQL.Database(bytes);
    } else {
      // Charger la base initiale
      console.log('📥 Chargement de la base initiale depuis gestion.db');
      const response = await fetch('./gestion.db');
      if (!response.ok) throw new Error('Impossible de charger gestion.db');
      const arrayBuffer = await response.arrayBuffer();
      db = new SQL.Database(new Uint8Array(arrayBuffer));
      
      // Sauvegarder la base initiale
      saveDbToLocalStorage(db);
    }
    
    return db;
  } catch (error) {
    console.error('❌ Erreur chargement DB:', error);
    throw error;
  }
}

// Sauvegarder la base dans LocalStorage
export function saveDbToLocalStorage(database) {
  try {
    const dbBinary = database.export();
    const binaryString = String.fromCharCode(...dbBinary);
    const base64String = btoa(binaryString);
    localStorage.setItem('gestion_db', base64String);
    console.log('💾 Base sauvegardée dans LocalStorage');
  } catch (error) {
    console.error('❌ Erreur sauvegarde LocalStorage:', error);
  }
}

// Réinitialiser la base (pour debug)
export function resetDatabase() {
  localStorage.removeItem('gestion_db');
  db = null;
  console.log('🔄 Base réinitialisée');
  alert('Base de données réinitialisée !');
}

// Vérifier la taille de la base (optionnel)
export function getDbSize() {
  const savedDb = localStorage.getItem('gestion_db');
  return savedDb ? savedDb.length : 0;
}