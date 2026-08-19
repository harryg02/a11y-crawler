const { app, BrowserWindow, shell, powerMonitor, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { spawn, execFileSync } = require('child_process');

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

// Resolved at startup, not fixed at 3000. A hardcoded port meant anything else
// already holding it — an orphaned server from a force-quit, or a `next dev`
// running for development — silently wedged the app: our own server died with
// EADDRINUSE while waitForServer politely polled the squatter, timed out, and
// left a window that never appeared. Whoever else is on 3000 is now irrelevant,
// because we never ask for 3000.
let serverPort = null;
// Use 127.0.0.1 (not localhost) so we don't hit ::1 while the standalone server
// listens on IPv4 only.
// The URL the window loads. Set by resolveAppUrl() before the window is created.
let appUrl = null;

/**
 * Decide where the UI lives, and on which port our own server should listen.
 *
 * Three cases:
 *   • An explicit A11Y_DEV_SERVER_URL always wins.
 *   • We start the server ourselves (packaged, or A11Y_FORCE_SERVER=1) → take a
 *     free ephemeral port from the OS so nothing can be in the way.
 *   • Plain dev, attaching to a separately-run `next dev` → its conventional
 *     port, which is 3000 unless PORT says otherwise.
 */
async function resolveAppUrl(startsOwnServer) {
  if (process.env.A11Y_DEV_SERVER_URL) {
    appUrl = process.env.A11Y_DEV_SERVER_URL;
    return;
  }
  serverPort = startsOwnServer
    ? await findFreePort()
    : Number(process.env.PORT) || 3000;
  appUrl = `http://127.0.0.1:${serverPort}`;
}

/**
 * Ask the OS for an unused port by binding port 0 and reading what we got.
 *
 * There is a small window between closing this probe and the server binding, in
 * which something else could take the port. That is unavoidable without handing
 * the listening socket to the child, and is vastly narrower than the previous
 * behaviour of always demanding one specific port.
 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// In dev, __dirname is <project>/electron, so the project root is one level up.
// In a packaged app, the whole project is copied under resources/app(.asar).
const APP_ROOT = path.join(__dirname, '..');

let nextProc = null;
let mainWindow = null;
// Startup diagnostics. A packaged .app launched from Finder has no stdout, so
// without these a failed start is completely silent — which is exactly what
// made "bounces in the dock, no window" impossible to diagnose from a report.
let windowShown = false;
let serverFailure = null;
const serverLogTail = [];
const SERVER_LOG_TAIL_MAX = 40;

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

/** Where we note the server child's identity, for cross-launch cleanup. */
function serverRecordPath() {
  return path.join(dataDir(), 'server.json');
}

function writeServerRecord(record) {
  try {
    fs.writeFileSync(serverRecordPath(), JSON.stringify(record));
  } catch (err) {
    console.error(`[next] could not record server pid: ${err.message}`);
  }
}

function clearServerRecord() {
  try {
    fs.rmSync(serverRecordPath(), { force: true });
  } catch { /* nothing useful to do */ }
}

/**
 * Confirm a pid is still the server we started, by comparing the live command
 * line against the one we recorded.
 *
 * Liveness alone is not enough to justify sending a signal: pids get recycled,
 * so `process.kill(pid, 0)` succeeding may mean some unrelated program now holds
 * that number. Requiring an exact command match means the worst case is that we
 * decline to reap and leak a server, rather than killing someone else's process.
 */
function isRecordedServerAlive(record) {
  if (!record || !record.pid || !record.cmd) return false;
  try {
    process.kill(record.pid, 0);
  } catch {
    return false; // gone already
  }
  if (process.platform === 'win32') return false; // no cheap way to verify; never signal
  try {
    const live = execFileSync('ps', ['-p', String(record.pid), '-o', 'command='], {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    return live === record.cmd.trim();
  } catch {
    return false;
  }
}

/**
 * Kill a server left behind by a previous run.
 *
 * A force-quit (SIGKILL) skips before-quit entirely, so the child survives,
 * reparented and still listening. With an ephemeral port that no longer wedges
 * the next launch, but a leaked server still holds the database and burns
 * memory, so clean it up when we can prove it is ours.
 */
function reapOrphanedServer() {
  let record = null;
  try {
    record = JSON.parse(fs.readFileSync(serverRecordPath(), 'utf-8'));
  } catch {
    return; // no record, or unreadable — nothing to do
  }
  if (!isRecordedServerAlive(record)) {
    clearServerRecord();
    return;
  }
  console.log(`[next] reaping orphaned server from a previous run (pid ${record.pid}, port ${record.port})`);
  try {
    process.kill(record.pid, 'SIGTERM');
  } catch (err) {
    console.error(`[next] could not signal orphan: ${err.message}`);
  }
  clearServerRecord();
}

/**
 * Shut the server down, escalating if it ignores the polite request.
 *
 * kill() alone sends SIGTERM and returns immediately, so a wedged server would
 * outlive the app that spawned it — the orphan case again, just self-inflicted.
 */
function stopNextServer() {
  if (!nextProc) return;
  const proc = nextProc;
  nextProc = null;
  try { proc.kill('SIGTERM'); } catch { /* already gone */ }
  const force = setTimeout(() => {
    try { proc.kill('SIGKILL'); } catch { /* already gone */ }
  }, 2000);
  force.unref();
  proc.once('exit', () => clearTimeout(force));
  clearServerRecord();
}

/** Start the packaged standalone Next server as a child (Electron-as-node). */
function startNextServer() {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(serverPort),
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
  // 'inherit' sends the server's output to this process's stdout — which is
  // /dev/null when the .app is launched from Finder. Every reason the server
  // might fail to start was being written there. Pipe it instead, so it reaches
  // both a terminal (when run from one) and a log file the user can send us.
  const logPath = path.join(dataDir(), 'server.log');
  let logStream = null;
  try {
    logStream = fs.createWriteStream(logPath, { flags: 'a' });
    logStream.write(`\n=== ${new Date().toISOString()} — starting ${serverJs} ===\n`);
  } catch (err) {
    console.error(`[next] could not open ${logPath}: ${err.message}`);
  }

  nextProc = spawn(process.execPath, [serverJs], {
    cwd: standaloneDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const tee = (stream, label) => {
    if (!stream) return;
    stream.setEncoding('utf8');
    stream.on('data', (text) => {
      process.stdout.write(text);
      if (logStream) logStream.write(text);
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        serverLogTail.push(`[${label}] ${line}`);
        if (serverLogTail.length > SERVER_LOG_TAIL_MAX) serverLogTail.shift();
      }
    });
  };
  tee(nextProc.stdout, 'out');
  tee(nextProc.stderr, 'err');

  // Leave a note about this process so the *next* launch can clean it up if we
  // never get the chance to. The command line is stored alongside the pid so the
  // reaper can prove identity before signalling anything — pids are recycled,
  // and killing a stranger would be far worse than leaking a server.
  writeServerRecord({ pid: nextProc.pid, port: serverPort, cmd: `${process.execPath} ${serverJs}` });

  // A ChildProcess 'error' with no listener is an unhandled 'error' event, which
  // throws. This fires when the binary can't be executed at all — a path that
  // doesn't exist, a permission or code-signing refusal — i.e. precisely the
  // cases worth reporting clearly.
  nextProc.on('error', (err) => {
    serverFailure = `could not start the server process: ${err.message}`;
    console.error(`[next] ${serverFailure}`);
  });

  nextProc.on('exit', (code, signal) => {
    const detail = `server exited early (code ${code}${signal ? `, signal ${signal}` : ''})`;
    console.log(`[next] ${detail}`);
    if (!serverFailure) serverFailure = detail;
    clearServerRecord();
    // Only tear the app down if it had actually finished starting. Quitting
    // during startup makes the app disappear from the dock without ever saying
    // why; the diagnostic window below is far more useful.
    if (!app.isQuitting && windowShown) app.quit();
  });
}

/** Escape text for safe interpolation into the diagnostic page. */
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * Render why the app could not start, in the window itself.
 *
 * The window is created with show:false and was only ever shown after loadURL
 * resolved, so any startup failure left it hidden forever: the process stayed
 * alive, the dock icon sat there, and nothing else happened. A hang with no
 * message is the worst possible failure mode for a desktop app — it is
 * indistinguishable from an OS problem, which is what it got mistaken for.
 */
async function showStartupFailure(err) {
  const reason = serverFailure || (err && err.message) || 'unknown error';
  const logPath = path.join(dataDir(), 'server.log');
  const html = `<!doctype html><meta charset="utf-8">
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.6 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif;
         margin: 0; padding: 40px; background: #fff; color: #111; }
  @media (prefers-color-scheme: dark) { body { background: #0a0a0a; color: #eee; } }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { max-width: 70ch; }
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  pre { background: rgba(127,127,127,.14); padding: 12px; border-radius: 6px;
        overflow: auto; max-height: 320px; white-space: pre-wrap; }
</style>
<h1>A11y Crawler couldn't start</h1>
<p>The app's local server did not come up, so there is nothing to display.</p>
<p><strong>Reason:</strong> <code>${escapeHtml(reason)}</code></p>
<p>The full server output is at:<br><code>${escapeHtml(logPath)}</code></p>
${serverLogTail.length ? `<p><strong>Last output:</strong></p><pre>${escapeHtml(serverLogTail.join('\n'))}</pre>` : '<p>The server produced no output at all before failing.</p>'}
<p>Please include the log file when reporting this.</p>`;

  console.error(`[startup] ${reason}`);
  try {
    await mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  } catch (loadErr) {
    console.error(`[startup] could not render the diagnostic page: ${loadErr.message}`);
  }
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
    const req = http.get(`${appUrl}/api/scan/status`, (res) => {
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
      `${appUrl}/api/scan/${action}`,
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

  // Whatever happens, the window gets shown. Previously a waitForServer timeout
  // was caught and *ignored*, then loadURL was awaited anyway — so the real
  // reason was discarded, loadURL rejected, createWindow threw, and the
  // unhandled rejection meant show() was never reached.
  try {
    await waitForServer(appUrl);
    await mainWindow.loadURL(appUrl);
  } catch (err) {
    await showStartupFailure(err);
  }
  mainWindow.show();
  windowShown = true;

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Start our own Next server when packaged, or when A11Y_FORCE_SERVER=1 is set
// (lets you exercise the packaged server path against a dev build).
const shouldStartServer = () => app.isPackaged || process.env.A11Y_FORCE_SERVER === '1';

app.whenReady().then(async () => {
  const startsOwnServer = shouldStartServer();
  // Order matters: pick the port before anything reads appUrl, and clear a
  // previous run's leftovers before adding one of our own.
  await resolveAppUrl(startsOwnServer);
  if (startsOwnServer) {
    reapOrphanedServer();
    startNextServer();
    console.log(`[next] serving on ${appUrl}`);
  }
  await createWindow();
  startPowerManagement();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => {
  // Without this an unhandled rejection here just stops startup silently.
  console.error('[startup] fatal:', err);
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
  stopNextServer();
});

// Last resort. 'exit' is synchronous, so only the signal itself can be sent from
// here — but it covers paths that skip before-quit, such as a fatal error in the
// main process.
process.on('exit', () => {
  if (nextProc) {
    try { nextProc.kill('SIGKILL'); } catch { /* already gone */ }
  }
});
