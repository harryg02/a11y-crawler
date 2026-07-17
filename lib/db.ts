import Database from 'better-sqlite3';
import { dbPath } from './paths';

// Initialize the database (path resolves to the Electron userData dir when
// packaged, or the project dir under plain next dev/start).
const db = new Database(dbPath());

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
