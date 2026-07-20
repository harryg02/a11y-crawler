import Database from 'better-sqlite3';
import { dbPath } from './paths';

type DB = InstanceType<typeof Database>;

let _db: DB | null = null;

function init(): DB {
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

  return db;
}

/** Opens the database on first call and reuses it thereafter. */
export function getDb(): DB {
  if (!_db) _db = init();
  return _db;
}

// Backwards-compatible handle so existing `db.prepare(...)` call sites keep
// working. Crucially, the connection is opened on first *use*, not at import:
// `next build` evaluates the API route modules in several worker processes, and
// opening/writing the DB at module load raced across them ("database is locked").
const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

export default db;
