// `node experiments/tabbing/serve.mjs` — eyeball the fixtures by hand.
//
// The React fixture needs fixtures/react/app.js, which is generated and not
// committed. Run the pilot once first (it builds the bundle), or call
// ensureReactBundle() from build.ts.
import { register } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/ping') { res.writeHead(200).end('{"ok":true}'); return; }
  const file = path.join(ROOT, path.normalize(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(4321, '127.0.0.1', () => console.log('fixtures on http://127.0.0.1:4321/a-vanilla.html'));
