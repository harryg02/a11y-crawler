import Database from 'better-sqlite3';
import path from 'path';

// Ensure the data directory exists
const dbPath = path.join(process.cwd(), 'database.sqlite');

// Initialize the database
const db = new Database(dbPath);

// Enable WAL mode for better performance and concurrent access
db.pragma('journal_mode = WAL');

// Setup tables
db.exec(`
  CREATE TABLE IF NOT EXISTS active_scan (
    id TEXT PRIMARY KEY,
    config TEXT NOT NULL,
    status TEXT NOT NULL,
    pid INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS scan_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL, -- 'stdout', 'stderr', 'system'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(scan_id) REFERENCES active_scan(id) ON DELETE CASCADE
  );
`);

export default db;
