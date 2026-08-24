// better-sqlite3 is a native addon, and TWO processes in the packaged app need
// it: the Next standalone server, and — since crawl progress became durable —
// the crawler subprocess. Both run under Electron-as-node, whose ABI differs
// from the host Node that `npm ci` compiled against, so an unpatched copy fails
// with ERR_DLOPEN_FAILED the first time it is required.
//
// Rebuild once for Electron's ABI, then place the result in both consumers:
//   1. .next/standalone/node_modules/better-sqlite3   (server; Next traced it in)
//   2. .crawler-build/node_modules/{better-sqlite3,bindings,file-uri-to-path}
//      (crawler; staged here so electron-builder can copy an Electron-ABI tree
//      into resources/crawler/node_modules rather than the host-ABI one in the
//      project's node_modules)
//
// The rebuild happens in a throwaway dir so the project's own
// node_modules/better-sqlite3 stays built for the host Node — otherwise
// `next dev` would break after every `dist`.
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { rebuild } = require('@electron/rebuild');
const electronVersion = require('electron/package.json').version;

const root = process.cwd();
const standaloneBsq = path.join(root, '.next', 'standalone', 'node_modules', 'better-sqlite3');
// NOT named node_modules: it sits beside .crawler-build/crawler.cjs, so if it
// were, plain `node .crawler-build/crawler.cjs` in dev would resolve this
// Electron-ABI copy and die with ERR_DLOPEN_FAILED. electron-builder renames it
// to node_modules on the way into the app bundle.
const crawlerModules = path.join(root, '.crawler-build', 'electron-node_modules');

if (!fs.existsSync(standaloneBsq)) {
  console.error('No .next/standalone/node_modules/better-sqlite3 — run electron:build first.');
  process.exit(1);
}

// ---- rebuild once, for Electron's ABI -------------------------------------
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

// ---- 1. the Next standalone server ----------------------------------------
const serverDest = path.join(standaloneBsq, 'build', 'Release', 'better_sqlite3.node');
fs.mkdirSync(path.dirname(serverDest), { recursive: true });
fs.copyFileSync(built, serverDest);
console.log(`  server  → ${path.relative(root, serverDest)}`);

// ---- 2. the crawler subprocess ---------------------------------------------
// Only the runtime surface is staged: better-sqlite3's JS entry plus the addon,
// and the two pure-JS packages it resolves at require time (database.js does
// require('bindings')('better_sqlite3.node'), and bindings needs
// file-uri-to-path). Deliberately skips src/ and deps/ — the sqlite3 amalgamation
// is build-time only and would add megabytes to every installer.
fs.rmSync(crawlerModules, { recursive: true, force: true });
const stagedBsq = path.join(crawlerModules, 'better-sqlite3');
fs.mkdirSync(path.join(stagedBsq, 'build', 'Release'), { recursive: true });
fs.cpSync(path.join(root, 'node_modules', 'better-sqlite3', 'lib'), path.join(stagedBsq, 'lib'), { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules', 'better-sqlite3', 'package.json'), path.join(stagedBsq, 'package.json'));
fs.copyFileSync(built, path.join(stagedBsq, 'build', 'Release', 'better_sqlite3.node'));
for (const dep of ['bindings', 'file-uri-to-path']) {
  fs.cpSync(path.join(root, 'node_modules', dep), path.join(crawlerModules, dep), { recursive: true });
}
console.log(`  crawler → ${path.relative(root, crawlerModules)} (better-sqlite3, bindings, file-uri-to-path)`);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('better-sqlite3 staged for Electron ABI in both consumers.');
