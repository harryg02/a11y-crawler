// Download the Playwright Chromium build into ./pw-browsers so electron-builder
// can ship it inside the app (resources/ms-playwright) instead of the app
// downloading it on first run. Runs on each build machine, so each platform's
// artifact bundles that platform's Chromium.
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import path from 'path';

const require = createRequire(import.meta.url);
// Resolve the installed playwright's CLI so the bundled browser build matches
// the playwright version the crawler uses.
const cli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js');
const dir = path.join(process.cwd(), 'pw-browsers');

console.log(`Installing Chromium into ${dir} for bundling...`);
execFileSync(process.execPath, [cli, 'install', 'chromium'], {
  stdio: 'inherit',
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: dir },
});
console.log('Chromium bundled → pw-browsers');
