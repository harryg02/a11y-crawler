// The Next standalone build traces in a copy of better-sqlite3 whose native
// binary was compiled (by `npm ci`) for the host Node ABI. But the packaged app
// runs that server under Electron-as-node, which has a different ABI — so the
// server would fail to load better-sqlite3 (ERR_DLOPEN_FAILED) on any DB route.
//
// Rebuild better-sqlite3 for Electron's ABI and drop the resulting binary into
// the standalone copy. We rebuild in a throwaway copy so the project's own
// node_modules/better-sqlite3 stays built for the host Node (keeps `next dev`
// working after a `dist`).
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { rebuild } = require('@electron/rebuild');
const electronVersion = require('electron/package.json').version;

const root = process.cwd();
const standaloneBsq = path.join(root, '.next', 'standalone', 'node_modules', 'better-sqlite3');
const dest = path.join(standaloneBsq, 'build', 'Release', 'better_sqlite3.node');

if (!fs.existsSync(standaloneBsq)) {
  console.error('No .next/standalone/node_modules/better-sqlite3 — run electron:build first.');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bsq-electron-'));
fs.mkdirSync(path.join(tmp, 'node_modules'), { recursive: true });
fs.cpSync(
  path.join(root, 'node_modules', 'better-sqlite3'),
  path.join(tmp, 'node_modules', 'better-sqlite3'),
  { recursive: true },
);
// @electron/rebuild treats buildPath as a project root and reads its
// package.json, so the throwaway dir needs one that lists better-sqlite3.
fs.writeFileSync(
  path.join(tmp, 'package.json'),
  JSON.stringify({ name: 'bsq-electron-rebuild', version: '1.0.0', dependencies: { 'better-sqlite3': '*' } }),
);

console.log(`Rebuilding better-sqlite3 for Electron ${electronVersion}...`);
await rebuild({ buildPath: tmp, electronVersion, onlyModules: ['better-sqlite3'], force: true });

const built = path.join(tmp, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(built, dest);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`Patched standalone better-sqlite3 → ${path.relative(root, dest)}`);
