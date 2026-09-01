const sqlite3 = require('sqlite3').verbose();                         const path = require('path');
                                                                      const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, 'orahdex.db');
const db = new sqlite3.Database(DB_PATH);                             
db.serialize(() => {                                                    db.run(`CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY, address TEXT UNIQUE, chain TEXT,                 name TEXT, description TEXT, tags TEXT,
    created_at TEXT, updated_at TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS audits (
    id TEXT PRIMARY KEY, contract_address TEXT, chain TEXT,
    contract_name TEXT, contract_type TEXT, audit_status TEXT,
    started_at TEXT, completed_at TEXT, findings_count INTEGER DEFAULT 0,
    critical_count INTEGER DEFAULT 0, high_count INTEGER DEFAULT 0,
    medium_count INTEGER DEFAULT 0, low_count INTEGER DEFAULT 0,
    info_count INTEGER DEFAULT 0, overall_risk_score REAL,
    created_at TEXT, updated_at TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS findings (
    id TEXT PRIMARY KEY, audit_id TEXT, title TEXT,
    description TEXT, severity TEXT, category TEXT,
    recommendation TEXT, created_at TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, wallet_address TEXT UNIQUE,
    email TEXT UNIQUE, password_hash TEXT, role TEXT DEFAULT 'user',
    created_at TEXT
  )`);

  // Seed OrahDEX contracts
  const stmt = db.prepare(`INSERT OR IGNORE INTO contracts (id, address, chain, name, description, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  stmt.run(crypto.randomUUID(), '0xa4625bd47869549ce8175361c13907b69456af37', 'base', 'OrahDEX Token', 'OrahDEX governance/utility token on Base chain', JSON.stringify(['token','governance','orahdex']), new Date().toISOString(), new Date().toISOString());
  stmt.run(crypto.randomUUID(), '0xd07379a755a8f11b57610154861d694b2a0f615a', 'base', 'OrahDEX BaseToken', 'Native Base chain DEX token for OrahDEX ecosystem', JSON.stringify(['token','dex','orahdex']), new Date().toISOString(), new Date().toISOString());
  stmt.finalize();

  console.log('[SQLite] Database ready at', DB_PATH);
});

module.exports = db;
