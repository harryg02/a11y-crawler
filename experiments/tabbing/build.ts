import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const REACT_ENTRY = path.join(__dirname, 'fixtures/react/app.jsx');
const REACT_OUT   = path.join(__dirname, 'fixtures/react/app.js');

/**
 * Builds the React fixture bundle if it is missing or stale.
 *
 * The bundle is a build artifact (600 KB of vendor code) and is not committed, so
 * every entry point into the experiment has to be able to produce it — otherwise a
 * fresh clone silently runs the React probes against an empty page and scores three
 * violations as false negatives.
 */
export async function ensureReactBundle(): Promise<void> {
  const src = fs.statSync(REACT_ENTRY).mtimeMs;
  const out = fs.existsSync(REACT_OUT) ? fs.statSync(REACT_OUT).mtimeMs : -1;
  if (out >= src) return;

  await build({
    entryPoints: [REACT_ENTRY],
    outfile: REACT_OUT,
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  });
}
