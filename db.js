let db = null;

export async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs({
    locateFile: () => 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm'
  });
  const response = await fetch('./gestion.db');
  if (!response.ok) throw new Error('Impossible de charger gestion.db');
  const arrayBuffer = await response.arrayBuffer();
  db = new SQL.Database(new Uint8Array(arrayBuffer));
  return db;
}