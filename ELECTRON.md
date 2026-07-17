# Packaging A11y Crawler as an Electron desktop app

This document explains how the app is wired for Electron, how to run it, and what
remains to produce signed installers.

## Architecture

The app is a Next.js server + React UI. A scan spawns a **standalone crawler**
subprocess ([lib/crawler/run.ts](lib/crawler/run.ts)) that drives Playwright's
Chromium and writes a JSON report. Electron wraps this by:

1. Running the Next.js server (dev server in development, the `standalone` build
   when packaged).
2. Opening a `BrowserWindow` pointed at that server.
3. Letting the existing `/api` routes and the crawler subprocess work unchanged.

### Key change from the web version

Previously the crawler ran via `playwright test tests/crawler.spec.ts` (the
Playwright **test runner**). That can't be packaged (it transpiles TS at runtime
and needs `node_modules/.bin/playwright`). It's now a plain script bundled to a
single file with esbuild and spawned with Node:

```
lib/crawler/run.ts  ──esbuild──▶  .crawler-build/crawler.cjs  ──spawn──▶ Chromium
```

The shared crawl logic lives in [lib/crawler/driver.ts](lib/crawler/driver.ts) and
is still exercised by the Playwright test ([tests/crawler.spec.ts](tests/crawler.spec.ts)).

### Writable paths

All mutable state (SQLite DB, `reports/`, `.pause`/`.stop`/`.login-complete`
signal files) is resolved through [lib/paths.ts](lib/paths.ts), which reads
`A11Y_DATA_DIR`. Electron ([electron/main.js](electron/main.js) `dataDir()`) sets
that variable so the read-only app bundle is never written to. Without it (plain
`next dev`/`start`) it falls back to the project directory.

Where `dataDir()` points, in order:

1. An explicit `A11Y_DATA_DIR` if set.
2. **Portable / green build:** a packaged app whose own folder is writable (i.e.
   an unzipped `zip`/`tar.gz`/AppImage) keeps data in `a11y-crawler-data` **beside
   the binary** — DB, reports, and the downloaded Chromium all travel with the app
   folder and nothing is left on the machine. Resolved per format: next to the
   `.exe`, beside the `.app`, or beside the `.AppImage` (via `$APPIMAGE`).
3. Otherwise (installed into Program Files, a read-only mount, or dev): the
   per-user dir, `app.getPath('userData')`.

### Environment variables Electron sets (packaged mode)

| Var | Purpose |
|-----|---------|
| `A11Y_DATA_DIR` | Writable data dir (beside the binary if portable, else userData) |
| `A11Y_CRAWLER_SCRIPT` | Path to the bundled `crawler.cjs` in resources |
| `A11Y_NODE_BIN` | Binary used to spawn the crawler (the Electron exe, run as node) |
| `PLAYWRIGHT_BROWSERS_PATH` | Where Chromium is installed (`<dataDir>/ms-playwright`) |
| `ELECTRON_RUN_AS_NODE` | Makes the Electron binary behave as plain Node |

## Running

### Development (window + live-reload Next server)

```bash
npm run electron:dev
```

Runs `next dev` and Electron together. The Next server runs as its own Node
process using the project dir for data.

### Production-style build

```bash
npm run electron:build   # next build (standalone) + prepare + bundle crawler
npm run dist             # ^ then electron-builder → installers in dist/
```

## Remaining manual steps for distributable installers

These are the parts that must run on a real build machine (not verifiable in a
headless CI sandbox):

1. **Native module rebuild (the one confirmed gotcha).** `better-sqlite3` is a
   native addon compiled against a specific Node ABI. When the packaged app runs
   the Next server under Electron-as-node, the module must match *Electron's* ABI,
   not the system Node's. Verified failure without the rebuild:

   ```
   Error: better_sqlite3.node was compiled against a different Node.js version
   using NODE_MODULE_VERSION 147 (system Node 26). This version requires
   NODE_MODULE_VERSION 130 (Electron 33 / Node 20). — ERR_DLOPEN_FAILED
   ```

   `electron-builder` fixes this automatically during `npm run dist`
   (`npmRebuild: true`, via its bundled `@electron/rebuild`). If you rebuild
   manually, note that the standalone `electron-rebuild` **CLI** currently fails
   on Node 26 (a yargs ESM-interop bug); use `npm run dist` (electron-builder
   calls the rebuild programmatically) or invoke `node-gyp rebuild
   --target=<electronVersion> --dist-url=https://electronjs.org/headers`.
   Rebuilding for Electron makes the module unusable by plain `next dev` (Node 26)
   and vice-versa — this only matters for the packaged artifact, which is why the
   build does it on a copy.

2. **Chromium for the crawler.** The installer stays small by downloading Chromium
   on first launch (see `ensureBrowsersInstalled` in
   [electron/main.js](electron/main.js)) into `userData/ms-playwright`. To ship it
   inside the installer instead, add the `ms-playwright` cache to `extraResources`
   and point `PLAYWRIGHT_BROWSERS_PATH` at it (adds ~150 MB per platform).

3. **Crawler's Playwright dependency.** The crawler bundle keeps `playwright` /
   `playwright-core` external, so `extraResources` copies them next to
   `crawler.cjs` (`resources/crawler/node_modules/...`). Verify the crawler
   resolves them at runtime in the packaged app.

4. **Code signing / notarization.** Configure `mac`/`win` signing certs in the
   `build` block for distribution outside your own machine.
