const Database = require('better-sqlite3');

// Initialisation de la base de données
const db = new Database('gestion.db', { verbose: console.log });

// Création des tables
db.exec(`
  DROP TABLE IF EXISTS client;
  DROP TABLE IF EXISTS fournisseur;

  CREATE TABLE client (
    numero_clt TEXT PRIMARY KEY,
    nom TEXT,
    solde TEXT,
    reference TEXT,
    contact TEXT,
    adresse TEXT
  );

  CREATE TABLE fournisseur (
    numero_fou TEXT PRIMARY KEY,
    nom TEXT,
    solde TEXT,
    reference TEXT,
    contact TEXT,
    adresse TEXT
  );
`);

// Insertion de données de test pour les clients
const insertClient = db.prepare(`
  INSERT INTO client (numero_clt, nom, solde, reference, contact, adresse)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const clients = [
  { numero_clt: 'CLT001', nom: 'Jean Dupont', solde: '1500,00', reference: 'REFC001', contact: 'jean.dupont@email.com', adresse: '123 Rue de Paris, 75001 Paris' },
  { numero_clt: 'CLT002', nom: 'Marie Curie', solde: '2300,50', reference: 'REFC002', contact: 'marie.curie@email.com', adresse: '45 Avenue des Sciences, 69000 Lyon' },
  { numero_clt: 'CLT003', nom: 'Luc Martin', solde: '0,00', reference: 'REFC003', contact: 'luc.martin@email.com', adresse: '12 Boulevard Voltaire, 33000 Bordeaux' }
];

for (const client of clients) {
  insertClient.run(client.numero_clt, client.nom, client.solde, client.reference, client.contact, client.adresse);
}

// Insertion de données de test pour les fournisseurs
const insertFournisseur = db.prepare(`
  INSERT INTO fournisseur (numero_fou, nom, solde, reference, contact, adresse)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const fournisseurs = [
  { numero_fou: 'FOU001', nom: 'Tech Supplies', solde: '5000,00', reference: 'REFF001', contact: 'contact@techsupplies.com', adresse: '789 Rue de l’Industrie, 69000 Lyon' },
  { numero_fou: 'FOU002', nom: 'Global Imports', solde: '3200,75', reference: 'REFF002', contact: 'info@globalimports.com', adresse: '56 Avenue de la Mer, 13000 Marseille' },
  { numero_fou: 'FOU003', nom: 'Eco Solutions', solde: '150,25', reference: 'REFF003', contact: 'eco.solutions@email.com', adresse: '23 Rue Verte, 44000 Nantes' }
];

for (const fournisseur of fournisseurs) {
  insertFournisseur.run(fournisseur.numero_fou, fournisseur.nom, fournisseur.solde, fournisseur.reference, fournisseur.contact, fournisseur.adresse);
}

// Fermer la connexion
db.close();
console.log('Base de données initialisée avec succès !');