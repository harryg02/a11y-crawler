import Database from 'better-sqlite3';
import path from 'path';
import { getDataDir } from '../paths';
import type { PageResult } from '../types';

type DB = InstanceType<typeof Database>;

/**
 * Durable crawl state, in its own SQLite file next to the app's data.
 *
 * Why a separate database from `database.sqlite`:
 *  - No write contention with the Next server, which inserts a `scan_logs` row
 *    for every line the crawler prints — by far the higher-frequency writer.
 *  - No schema coupling: the server owns scan bookkeeping, the crawler owns
 *    crawl progress, and neither migration affects the other.
 *  - It can be deleted wholesale once a run is reported, without touching
 *    anything the UI reads.
 *
 * Durability model: WAL + synchronous=NORMAL. Every mutation is its own
 * auto-committed transaction, so a committed row survives the crawler process
 * being SIGKILLed (the WAL write has already reached the OS). Only a machine
 * power-loss could lose the most recent transaction, which is an acceptable
 * trade for not fsync-ing on every page.
 */

export interface ResumeSnapshot {
  visited: string[];
  queue: string[];
  interactions: string[];
  routeHashes: [string, number][];
  boundaries: string[];
  results: PageResult[];
  boundary: string | null;
}

export function statePath(): string {
  return path.join(getDataDir(), 'crawl-state.db');
}

export class CrawlState {
  private db: DB;
  private scanId: string;
  /** Keys already written, so re-syncing a growing set stays O(new). */
  private persistedInteractions = new Set<string>();

  constructor(scanId: string) {
    this.scanId = scanId;
    this.db = new Database(statePath());
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    // The server may hold the write lock on its own DB, but another crawler (or
    // a stale reader) could hold this one; wait rather than throwing.
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS crawl_run (
        scan_id    TEXT PRIMARY KEY,
        config     TEXT NOT NULL,
        boundary   TEXT,
        status     TEXT NOT NULL,          -- running | completed | needs_login
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS crawl_page (
        scan_id   TEXT NOT NULL,
        canonical TEXT NOT NULL,
        url       TEXT NOT NULL,
        state     TEXT NOT NULL,           -- queued | done | skipped
        seq       INTEGER,
        PRIMARY KEY (scan_id, canonical)
      );
      CREATE TABLE IF NOT EXISTS crawl_interaction (
        scan_id TEXT NOT NULL,
        key     TEXT NOT NULL,
        PRIMARY KEY (scan_id, key)
      );
      CREATE TABLE IF NOT EXISTS crawl_route_hash (
        scan_id TEXT NOT NULL,
        pattern TEXT NOT NULL,
        hash    INTEGER NOT NULL,
        PRIMARY KEY (scan_id, pattern)
      );
      CREATE TABLE IF NOT EXISTS crawl_boundary (
        scan_id TEXT NOT NULL,
        prefix  TEXT NOT NULL,
        PRIMARY KEY (scan_id, prefix)
      );
      CREATE TABLE IF NOT EXISTS crawl_result (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_id TEXT NOT NULL,
        url     TEXT NOT NULL,
        json    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_page_scan  ON crawl_page(scan_id, state);
      CREATE INDEX IF NOT EXISTS idx_result_scan ON crawl_result(scan_id, id);
    `);
  }

  /** True when a previous run of this scan id left state behind. */
  hasPrevious(): boolean {
    const row = this.db.prepare('SELECT 1 FROM crawl_run WHERE scan_id = ?').get(this.scanId);
    return !!row;
  }

  begin(configJson: string, boundary: string) {
    this.db.prepare(`
      INSERT INTO crawl_run (scan_id, config, boundary, status) VALUES (?, ?, ?, 'running')
      ON CONFLICT(scan_id) DO UPDATE SET status='running', updated_at=CURRENT_TIMESTAMP
    `).run(this.scanId, configJson, boundary);
  }

  setStatus(status: 'running' | 'completed' | 'needs_login') {
    this.db.prepare('UPDATE crawl_run SET status=?, updated_at=CURRENT_TIMESTAMP WHERE scan_id=?')
      .run(status, this.scanId);
  }

  setBoundary(boundary: string) {
    this.db.prepare('UPDATE crawl_run SET boundary=?, updated_at=CURRENT_TIMESTAMP WHERE scan_id=?')
      .run(boundary, this.scanId);
  }

  /** Record a URL as pending. Ignores one already known in any state. */
  enqueue(url: string, canonical: string) {
    this.db.prepare(`
      INSERT INTO crawl_page (scan_id, canonical, url, state, seq)
      VALUES (?, ?, ?, 'queued', (SELECT COALESCE(MAX(seq), 0) + 1 FROM crawl_page WHERE scan_id = ?))
      ON CONFLICT(scan_id, canonical) DO NOTHING
    `).run(this.scanId, canonical, url, this.scanId);
  }

  /** Mark a page finished (or skipped), so a resume does not revisit it. */
  markPage(canonical: string, url: string, state: 'visiting' | 'done' | 'skipped') {
    this.db.prepare(`
      INSERT INTO crawl_page (scan_id, canonical, url, state, seq)
      VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM crawl_page WHERE scan_id = ?))
      ON CONFLICT(scan_id, canonical) DO UPDATE SET state=excluded.state
    `).run(this.scanId, canonical, url, state, this.scanId);
  }

  /** Persist only interaction keys not already written. */
  syncInteractions(keys: Set<string>) {
    const stmt = this.db.prepare('INSERT OR IGNORE INTO crawl_interaction (scan_id, key) VALUES (?, ?)');
    const write = this.db.transaction((newKeys: string[]) => {
      for (const k of newKeys) stmt.run(this.scanId, k);
    });
    const fresh: string[] = [];
    for (const k of keys) if (!this.persistedInteractions.has(k)) fresh.push(k);
    if (fresh.length === 0) return;
    write(fresh);
    for (const k of fresh) this.persistedInteractions.add(k);
  }

  setRouteHash(pattern: string, hash: number) {
    this.db.prepare(`
      INSERT INTO crawl_route_hash (scan_id, pattern, hash) VALUES (?, ?, ?)
      ON CONFLICT(scan_id, pattern) DO UPDATE SET hash=excluded.hash
    `).run(this.scanId, pattern, hash);
  }

  addBoundary(prefix: string) {
    this.db.prepare('INSERT OR IGNORE INTO crawl_boundary (scan_id, prefix) VALUES (?, ?)')
      .run(this.scanId, prefix);
  }

  /** Append one scan result. This is the write that makes a crash non-fatal. */
  addResult(result: PageResult) {
    this.db.prepare('INSERT INTO crawl_result (scan_id, url, json) VALUES (?, ?, ?)')
      .run(this.scanId, result.url, JSON.stringify(result));
  }

  /** Everything needed to re-enter the crawl loop where it stopped. */
  load(): ResumeSnapshot {
    const q = <T>(sql: string): T[] => this.db.prepare(sql).all(this.scanId) as T[];
    const run = this.db.prepare('SELECT boundary FROM crawl_run WHERE scan_id=?').get(this.scanId) as
      { boundary: string | null } | undefined;

    const results: PageResult[] = q<{ json: string }>(
      'SELECT json FROM crawl_result WHERE scan_id=? ORDER BY id ASC'
    ).map(r => JSON.parse(r.json) as PageResult);

    for (const k of q<{ key: string }>('SELECT key FROM crawl_interaction WHERE scan_id=?')) {
      this.persistedInteractions.add(k.key);
    }

    return {
      // 'visiting' means the previous process died partway through that page,
      // so it is deliberately NOT counted as visited — it goes back on the queue
      // and is scanned again. Only 'done'/'skipped' pages are truly finished.
      visited: q<{ canonical: string }>(
        "SELECT canonical FROM crawl_page WHERE scan_id=? AND state IN ('done','skipped')"
      ).map(r => r.canonical),
      queue: q<{ url: string }>(
        "SELECT url FROM crawl_page WHERE scan_id=? AND state IN ('queued','visiting') ORDER BY seq ASC"
      ).map(r => r.url),
      interactions: [...this.persistedInteractions],
      routeHashes: q<{ pattern: string; hash: number }>(
        'SELECT pattern, hash FROM crawl_route_hash WHERE scan_id=?'
      ).map(r => [r.pattern, r.hash] as [string, number]),
      boundaries: q<{ prefix: string }>('SELECT prefix FROM crawl_boundary WHERE scan_id=?').map(r => r.prefix),
      results,
      boundary: run?.boundary ?? null,
    };
  }

  /** Drop this run's rows once its report has been written. */
  clear() {
    const tx = this.db.transaction(() => {
      for (const t of ['crawl_page', 'crawl_interaction', 'crawl_route_hash', 'crawl_boundary', 'crawl_result', 'crawl_run']) {
        this.db.prepare(`DELETE FROM ${t} WHERE scan_id = ?`).run(this.scanId);
      }
    });
    tx();
  }

  close() { try { this.db.close(); } catch { /* already gone */ } }
}
