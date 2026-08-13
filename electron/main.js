const { app, BrowserWindow, shell, powerMonitor, powerSaveBlocker } = require('electron');
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

// ─────────────────────────────────────────────────────────────────────────────
// Power management
//
// A crawl is a long-running job in a *child of a child* (this process → the
// Next server → the crawler → Chromium), so nothing about it is visible to the
// OS as user activity. Left alone, an idle laptop suspends mid-scan.
//
// The main process has no direct handle on scan state — scans are owned by the
// Next server — so it polls the same status endpoint the UI uses.
// ─────────────────────────────────────────────────────────────────────────────

const SCAN_POLL_MS = 10_000;

let scanState = { running: false, status: 'idle' };
let powerBlockerId = null;
let scanPollTimer = null;

/** GET /api/scan/status, resolving null on any failure (server not up yet). */
function fetchScanStatus() {
  return new Promise((resolve) => {
    const req = http.get(`${APP_URL}/api/scan/status`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(2000, () => { req.destroy(); resolve(null); });
  });
}

// Hold the system awake only while a scan is actually running AND we're on
// mains power. On battery, a long crawl that pins the machine awake is a good
// way to return to a flat laptop, so there we let it sleep and rely on the
// suspend/resume handling below to park the crawl cleanly instead.
//
// 'prevent-app-suspension' keeps the system from idle-sleeping but still lets
// the display switch off — we need the process scheduled, not the screen lit.
// Note this only defers *idle* sleep: closing the lid or choosing Sleep still
// suspends, which is exactly why suspend/resume is handled separately.
function syncPowerSaveBlocker() {
  const onBattery = powerMonitor.isOnBatteryPower();
  const shouldBlock = scanState.running && !onBattery;

  if (shouldBlock && powerBlockerId === null) {
    powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    console.log('[power] scan running on AC — holding off idle sleep');
  } else if (!shouldBlock && powerBlockerId !== null) {
    powerSaveBlocker.stop(powerBlockerId);
    powerBlockerId = null;
    console.log(`[power] released idle-sleep hold (running=${scanState.running}, battery=${onBattery})`);
  }
}

function startPowerManagement() {
  registerPowerEvents();

  scanPollTimer = setInterval(async () => {
    const status = await fetchScanStatus();
    if (status) scanState = status;
    syncPowerSaveBlocker();
  }, SCAN_POLL_MS);

  // React immediately where the events exist (macOS/Windows only); elsewhere
  // the poll above picks up a power-source change within one interval, which is
  // why isOnBatteryPower() is re-read there rather than cached here.
  powerMonitor.on('on-ac', syncPowerSaveBlocker);
  powerMonitor.on('on-battery', syncPowerSaveBlocker);
}

/** POST a scan control endpoint. Resolves true on 2xx, false on anything else. */
function postScanControl(action) {
  return new Promise((resolve) => {
    const req = http.request(
      `${APP_URL}/api/scan/${action}`,
      { method: 'POST' },
      (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      },
    );
    req.on('error', () => resolve(false));
    req.setTimeout(4000, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// The crawler polls these two files between pages (lib/crawler/checkpoint.ts),
// which is what lets us park or end a crawl from outside the Next server.
const pauseFile = () => path.join(dataDir(), '.pause');
const stopFile = () => path.join(dataDir(), '.stop');

// Set only when *we* paused the scan because the machine suspended. A scan the
// user paused by hand must stay paused through a sleep/wake cycle, so resume
// is gated on this rather than on "is it paused".
let pausedBySystem = false;

function registerPowerEvents() {
  powerMonitor.on('suspend', () => {
    if (!scanState.running) return;
    // Already paused — by the user, since we would have set the flag otherwise.
    // Checking the file rather than scanState avoids acting on a poll result up
    // to SCAN_POLL_MS stale, which could otherwise auto-resume a hand-paused
    // scan that was paused moments before the lid closed.
    try { if (fs.existsSync(pauseFile())) return; } catch { return; }

    pausedBySystem = true;
    // Write the signal synchronously: the system may suspend before an HTTP
    // round trip completes, but a sync write has already landed by the time
    // this handler returns. The POST is what updates the DB status and the UI,
    // and is allowed to lose the race — the crawler only reads the file.
    try {
      fs.writeFileSync(pauseFile(), '');
      console.log('[power] suspending — crawl parked between pages');
    } catch (err) {
      console.warn(`[power] could not write pause signal: ${err.message}`);
      pausedBySystem = false;
      return;
    }
    postScanControl('pause');
  });

  powerMonitor.on('resume', async () => {
    if (!pausedBySystem) return;
    pausedBySystem = false;

    // The Next server may still be settling right after wake, so retry rather
    // than stranding a scan we parked ourselves.
    for (let attempt = 1; attempt <= 5; attempt++) {
      if (await postScanControl('resume')) {
        console.log('[power] resumed after wake');
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Last resort: clear the signal directly so the crawl continues even if the
    // server never answered. The DB status stays 'paused' and the UI will look
    // wrong, which is strictly better than a crawl parked forever.
    try {
      fs.unlinkSync(pauseFile());
      console.warn('[power] resume endpoint unreachable — cleared pause signal directly');
    } catch { /* already gone */ }
  });

  // Shutdown/restart: end the crawl cleanly so the pages gathered so far are
  // still written to a report, rather than having Chromium and the crawler
  // killed mid-page and the run lost.
  //
  // preventDefault asks the OS to wait, so this is bounded hard: the crawler
  // only checks .stop *between* pages, and a page with many interactions can
  // outlast the grace period. If it does we quit anyway — a delayed shutdown is
  // a worse failure than a lost partial report.
  const SHUTDOWN_GRACE_MS = 20_000;

  const endScanAndQuit = async (event) => {
    if (!scanState.running) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();

    try { fs.writeFileSync(stopFile(), ''); } catch { /* best effort */ }
    postScanControl('stop');
    console.log('[power] system shutting down — stopping scan and writing report');

    const deadline = Date.now() + SHUTDOWN_GRACE_MS;
    while (Date.now() < deadline) {
      const status = await fetchScanStatus();
      if (!status || !status.running) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    app.quit();
  };

  // 'shutdown' is macOS/Linux; Windows signals the same thing as 'session-end',
  // which cannot be deferred, so there it is purely best effort.
  powerMonitor.on('shutdown', endScanAndQuit);
  app.on('session-end', () => endScanAndQuit(null));
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
    // Window + taskbar icon. Packaged builds get their executable icon from
    // electron-builder's build.icon, but that never reaches the *window*, and on
    // Linux nothing sets it at all — so this is what stops `electron:dev` and
    // the Linux window from falling back to the stock Electron diamond. Lives
    // in electron/ (not build/, which is gitignored and so never reaches CI)
    // and is therefore inside the packaged app, reachable via __dirname.
    icon: path.join(__dirname, 'icon.png'),
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
  startPowerManagement();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (scanPollTimer) clearInterval(scanPollTimer);
  if (powerBlockerId !== null) {
    powerSaveBlocker.stop(powerBlockerId);
    powerBlockerId = null;
  }
  if (nextProc) {
    try { nextProc.kill(); } catch {}
  }
});
