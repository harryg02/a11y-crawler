// Bundles the standalone crawler (lib/crawler/run.ts) into a single CommonJS
// file that can be spawned with `node` (or Electron-as-node) without the
// Playwright test runner or an on-the-fly TypeScript loader.
//
// `playwright` / `playwright-core` are left external: they locate and launch the
// downloaded browser binaries at runtime and must be resolved from a real
// node_modules on disk, not inlined into the bundle.
import { build } from 'esbuild';

await build({
  entryPoints: ['lib/crawler/run.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: '.crawler-build/crawler.cjs',
  // better-sqlite3 is a native addon (crawl-state persistence) — it must be
  // resolved from a real node_modules at runtime, never inlined.
  external: ['playwright', 'playwright-core', '@playwright/test', 'electron', 'fsevents', 'better-sqlite3'],
  logLevel: 'info',
});

console.log('Crawler bundled → .crawler-build/crawler.cjs');
