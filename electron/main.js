const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

// ─────────────────────────────────────────────────────────────────────────────
// A11y Crawler — Electron main process
//
// Two run modes:
//   • Dev (not packaged): `next dev` is started separately by the npm script and
//     this process only opens a window pointing at the dev server. The Next
//     server, running as its own Node process, uses scanManager's built-in
//     fallbacks (project dir for data, .crawler-build for the crawler bundle).
//   • Packaged: this process starts the standalone Next server itself (as
//     Electron-run-as-node) and wires every writable path to userData, so the
//     read-only app bundle is never written to.
// ─────────────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3000;
// Use 127.0.0.1 (not localhost) so we don't hit ::1 while the standalone server
// listens on IPv4 only.
const APP_URL = process.env.A11Y_DEV_SERVER_URL || `http://127.0.0.1:${PORT}`;

// In dev, __dirname is <project>/electron, so the project root is one level up.
// In a packaged app, the whole project is copied under resources/app(.asar).
const APP_ROOT = path.join(__dirname, '..');

let nextProc = null;
let mainWindow = null;

// The folder to keep app data beside for a "green"/portable build. This is the
// folder the user unzipped, which differs by packaging format:
//   • Linux AppImage: execPath points into a temp mount, so use the real
//     .AppImage location from the APPIMAGE env var.
//   • macOS .app: execPath is inside the bundle; put data beside the .app.
//   • Windows/Linux unpacked (zip/dir): next to the executable.
function portableBaseDir() {
  if (process.env.APPIMAGE) return path.dirname(process.env.APPIMAGE);
  if (process.platform === 'darwin') {
    const appBundle = path.resolve(path.dirname(process.execPath), '..', '..'); // -> *.app
    return path.dirname(appBundle); // folder containing the .app
  }
  return path.dirname(process.execPath);
}

function isWritable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.wtest-${process.pid}`);
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

// Resolve the writable data dir:
//   1. An explicit A11Y_DATA_DIR always wins.
//   2. Packaged + the app's own folder is writable (a green/portable unzip) ->
//      keep data (DB, reports, downloaded Chromium) beside the binary so the
//      whole thing is self-contained and leaves nothing behind.
//   3. Otherwise (installed to Program Files, read-only mount, dev) -> the
//      per-user data dir.
function dataDir() {
  if (process.env.A11Y_DATA_DIR) return process.env.A11Y_DATA_DIR;
  if (app.isPackaged) {
    const portable = path.join(portableBaseDir(), 'a11y-crawler-data');
    if (isWritable(portable)) return portable;
  }
  return app.getPath('userData');
}

/** Start the packaged standalone Next server as a child (Electron-as-node). */
function startNextServer() {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PORT),
    // Pin the bind host: the Next standalone server otherwise honours the
    // machine's HOSTNAME env and may bind to a name the window can't reach.
    HOSTNAME: '127.0.0.1',
    ELECTRON_RUN_AS_NODE: '1',
    // Writable state → userData
    A11Y_DATA_DIR: dataDir(),
    // The crawler subprocess: which binary runs it, and where the bundle lives.
    A11Y_NODE_BIN: process.execPath,
  };

  if (app.isPackaged) {
    // Crawler bundle and the Chromium browser both ship inside resources. In a
    // forced-dev server run these are unset so scanManager falls back to the
    // project's .crawler-build bundle and the default ms-playwright cache.
    env.A11Y_CRAWLER_SCRIPT = path.join(process.resourcesPath, 'crawler', 'crawler.cjs');
    env.PLAYWRIGHT_BROWSERS_PATH = path.join(process.resourcesPath, 'ms-playwright');
  }

  // The standalone server is spawned as a real child process, so it must live
  // on the real filesystem — not inside app.asar (an archive file the OS can't
  // chdir into or exec from, which raised ENOTDIR). Packaged, it ships as an
  // extraResource at resources/standalone; in a forced-dev run it's still in the
  // project's .next/standalone.
  const standaloneDir = app.isPackaged
    ? path.join(process.resourcesPath, 'standalone')
    : path.join(APP_ROOT, '.next', 'standalone');
  const serverJs = path.join(standaloneDir, 'server.js');
  nextProc = spawn(process.execPath, [serverJs], {
    cwd: standaloneDir,
    env,
    stdio: 'inherit',
  });
  nextProc.on('exit', (code) => {
    console.log(`[next] server exited with code ${code}`);
    if (!app.isQuitting) app.quit();
  });
}

/** Resolve once the HTTP server answers, or reject after `timeoutMs`. */
function waitForServer(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.destroy();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error(`Timed out waiting for ${url}`));
        else setTimeout(tick, 400);
      });
    };
    tick();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    backgroundColor: '#0a0a0a',
    // Hide the default File/Edit/View/Help bar without removing the menu.
    // Menu.setApplicationMenu(null) would also delete it, but the default menu
    // is where Electron's zoom (Ctrl +/-/0), copy/paste and reload accelerators
    // live — dropping those in an accessibility tool of all things would break
    // WCAG 1.4.4 for its own UI. Hidden, they still work, and Alt reveals the
    // bar. No effect on macOS, where the menu lives in the system bar.
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open target=_blank / external links in the user's real browser, not a
  // frameless Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  try {
    await waitForServer(APP_URL);
  } catch (err) {
    console.error(err);
  }
  await mainWindow.loadURL(APP_URL);
  mainWindow.show();

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Start our own Next server when packaged, or when A11Y_FORCE_SERVER=1 is set
// (lets you exercise the packaged server path against a dev build).
const shouldStartServer = () => app.isPackaged || process.env.A11Y_FORCE_SERVER === '1';

app.whenReady().then(async () => {
  if (shouldStartServer()) {
    startNextServer();
  }
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (nextProc) {
    try { nextProc.kill(); } catch {}
  }
});
