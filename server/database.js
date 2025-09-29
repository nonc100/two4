const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

let dbInstance = null;

function ensureDataDir() {
  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

function getDatabase() {
  if (dbInstance) {
    return dbInstance;
  }

  const dataDir = ensureDataDir();
  const dbPath = path.join(dataDir, 'markets.sqlite');
  dbInstance = new sqlite3.Database(dbPath);

  dbInstance.serialize(() => {
    dbInstance.run('PRAGMA journal_mode = WAL');
  });

  return dbInstance;
}

module.exports = {
  getDatabase,
};
