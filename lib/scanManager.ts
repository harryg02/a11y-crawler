import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import db from './db';
import { EventEmitter } from 'events';

// Global event emitter for pushing live logs to SSE connections
export const scanEvents = new EventEmitter();

// Signal files — must match the constants in lib/crawler/index.ts
const PAUSE_FILE = path.join(process.cwd(), '.pause');
const STOP_FILE = path.join(process.cwd(), '.stop');

// In-memory reference to the active process so we can kill it
let activeProcess: ChildProcess | null = null;

export function getActiveScan() {
  const row = db.prepare('SELECT * FROM active_scan WHERE status IN (?, ?, ?) LIMIT 1').get('running', 'paused', 'stopping') as any;
  if (!row) return null;
  return {
    ...row,
    config: JSON.parse(row.config)
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
  };

  const isWindows = process.platform === 'win32';
  const playwrightBin = path.join(
    process.cwd(), 'node_modules', '.bin',
    isWindows ? 'playwright.cmd' : 'playwright',
  );

  activeProcess = spawn(
    playwrightBin,
    ['test', 'tests/crawler.spec.ts', '--project=chromium'],
    { env: { ...process.env, ...crawlerEnv }, cwd: process.cwd(), shell: isWindows }
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
    insertLog(scanId, '__SCAN_ERROR__', 'system');
    db.prepare('UPDATE active_scan SET status = ? WHERE id = ?').run('error', scanId);
    activeProcess = null;
  });

  activeProcess.on('close', (code) => {
    if (scanUnreachable) {
      insertLog(scanId, '__SCAN_UNREACHABLE__', 'system');
      db.prepare('UPDATE active_scan SET status = ? WHERE id = ?').run('unreachable', scanId);
    } else {
      const finalStatus = code === 0 ? 'completed' : 'error';
      insertLog(scanId, code === 0 ? '__SCAN_COMPLETE__' : '__SCAN_ERROR__', 'system');
      db.prepare('UPDATE active_scan SET status = ? WHERE id = ?').run(finalStatus, scanId);
    }
    activeProcess = null;
  });

  return scanId;
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

export function getScanLogs(scanId: string) {
  return db.prepare('SELECT message FROM scan_logs WHERE scan_id = ? ORDER BY id ASC').all(scanId) as { message: string }[];
}
