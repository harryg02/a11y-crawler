// Dev launcher for Electron.
//
// Two environment quirks this guards against:
//   1. ELECTRON_RUN_AS_NODE — if set (as it is in some containers/shells), the
//      Electron binary runs as plain Node and `require('electron').app` is
//      undefined, so main.js can't create a window. We must clear it *before*
//      the process starts; it can't be undone from inside main.js.
//   2. The Chromium sandbox needs privileges most dev containers don't grant,
//      so we pass --no-sandbox for the dev run only (the packaged app, launched
//      normally, keeps the sandbox).
//
// Deleting an unset var and passing --no-sandbox in dev are both harmless on a
// normal machine, so this launcher works everywhere.
import { spawn } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// The `electron` package exports the absolute path to its binary.
const electronBinary = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;

const args = ['.', '--no-sandbox', ...process.argv.slice(2)];
const child = spawn(electronBinary, args, { stdio: 'inherit', env });
child.on('close', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('Failed to launch Electron:', err);
  process.exit(1);
});
