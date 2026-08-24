import fs from 'fs';
import path from 'path';

/**
 * Resolves the writable data directory for the app.
 *
 * When packaged inside Electron, the app bundle is read-only (it lives inside
 * an asar archive), so all mutable state — the SQLite database, JSON reports,
 * and the .pause/.stop/.login-complete signal files — must live somewhere
 * writable. Electron's main process sets A11Y_DATA_DIR to app.getPath('userData')
 * and passes it down to the Next server and the crawler subprocess.
 *
 * In plain `next dev` / `next start` (no Electron), A11Y_DATA_DIR is unset and
 * we fall back to the project directory, preserving the original behaviour.
 */
export function getDataDir(): string {
  const dir = process.env.A11Y_DATA_DIR || process.cwd();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function dbPath(): string {
  return path.join(getDataDir(), 'database.sqlite');
}

export function reportsDir(): string {
  const dir = path.join(getDataDir(), 'reports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function reportPath(scanId: string): string {
  return path.join(reportsDir(), `report-${scanId}.json`);
}

export function statePath(): string {
  return path.join(getDataDir(), 'crawl-state.db');
}

export const PAUSE_FILE = (): string => path.join(getDataDir(), '.pause');
export const STOP_FILE = (): string => path.join(getDataDir(), '.stop');
export const LOGIN_COMPLETE_FILE = (): string => path.join(getDataDir(), '.login-complete');
