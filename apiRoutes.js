import { getDb } from './db.js';

export async function listeClients() {
  const db = await getDb();
  const stmt = db.prepare('SELECT numero_clt, nom, solde, reference, "contact ", "adresse " FROM "client " ORDER BY nom');
  let clients = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    clients.push({
      numero_clt: row.numero_clt,
      nom: row.nom || "",
      solde: row.solde || "0,00",
      reference: row.reference || "",
      contact: row.contact || "",
      adresse: row.adresse || ""
    });
  }
  stmt.free();
  return clients;
}

export async function listeFournisseurs() {
  const db = await getDb();
  const stmt = db.prepare('SELECT numero_fou, nom, "solde ", "reference ", "contact ", adresse FROM "fournisseur " ORDER BY nom');
  let fournisseurs = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    fournisseurs.push({
      numero_fou: row.numero_fou || "",
      nom: row.nom || "",
      solde: row.solde || "0,00",
      reference: row.reference || "",
      contact: row.contact || "",
      adresse: row.adresse || ""
    });
  }
  stmt.free();
  return fournisseurs;
}
export async function listeTables() {
  const db = await getDb();
  const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table'");
  let tables = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    tables.push(row.name);
  }
  stmt.free();
  return tables;
}