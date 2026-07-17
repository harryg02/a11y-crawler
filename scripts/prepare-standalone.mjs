// Next's `output: 'standalone'` emits server.js + a traced node_modules, but it
// does NOT copy the static assets or the public/ dir into the standalone folder.
// The server expects them at ./.next/static and ./public relative to its own
// cwd, so copy them in to make .next/standalone fully self-contained for
// packaging.
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');

if (!fs.existsSync(standalone)) {
  console.error('No .next/standalone — run `next build` (output: standalone) first.');
  process.exit(1);
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true });
  console.log(`copied ${path.relative(root, from)} → ${path.relative(root, to)}`);
}

copyDir(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'));
copyDir(path.join(root, 'public'), path.join(standalone, 'public'));

console.log('standalone dir prepared.');
