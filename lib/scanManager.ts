import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import db from './db';
import { EventEmitter } from 'events';
import { PAUSE_FILE as pauseFile, STOP_FILE as stopFile, getDataDir, reportPath } from './paths';
import { getResumable } from './crawlState';

// Global event emitter for pushing live logs to SSE connections
export const scanEvents = new EventEmitter();

// Signal files — must match the constants in lib/crawler/checkpoint.ts
const PAUSE_FILE = pauseFile();
const STOP_FILE = stopFile();

// In-memory reference to the active process so we can kill it
let activeProcess: ChildProcess | null = null;

export function getActiveScan() {
  ensureRecovered();
  const row = db.prepare('SELECT * FROM active_scan WHERE status IN (?, ?, ?) LIMIT 1').get('running', 'paused', 'stopping') as any;
  if (!row) return null;
  return {
    ...row,
    config: JSON.parse(row.config)
  };
}

/**
 * The most recent run that died unexpectedly but still has resumable progress.
 * Kept out of getActiveScan so it never blocks starting a fresh scan.
 */
export function getInterruptedScan() {
  ensureRecovered();
  const row = db.prepare(
    "SELECT * FROM active_scan WHERE status = 'interrupted' ORDER BY created_at DESC LIMIT 1"
  ).get() as any;
  if (!row) return null;
  const progress = getResumable(row.id);
  if (!progress) return null;
  const config = JSON.parse(row.config);
  return {
    scanId: row.id,
    config,
    // A scan that was given a login page needs the session re-established: the
    // cookies died with the crawler process and were never written to disk.
    requiresLogin: Boolean(config.startingUrl),
    ...progress,
  };
}

function insertLog(scanId: string, message: string, type: 'stdout' | 'stderr' | 'system' = 'stdout') {
  db.prepare('INSERT INTO scan_logs (scan_id, message, type) VALUES (?, ?, ?)').run(scanId, message, type);
  scanEvents.emit('log', { scanId, message, type });
}

export function startScan(config: any) {
  const existing = getActiveScan();
  if (existing) {
    throw new Error('A scan is already running');
  }

  // Cleanup: Keep only the 20 most recent scans in the DB to prevent bloat.
  // Because of ON DELETE CASCADE, this automatically wipes thousands of old log lines.
  db.prepare(`
    DELETE FROM active_scan 
    WHERE id NOT IN (
      SELECT id FROM active_scan ORDER BY created_at DESC LIMIT 20
    )
  `).run();

  const scanId = `scan-${Date.now()}`;

  db.prepare('INSERT INTO active_scan (id, config, status) VALUES (?, ?, ?)').run(
    scanId,
    JSON.stringify(config),
    'running'
  );

  spawnCrawler(scanId, config, false);

  return scanId;
}

/**
 * Launch the crawler subprocess for a scan. `resume` re-enters an existing run
 * from its saved crawl state instead of starting the frontier from scratch.
 */
function spawnCrawler(scanId: string, config: any, resume: boolean) {
  const requiresLogin = Boolean(config.startingUrl);

  const crawlerEnv: Record<string, string> = {
    CRAWLER_SCOPE: config.scope,
    CRAWLER_BOUNDARY: config.crawlBoundary || config.scope,
    CRAWLER_START_URL: config.startingUrl || config.scope,
    CRAWLER_MAX_DEPTH: String(config.maxDepth),
    CRAWLER_TIMEOUT: String(config.timeout * 60 * 1000),
    CRAWLER_BLOCKED: JSON.stringify(config.forbiddenWords ?? []),
    CRAWLER_EXCLUDED: JSON.stringify(config.excludedScopes ?? []),
    CRAWLER_WATCH_MODE: config.watchMode ? 'true' : 'false',
    CRAWLER_REQUIRES_LOGIN: requiresLogin ? 'true' : 'false',
    // Ties the crawl-state DB rows to this scan, so an interrupted run can be
    // resumed under the same id.
    CRAWLER_SCAN_ID: scanId,
    CRAWLER_RESUME: resume ? 'true' : 'false',
  };

  // Run the standalone, pre-bundled crawler (lib/crawler/run.ts → crawler.cjs).
  //  - In dev / next start: process.execPath is node and the bundle sits in the
  //    project's .crawler-build dir.
  //  - In a packaged Electron app: the main process sets A11Y_CRAWLER_SCRIPT to
  //    the unpacked bundle path and A11Y_NODE_BIN to the Electron binary (which
  //    runs as node via the inherited ELECTRON_RUN_AS_NODE flag).
  const nodeBin = process.env.A11Y_NODE_BIN || process.execPath;
  const crawlerScript = process.env.A11Y_CRAWLER_SCRIPT
    || path.join(process.cwd(), '.crawler-build', 'crawler.cjs');

  activeProcess = spawn(
    nodeBin,
    [crawlerScript],
    { env: { ...process.env, ...crawlerEnv }, cwd: getDataDir() },
  );

  db.prepare('UPDATE active_scan SET pid = ? WHERE id = ?').run(activeProcess.pid, scanId);

  let scanUnreachable = false;

  const handleOutput = (data: Buffer, type: 'stdout' | 'stderr') => {
    data.toString().split('\n').forEach(line => {
      if (line.includes('__SCAN_UNREACHABLE__')) {
        scanUnreachable = true;
      } else if (line.trim()) {
        insertLog(scanId, line, type);
      }
    });
  };

  activeProcess.stdout?.on('data', (data) => handleOutput(data, 'stdout'));
  activeProcess.stderr?.on('data', (data) => handleOutput(data, 'stderr'));

  activeProcess.on('error', (err) => {
    insertLog(scanId, `Crawler failed to start: ${err.message}`, 'system');
    // spawnCrawler serves resumes as well as fresh starts, and a resume that
    // fails to spawn still has everything the previous attempt saved. Marking it
    // 'error' would orphan that crawl for good: getInterruptedScan() only ever
    // looks at 'interrupted', so nothing would offer to continue it again.
    const resumable = getResumable(scanId);
    insertLog(scanId, resumable ? '__SCAN_INTERRUPTED__' : '__SCAN_ERROR__', 'system');
    db.prepare('UPDATE active_scan SET status = ? WHERE id = ?')
      .run(resumable ? 'interrupted' : 'error', scanId);
    activeProcess = null;
  });

  activeProcess.on('close', (code) => {
    if (scanUnreachable) {
      insertLog(scanId, '__SCAN_UNREACHABLE__', 'system');
      db.prepare('UPDATE active_scan SET status = ? WHERE id = ?').run('unreachable', scanId);
    } else {
      // A non-zero exit that left resumable progress behind is an interruption,
      // not a failure — the user gets "paused, resume?" rather than "failed".
      const resumable = code === 0 ? null : getResumable(scanId);
      // And a non-zero exit that produced a report anyway is not a failure the
      // user can act on: the crawl reached the end and something threw on the way
      // out, after the state DB was already cleared. "Scan Failed" would hide a
      // report they can open. So 'error' is reserved for a run with neither
      // progress to resume nor a report to show — the only case where there is
      // genuinely nothing left of the scan.
      const reported = code !== 0 && !resumable && fs.existsSync(reportPath(scanId));
      const finalStatus = code === 0 || reported ? 'completed' : resumable ? 'interrupted' : 'error';
      insertLog(
        scanId,
        finalStatus === 'completed' ? '__SCAN_COMPLETE__'
          : finalStatus === 'interrupted' ? '__SCAN_INTERRUPTED__'
          : '__SCAN_ERROR__',
        'system',
      );
      db.prepare('UPDATE active_scan SET status = ? WHERE id = ?').run(finalStatus, scanId);
    }
    activeProcess = null;
  });
}

/**
 * Re-launch the most recent interrupted scan, continuing from its saved state.
 * Returns null when there is nothing resumable.
 */
export function continueScan(): { scanId: string } | null {
  const interrupted = getInterruptedScan();
  if (!interrupted) return null;
  if (getActiveScan()) throw new Error('A scan is already running');

  db.prepare('UPDATE active_scan SET status = ? WHERE id = ?').run('running', interrupted.scanId);

  // Drop the terminal markers from the previous attempt. /api/scan/stream
  // replays a scan's whole log history to every new subscriber, and the client
  // reads these sentinels as state changes — so without this the UI re-subscribes
  // after resuming, immediately replays __SCAN_INTERRUPTED__, and snaps back to
  // "Scan Paused" even though the crawl is running and its logs are streaming in.
  db.prepare(
    `DELETE FROM scan_logs WHERE scan_id = ? AND message IN
       ('__SCAN_INTERRUPTED__', '__SCAN_ERROR__', '__SCAN_COMPLETE__', '__SCAN_UNREACHABLE__')`
  ).run(interrupted.scanId);

  insertLog(
    interrupted.scanId,
    `Resuming scan — ${interrupted.pagesDone} page(s) already scanned, ${interrupted.pagesQueued} still queued.`,
    'system',
  );
  spawnCrawler(interrupted.scanId, interrupted.config, true);
  return { scanId: interrupted.scanId };
}

export function stopScan() {
  const active = getActiveScan();
  if (!active) return;

  db.prepare('UPDATE active_scan SET status = ? WHERE id = ?').run('stopping', active.id);
  insertLog(active.id, 'Scan stopping...', 'system');

  // Write the .stop signal file — the crawler checks this between pages
  fs.writeFileSync(STOP_FILE, '');

  // Also remove .pause file if it exists, so the crawler can unblock and see the stop
  if (fs.existsSync(PAUSE_FILE)) fs.unlinkSync(PAUSE_FILE);
}

export function pauseScan() {
  const active = getActiveScan();
  if (!active) return;

  // Write the .pause signal file — the crawler polls for this between pages
  fs.writeFileSync(PAUSE_FILE, '');

  db.prepare('UPDATE active_scan SET status = ? WHERE id = ?').run('paused', active.id);
  // insertLog(active.id, 'Scan paused.', 'system');
}

export function resumeScan() {
  const active = getActiveScan();
  if (!active) return;

  // Delete the .pause signal file — the crawler will detect this and resume
  if (fs.existsSync(PAUSE_FILE)) fs.unlinkSync(PAUSE_FILE);

  db.prepare('UPDATE active_scan SET status = ? WHERE id = ?').run('running', active.id);
  insertLog(active.id, 'Scan resumed.', 'system');
}

/**
 * What happened to one scan, by id, with its output.
 *
 * A scan that dies before the client attaches to the log stream leaves no trace
 * in the UI: /api/scan/stream 204s because the run is no longer active, and the
 * client reports a bare "Scan Stopped" with an empty panel — even though the
 * reason ("Crawler failed to start: ...") was written to scan_logs. This lets
 * the client go back and ask.
 */
export function getScanOutcome(scanId: string) {
  const row = db.prepare('SELECT status FROM active_scan WHERE id = ?').get(scanId) as { status: string } | undefined;
  if (!row) return null;
  const messages = (db.prepare(
    'SELECT message FROM scan_logs WHERE scan_id = ? ORDER BY id ASC'
  ).all(scanId) as { message: string }[])
    .map(m => m.message)
    .filter(m => !m.startsWith('__SCAN_'));
  return { scanId, status: row.status, messages };
}

export function getScanLogs(scanId: string) {
  return db.prepare('SELECT message FROM scan_logs WHERE scan_id = ? ORDER BY id ASC').all(scanId) as { message: string }[];
}

// ----------------------------------------------------------------------------
// Startup Recovery (Orphan Process Cleanup)
// Runs exactly once, on the first scan-state query after the server boots. This
// used to run at module import, but that touched the DB during `next build`
// (route modules are evaluated in several workers) and raced ("database is
// locked"). Deferring to first real use keeps build-time evaluation side-effect
// free while still running once when the server actually handles a request.
// ----------------------------------------------------------------------------
let recovered = false;
function ensureRecovered() {
  if (recovered) return;
  recovered = true;
  try {
    const stuckScans = db.prepare('SELECT id, pid FROM active_scan WHERE status IN (?, ?, ?)').all('running', 'paused', 'stopping') as any[];

    for (const scan of stuckScans) {
      if (scan.pid) {
        try {
          // Check if the OS process is still alive
          process.kill(scan.pid, 0);

          // If we reach here, it didn't throw, meaning the process is a ghost running in the background.
          // We must kill it forcefully.
          console.log(`[Startup Recovery] Found ghost Playwright process (PID: ${scan.pid}). Killing it.`);
          process.kill(scan.pid, 'SIGKILL');
        } catch (e) {
          // process.kill(pid, 0) threw an error, which means the process is already dead.
          console.log(`[Startup Recovery] Process ${scan.pid} is already dead.`);
        }
      }

      // Reset the database state so the UI unlocks. If the crawler got far
      // enough to save progress, mark it resumable rather than failed — this is
      // the state the "Resume scan" button acts on.
      const resumable = getResumable(scan.id);
      // Same rule as the close handler: a run with a report on disk finished its
      // work, whatever killed the process afterwards.
      const reported = !resumable && fs.existsSync(reportPath(scan.id));
      db.prepare('UPDATE active_scan SET status = ? WHERE id = ?')
        .run(resumable ? 'interrupted' : reported ? 'completed' : 'error', scan.id);
      insertLog(
        scan.id,
        resumable
          ? `Scan interrupted: the server restarted. ${resumable.pagesDone} page(s) were saved and the scan can be resumed.`
          : reported
          ? 'The server restarted after this scan had finished; its report was already written.'
          : 'Scan aborted: The server was restarted unexpectedly.',
        'system',
      );
      insertLog(
        scan.id,
        resumable ? '__SCAN_INTERRUPTED__' : reported ? '__SCAN_COMPLETE__' : '__SCAN_ERROR__',
        'system',
      );
    }
  } catch (err) {
    console.error('[Startup Recovery] Failed to clean up stuck scans:', err);
  }
}
