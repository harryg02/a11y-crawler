import Database from 'better-sqlite3';
import fs from 'fs';
import { statePath } from './paths';

/**
 * Read-only view of the crawler's own progress database, for the server.
 *
 * The crawler owns crawl-state.db and is the only writer; the server just needs
 * to answer one question when a run dies unexpectedly: is there enough saved
 * progress to offer the user a resume? Opened readonly per call and closed
 * immediately, so this never holds a lock against the running crawler.
 */
export interface ResumableInfo {
  pagesDone: number;
  pagesQueued: number;
  results: number;
}

export function getResumable(scanId: string): ResumableInfo | null {
  const p = statePath();
  if (!fs.existsSync(p)) return null;
  let db: InstanceType<typeof Database> | null = null;
  try {
    db = new Database(p, { readonly: true, fileMustExist: true });
    const run = db.prepare('SELECT scan_id FROM crawl_run WHERE scan_id = ?').get(scanId);
    if (!run) return null;
    const one = (sql: string) => (db!.prepare(sql).get(scanId) as { c: number }).c;
    const pagesQueued = one("SELECT COUNT(*) c FROM crawl_page WHERE scan_id=? AND state IN ('queued','visiting')");
    // Nothing left to visit means there is nothing to resume — the run either
    // finished or died with a drained queue, and a fresh scan is the right call.
    if (pagesQueued === 0) return null;
    return {
      pagesDone: one("SELECT COUNT(*) c FROM crawl_page WHERE scan_id=? AND state IN ('done','skipped')"),
      pagesQueued,
      results: one('SELECT COUNT(*) c FROM crawl_result WHERE scan_id=?'),
    };
  } catch {
    // Crawler may have died before creating the schema, or the file may be a
    // half-written WAL. Either way: nothing resumable.
    return null;
  } finally {
    try { db?.close(); } catch { /* already closed */ }
  }
}
