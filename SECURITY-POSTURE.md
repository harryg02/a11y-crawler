# A11y Crawler — Security Posture Audit

**Audit date:** 2026-07-29
**Repository:** `a11y-crawler` @ branch `electron`, HEAD `f859b3f`
**Public remote:** `https://github.com/harryg02/a11y-crawler.git`
**Scope:** static read of the working tree, read-only queries against the on-disk
`database.sqlite` and `reports/`, `npm audit`, and `git log` across all branches.
**Method note:** no code was modified and no server was started. Every claim below
cites `file:line` or a named read-only command. Where a conclusion depends on
runtime behaviour I could not observe, it is marked **UNVERIFIED** rather than
inferred.

---

## Claims

### 1. Session cookies exist only as an in-memory variable and are discarded after each run


| Evidence | Finding |
|---|---|
| [lib/crawler/driver.ts:25](lib/crawler/driver.ts#L25) | `let storageState: { cookies: any[]; origins: any[] } \| undefined` — a plain local variable in function scope. |
| [lib/crawler/driver.ts:61](lib/crawler/driver.ts#L61) | `storageState = await headedCtx.storageState();` — called **with no `path` argument**. Per Playwright's API this returns the state as an in-memory object and writes nothing. |
| [lib/crawler/driver.ts:67](lib/crawler/driver.ts#L67) | `browser.newContext(storageState ? { storageState } : {})` — the object is handed straight to the second context. |
| [lib/crawler/run.ts:37-42](lib/crawler/run.ts#L37-L42) | The crawler is a **separate short-lived process** that calls `process.exit(0)`/`process.exit(1)` when the run ends. The variable dies with the process. |
| Grep across all `.ts/.tsx/.js/.mjs/.cjs` (excluding `node_modules`, `.next`) | Only **three** occurrences of `storageState` exist, all three listed above. There is no `storageState({ path: ... })` anywhere. |
| [.crawler-build/crawler.cjs:34074,34098,34102](.crawler-build/crawler.cjs) | The bundled crawler actually shipped/executed contains the same three occurrences and no path variant — the build matches the source. |
| Read-only query of `database.sqlite` (`scan_logs`, 14,762 rows) | Zero rows matching `jsessionid`, `bearer `, `eyJ`, `session_id`, `sessionid`, `access_token`, `id_token`. The only `cookie` matches are the hostname `youtube-nocookie.com`. |
| Grep of all 20 files in `reports/` | Zero matches for cookie/JWT/bearer/session-token patterns. |

**Caveat to disclose:** the *in-memory JS object* is clean, but during the run the
live session also exists inside the Chromium process, in the temporary profile
directory Playwright creates for `browser.launch()`. Nothing in this repo controls
that directory's lifetime — it is managed by Playwright. I cannot verify its
deletion by static reading (**UNVERIFIED**). Empirically, on this machine, no
browser profile remnants survive: a sweep of `/tmp` and `/var/tmp` found no
`Cookies` SQLite file, no `Local Storage`, and no `--user-data-dir` profile
directory. The only leftovers are two Chromium shared-memory backing *files*,
`/tmp/.org.chromium.Chromium.kJBh1R` (64 KB) and `.WScfnD` (0 bytes), both mode
`0600`; `strings` recovers no URLs, cookies, or session material from either.

### 2. Nothing from the Playwright browser persists between scans


- No `launchPersistentContext` and no `userDataDir` anywhere in the repo (grep across all source extensions, excluding `node_modules`/`.next`). Both browsers are started with `pw.chromium.launch(...)` — [lib/crawler/driver.ts:29](lib/crawler/driver.ts#L29) and [lib/crawler/driver.ts:66](lib/crawler/driver.ts#L66) — which uses a throwaway profile, and both are closed at [driver.ts:62](lib/crawler/driver.ts#L62) and [driver.ts:80](lib/crawler/driver.ts#L80).
- Each scan is a fresh OS process ([lib/scanManager.ts:80-84](lib/scanManager.ts#L80-L84) `spawn(nodeBin, [crawlerScript], …)`), so no in-process state carries over either.

**But be precise about the wording**: *scan results* absolutely persist between
scans, forever, and they contain page content. See §2. If you said "nothing
persists" without qualification, IA will read that as covering the reports too,
and that reading is false.

### 3. Files saved on disk

**PARTIALLY CORRECT.** Scan results and logs are the two largest artifacts, but
five further categories of write exist, and three of them land outside the project
directory. The complete set of files the tool writes:

| Written | Evidence |
|---|---|
| **Scan results: `reports/report-scan-<timestamp>.json`** (one per completed scan; 20 present, 778 B – 489 KB) | Written by [lib/crawler/reporter.ts:35](lib/crawler/reporter.ts#L35) `fs.writeFileSync(jsonPath, JSON.stringify(scan, null, 2))`; path from [lib/paths.ts:32-34](lib/paths.ts#L32-L34) → `reports/` under the data dir. Per violation node: `html`, `selector`, `failureSummary` ([lib/crawler/scanner.ts:58-62](lib/crawler/scanner.ts#L58-L62)); per page, the URL with the clicked control's label appended ([lib/crawler/scanner.ts:290](lib/crawler/scanner.ts#L290)). **Contains real page content and PII** — three files hold `harrygu@umich.edu`; see §2. No retention logic; nothing prunes this directory. Now `0600` in a `0700` dir (was `0644`). |
| **Logs + scan state: `database.sqlite`** (2.3 MB), plus `-wal` / `-shm` sidecars from WAL mode ([lib/db.ts:12](lib/db.ts#L12)) | Opened at [lib/db.ts:9](lib/db.ts#L9), path from [lib/paths.ts:22-24](lib/paths.ts#L22-L24). Two tables ([lib/db.ts:15-32](lib/db.ts#L15-L32)): `active_scan(id, config, status, pid, created_at)` — `config` holds the full target URL, boundary and denylist — and `scan_logs(id, scan_id, message, type, created_at)`, one row per crawler stdout/stderr line via [lib/scanManager.ts:29](lib/scanManager.ts#L29). 21 scans / 14,762 log rows present. **Contains page text and full URLs with opaque tokens**; see §8. Capped at 20 scans ([lib/scanManager.ts:39-46](lib/scanManager.ts#L39-L46)), count-based not age-based, no `VACUUM`. Mode `0600`. |
| Signal files `.pause` / `.stop` / `.login-complete` (gitignored, [.gitignore:13-15](.gitignore#L13-L15)) | [lib/paths.ts:36-38](lib/paths.ts#L36-L38); written at [lib/scanManager.ts:133](lib/scanManager.ts#L133), [lib/scanManager.ts:144](lib/scanManager.ts#L144), [app/api/scan/login-complete/route.ts:6](app/api/scan/login-complete/route.ts#L6). A stale `.stop` file is present in the working tree right now (mode `0644`). |
| **CSV exports into the user's Downloads folder** - outside the project dir | [lib/csvExport.ts:86-98](lib/csvExport.ts#L86-L98) builds a `Blob` and triggers a browser download named `a11y-report-<domain>-<date>.csv`. Contents are the same `node.html` snippets as the JSON report ([lib/csvExport.ts:62](lib/csvExport.ts#L62)). |
| `start-error.log` (npm + Playwright install stderr; append-only, never rotated) | [start.command:33,39](start.command#L33), [start.bat:42,55](start.bat#L42). **Was tracked in git** — now untracked (`git rm --cached`, staged) and ignored via [.gitignore:18-20](.gitignore#L18-L20); still 0 bytes on disk. See §7. |
| Chromium browser binaries into `~/.cache/ms-playwright` | [start.command:39](start.command#L39), [start.bat:55](start.bat#L55) run `npx playwright install chromium`. Confirmed present on this machine (`chromium-1217`, `firefox-1511`, `webkit-2272`, `ffmpeg-1011`). |
| Chromium temp files in `/tmp` | Browser-managed, described under Claim 1. |

Also worth stating plainly: **the "logs" are not benign.** They contain the
operator's own account identifier and third-party page titles. See §8.

### 4. The crawler skips destructive actions via a case-insensitive label denylist

**PARTIALLY CORRECT.** The mechanism exists and is genuinely case-insensitive, but
the default configuration is much weaker than the claim implies, and the evidence
on disk shows it did **not** prevent state-changing clicks.

- The matcher is real and case-insensitive on both sides: [lib/crawler/scanner.ts:169-175](lib/crawler/scanner.ts#L169-L175) — `label.includes(p.toLowerCase())` where `label = clickable.text.toLowerCase()`.
- **The six hardcoded defaults cannot match any button label.** [lib/crawler/config.ts:33-36](lib/crawler/config.ts#L33-L36) hardcodes `'/logout', '/delete', '/remove', '/signout', '/sign-out', '/log-out'` — all with a **leading slash**. These are URL path fragments. No button's accessible text contains `/delete`, so with the UI list cleared these six patterns protect URLs only and provide **zero** label protection.
- The words that actually protect labels come from the **UI form's default state**, not from the engine: [app/components/CrawlScanForm.tsx:43-46](app/components/CrawlScanForm.tsx#L43-L46) → `'Log out', 'Sign out', 'Delete', 'Remove', 'Grant', 'Access', 'Pay', 'Payment', 'Purchase', 'Buy', 'Checkout', 'Deactivate', 'Disable'`. These are React `useState` defaults in a user-editable tag field, appended to the engine list via `CRAWLER_BLOCKED` at [lib/scanManager.ts:64](lib/scanManager.ts#L64).
- **The API applies no defaults at all.** `POST /api/scan` passes the body through unchanged, and [lib/scanManager.ts:64](lib/scanManager.ts#L64) reads `config.forbiddenWords ?? []`. A request that omits `forbiddenWords` runs with label protection entirely absent.
- **Observed outcome across the 20 report files on disk**: 336 distinct clicked-state labels were recorded; 66 match a destructive or state-changing verb. Actual clicks include **"Archive community"**, **"Archive course"**, **"Create Community"**, **"Create course"**, **"Create assignment"**, **"Generate Key +"**, **"Invite members to this community"**, **"Invite as Community Facilitator"**, **"Send email"**, **"Submit"**, **"Save"**, **"Import"**, **"Assign grader to Lynn Sabieddine"**, and three **"Notify me when …"** notification toggles. In the log table: **934 click events vs. 187 denylist skips vs. 3 URL blocks.**


---

## 2. Data at Rest Inventory

The file use axe-core to scan every page and save them on disk.
Report files on disk can contain  a real name and a real `@umich.edu` address captured
from an authenticated session.

| # | Artifact | Location | Contents | Can contain sensitive page data? | Persists between runs? | Perms |
|---|---|---|---|---|---|---|
| 1 | `report-scan-<ts>.json` | `reports/` (project dir), or `<userData>/reports/` when packaged — [lib/paths.ts:26-34](lib/paths.ts#L26-L34) | Per violation node: `html`, `selector`, `failureSummary` ([lib/crawler/scanner.ts:58-62](lib/crawler/scanner.ts#L58-L62)); per page: URL **with the clicked control's label appended** ([lib/crawler/scanner.ts:290](lib/crawler/scanner.ts#L290)); scan `url`/`scope`/`date`/`durationSeconds` ([lib/crawler/reporter.ts:15-31](lib/crawler/reporter.ts#L15-L31)) | **YES — CONFIRMED** | **YES, indefinitely** | `0644` **world-readable** |
| 2 | `database.sqlite` (+ `-wal`, `-shm`) | project dir / `<userData>` — [lib/paths.ts:22-24](lib/paths.ts#L22-L24) | `active_scan(id, config, status, pid, created_at)` and `scan_logs(id, scan_id, message, type, created_at)` — [lib/db.ts:15-32](lib/db.ts#L15-L32). `config` includes the full target URL and boundary. | **YES — CONFIRMED** (operator email, page titles, third-party session ids) | YES, but capped at 20 scans | `0600` |
| 3 | CSV export | **user's Downloads folder — outside the project** | Same `node.html` / `selector` / `failureSummary` as (1) — [lib/csvExport.ts:56-65,86-98](lib/csvExport.ts#L56-L65) | **YES** | YES, until the user deletes it | OS download default |
| 4 | `.pause` / `.stop` / `.login-complete` | project dir / `<userData>` — [lib/paths.ts:36-38](lib/paths.ts#L36-L38) | Zero-byte; existence is the signal | No | `.pause`/`.stop` cleared at crawl start ([lib/crawler/index.ts:30-31](lib/crawler/index.ts#L30-L31)); a stale `.stop` is in the tree now | `0644` |
| 5 | `start-error.log` | project dir | npm / `playwright install` stderr | Unlikely (build tooling only) | YES, appended forever, never rotated | `0644`, **tracked in git** |
| 6 | Chromium temp files | `/tmp` | Shared-memory backing files; no recoverable strings | No (verified by `strings`) | Two orphans found, mode `0600` | `0600` |
| 7 | Chromium binaries | `~/.cache/ms-playwright` | Browser build | No | YES | `0755` |
| 8 | `playwright-report/`, `test-results/` | project dir | Playwright HTML report + one failure context (`error-context.md`, 4 KB) | Not in the current files — grep for `umich\|instructure\|yellowdig\|codegra\|peerceptiv\|@*.edu` returned **no matches** | YES | `0755` dir |

### How much HTML per violation: measured, not estimated

Measured across **all 20 report files, 4,073 violation nodes**:

- `html` field: min 4 chars, **median 204**, mean 161, p95 278, **max 300**
- `failureSummary`: median 86, max 485
- **519 of 4,073 nodes (12.7%) contain 15+ characters of visible page text**, not just markup.

The 300-character ceiling is axe-core's, not this tool's:
[node_modules/axe-core/axe.js:11113](node_modules/axe-core/axe.js#L11113) defaults
`maxLength = 300`, `attrLimit = 20`. The behaviour that matters is at
[axe.js:11122-11130](node_modules/axe-core/axe.js#L11122-L11130):

- outerHTML **≤ 300 chars → the element is stored verbatim, including all descendant text content**;
- outerHTML **> 300 chars → truncated to the opening tag with attributes**, closed with ` ...>`, attribute values clipped to 20 chars.

So it is not "only the failing element's tag." Small elements — exactly the ones
that fail label/contrast/ARIA rules — are captured **with their text**. There is
no full-page capture and no surrounding-context capture; the exposure is bounded
to the failing element's own subtree, up to 300 chars each.

### Confirmed sensitive content currently on disk

```
reports/report-scan-1781896345218.json   (app.codegra.de, authenticated)
  <dd data-cy="user-email-value" class="…">harrygu@umich.edu</dd>
  <span class="multiselect__placeholder">Harry Gu (harrygu)</span>
  page URL: …/courses/8330/assignments/92733#general (clicked "Assign grader to Lynn Sabieddine")
```

Three report files contain `harrygu@umich.edu`
(`…1781634264119`, `…1781896345218`, `…1782338993460`), and ten contain the string
`umich.edu`. A **third party's name** ("Lynn Sabieddine") appears in a clicked-label
URL. All are mode `0644`.

Targets of the 20 stored reports include authenticated institutional systems:
`umich.instructure.com/courses/831157/external_tools/` (Canvas),
`yellowdig.app/n/lsa` (187 pages), `app.codegra.de` (36 pages),
`app.peerceptiv.com/course/dashboard` (46 pages),
`digital.wwnorton.com/psychlife3`, plus `accessibility.umich.edu` (~291 pages ×3)
and `forio.com/performer/michigan-ross/`.

### Retention / cleanup

**Your belief is correct for reports; there is partial cleanup for the DB.**

- **`reports/*.json`: no retention logic exists.** Nothing enumerates or prunes the directory. The only deletion path is a user-initiated `DELETE /api/history/<id>` ([app/api/history/[id]/route.ts:21-31](app/api/history/[id]/route.ts#L21-L31)). Twenty reports from 2026-06-16 onward are still present.
- **`database.sqlite`: capped at 20 scans.** [lib/scanManager.ts:39-46](lib/scanManager.ts#L39-L46) deletes all but the 20 newest `active_scan` rows on each new scan; `ON DELETE CASCADE` ([lib/db.ts:30](lib/db.ts#L30)) removes their logs. This is described in the code as bloat control, not as a data-retention control, and it is **count-based, not age-based** — 20 scans can be arbitrarily old. There is no cleanup on uninstall, and SQLite does not return freed pages to the OS, so deleted log text may remain recoverable in the file's free pages and in the 4 MB `-wal`.

### Nothing lands outside the project or userData dir, except…

`getDataDir()` ([lib/paths.ts:16-20](lib/paths.ts#L16-L20)) returns
`process.env.A11Y_DATA_DIR || process.cwd()`; the Electron main process sets it to
`app.getPath('userData')` or a portable dir beside the binary
([electron/main.js:66-73](electron/main.js#L66-L73)). Everything in rows 1, 2, 4
follows that. The exceptions are the **CSV download** (row 3, user's Downloads),
the **Chromium browser cache** (row 7), and the **Chromium temp files** (row 6).

---

## 3. Credential Handling - narrative trace

1. **Origin.** The user checks "This site requires login" and supplies a starting page ([app/components/CrawlScanForm.tsx:99-114](app/components/CrawlScanForm.tsx#L99-L114)). `POST /api/scan` receives it; [lib/scanManager.ts:56](lib/scanManager.ts#L56) derives `requiresLogin = Boolean(config.startingUrl)` and passes `CRAWLER_REQUIRES_LOGIN` to the crawler subprocess ([lib/scanManager.ts:67](lib/scanManager.ts#L67)).

2. **Interactive login.** A **headed** Chromium is launched ([lib/crawler/driver.ts:29-32](lib/crawler/driver.ts#L29-L32)) and navigated to the start URL. **The user types their credentials into a real browser window.** The application never sees, prompts for, transports, or stores a username or password — there is no credential input field anywhere in the UI and no password handling in any source file. This is the single strongest point in the tool's posture and worth leading with.

3. **Handoff signal.** The crawler blocks polling for the `.login-complete` file every 500 ms ([lib/crawler/driver.ts:47](lib/crawler/driver.ts#L47)); the UI's "I've logged in" button creates it via `POST /api/scan/login-complete` ([app/components/Scanning.tsx:136-139](app/components/Scanning.tsx#L136-L139) → [app/api/scan/login-complete/route.ts:6](app/api/scan/login-complete/route.ts#L6)). The crawler deletes it immediately ([driver.ts:48](lib/crawler/driver.ts#L48)) and also pre-emptively at [driver.ts:38-39](lib/crawler/driver.ts#L38-L39).

4. **Capture.** `storageState = await headedCtx.storageState()` ([lib/crawler/driver.ts:61](lib/crawler/driver.ts#L61)) — **no `path` argument, so no disk write**. Returns `{ cookies, origins }` where `origins` carries localStorage. The headed browser is then closed ([driver.ts:62](lib/crawler/driver.ts#L62)).

5. **Where it lives.** One function-scoped variable, [lib/crawler/driver.ts:25](lib/crawler/driver.ts#L25), inside the crawler subprocess only. It is never passed to `insertLog`, never serialized into a report, never sent over the SSE stream, and never crosses back into the Next.js process. The Next.js server process never holds session state at all.

6. **Reuse.** Injected into the crawl context at [lib/crawler/driver.ts:67](lib/crawler/driver.ts#L67). Chromium then holds the live session for the duration of the crawl.

7. **Destruction.** `await browser.close()` ([driver.ts:80](lib/crawler/driver.ts#L80)), then `process.exit(0)` ([lib/crawler/run.ts:38](lib/crawler/run.ts#L38)). Process memory and the throwaway browser profile go with it. A hard backstop timer `process.exit(1)` fires at `timeout + 3 min` ([run.ts:23-28](lib/crawler/run.ts#L23-L28)); on that path `browser.close()` never runs, so **profile cleanup depends entirely on Playwright's own exit handling** (**UNVERIFIED** statically; no remnants found empirically).

8. **Secondary exposure - post-login URL.** [lib/crawler/driver.ts:54-58](lib/crawler/driver.ts#L54-L58) reads `loginPage.url()` after login and logs it in full: `Post-login URL changed — starting crawl from current location: <url>`. That line goes to stdout → `scan_logs` → SSE. **If the target's auth flow returns a token in a query string or fragment, it is written to the database in cleartext.** No such token was found in the current DB, but see §8 for what *was*.

---

## 4. Local Attack Surface

### 4.1 API routes: no authentication anywhere

| Route | Method | Auth? | Origin/CSRF check? | Effect |
|---|---|---|---|---|
| `/api/scan` | POST | **None** | **None** | Starts a crawl against an attacker-chosen URL — [app/api/scan/route.ts:6-20](app/api/scan/route.ts#L6-L20) |
| `/api/scan/stream` | GET | **None** | **None** | Streams all logs of the active scan, historical + live — [app/api/scan/stream/route.ts:13-31](app/api/scan/stream/route.ts#L13-L31) |
| `/api/scan/status` | GET | **None** | **None** | Discloses scan state + id — [app/api/scan/status/route.ts:6-15](app/api/scan/status/route.ts#L6-L15) |
| `/api/scan/pause` | POST | **None** | **None** | Writes `.pause` — [app/api/scan/pause/route.ts:6-13](app/api/scan/pause/route.ts#L6-L13) |
| `/api/scan/resume` | POST | **None** | **None** | Deletes `.pause` — [app/api/scan/resume/route.ts:6-13](app/api/scan/resume/route.ts#L6-L13) |
| `/api/scan/stop` | POST | **None** | **None** | Writes `.stop` — [app/api/scan/stop/route.ts:6-13](app/api/scan/stop/route.ts#L6-L13) |
| `/api/scan/login-complete` | POST | **None** | **None** | Writes `.login-complete` — [app/api/scan/login-complete/route.ts:5-8](app/api/scan/login-complete/route.ts#L5-L8) |
| `/api/history` | GET | **None** | **None** | Lists every stored scan: target URL, scope, date, counts — [app/api/history/route.ts:9-33](app/api/history/route.ts#L9-L33) |
| `/api/history/[id]` | GET | **None** | **None** | Returns a **full report incl. HTML snippets and PII** — [app/api/history/[id]/route.ts:5-19](app/api/history/[id]/route.ts#L5-L19) |
| `/api/history/[id]` | DELETE | **None** | **None** | **Deletes** a report file — [app/api/history/[id]/route.ts:21-31](app/api/history/[id]/route.ts#L21-L31) |

There is no middleware file, no session check, no shared secret, and no `Origin`
or `Referer` validation in the repository. `allowedDevOrigins: ['127.0.0.1']`
([next.config.mjs:14](next.config.mjs#L14)) is a Next dev-server HMR WebSocket
allowance and provides no request authorization — the comment there says so.

### 4.2 Bind interface - reachable from the LAN

**The documented launch path binds to all interfaces, not to localhost.**

- `npm run dev` → `next dev` with no `-H` flag ([package.json:9](package.json#L9)); this is what both launchers run ([start.command:61](start.command#L61), [start.bat:79](start.bat#L79)) and what the README instructs.
- Next.js's own CLI help declares the default: `-H, --hostname <hostname>` … `(default: 0.0.0.0)` ([node_modules/next/dist/bin/next:130](node_modules/next/dist/bin/next#L130) for `dev`, line 152 for `start`). No commander `.default()` is set, so `options.hostname` is `undefined` ([next-dev.js:196,216](node_modules/next/dist/cli/next-dev.js#L196)) and `server.listen(port, undefined)` ([start-server.js:267](node_modules/next/dist/server/lib/start-server.js#L267)) binds every interface.
- **Only the packaged Electron path pins the interface**, via `HOSTNAME: '127.0.0.1'` ([electron/main.js:83](electron/main.js#L83)).

**Consequence:** run the tool the documented way on university Wi-Fi or a wired
office subnet and any device that can reach port 3000 can — with no credential —
enumerate scan history, read full reports including the operator's email, stop a
running scan, or launch a new scan against any URL. Assume a pen tester finds this
in the first ten minutes.

### 4.3 What each attacker class can do

**Another process running as the same user:** everything. It can read
`database.sqlite` (`0600` but same-owner), read/modify/delete `reports/*.json`
(`0644`, owner-writable), and create or delete the signal files, since the data
directory is `0755 me:me`. Forging `.stop` aborts a scan mid-run; forging
`.login-complete` makes the crawler capture `storageState` and begin crawling
**before the user has actually logged in**. A process running as a *different*
non-root local user can **read** `reports/*.json` (`0644`) but cannot write the
signal files.

**Another device on the same network:** full API access, per §4.2.

**A malicious webpage in the user's browser (CSRF):** genuinely exploitable for
the no-body routes. `fetch('http://localhost:3000/api/scan/stop', {method:'POST',
mode:'no-cors'})` is a CORS *simple request* — no preflight, so it is sent and the
side effect happens; the attacker cannot read the opaque response but does not need
to. The same applies to `/pause`, `/resume`, and `/login-complete`. `/api/scan`
carries a JSON body and would normally require a preflight that fails, but it is
plausibly reachable via an HTML form with `enctype="text/plain"` crafted so the
encoded body parses as JSON — **UNVERIFIED**, and a good thing to hand IA rather
than have them find it. `GET /api/history` cannot be *read* cross-origin (no
`Access-Control-Allow-Origin` is set), so history disclosure via CSRF is blocked;
disclosure comes from §4.2 instead.

### 4.4 Target URL validation — none (SSRF-adjacent)

There is **no validation of the target URL at any layer.**

- Client: [app/components/CrawlScanForm.tsx:31-35](app/components/CrawlScanForm.tsx#L31-L35) `normalizeUrl` only prepends `https://` when no scheme is present. No host, scheme, or private-range check.
- API: [app/api/scan/route.ts:8](app/api/scan/route.ts#L8) does `await req.json()` and passes the object straight to `startScan(config)`. No schema validation, no allowlist.
- Engine: [lib/crawler/config.ts:17-42](lib/crawler/config.ts#L17-L42) reads the values as-is. The only URL filters are the destructive-action denylist and `excludedScopes`.

So an unauthenticated caller can point a real, session-bearing Chromium at
`http://localhost:*`, `http://127.0.0.1:*`, `http://169.254.169.254/…`, or any
internal hostname the host can resolve, and then **read the rendered result back
out of `reports/`** via `GET /api/history/<id>` — a complete SSRF read primitive
in the LAN-exposed configuration. This is not hypothetical: a stored report already
targets `http://localhost:9921/index.html`
(`reports/report-scan-1781898504828.json`).

Mitigating factor: the crawl only *renders* pages and only ever issues GETs via
navigation; it does not replay arbitrary methods.

### 4.5 Path traversal in `/api/history/[id]`

[app/api/history/[id]/route.ts:7](app/api/history/[id]/route.ts#L7) passes the raw
route parameter to `reportPath(id)`, which does
`path.join(reportsDir(), 'report-' + id + '.json')`
([lib/paths.ts:32-34](lib/paths.ts#L32-L34)). There is no normalization and no
containment check. Verified with Node:

```
id = "../../../../etc/passwd"  ->  /var/home/me/Development/etc/passwd.json
id = "../../package"           ->  /var/home/me/Development/a11y-crawler/reports/package.json
id = "..%2F..%2Ffoo"           ->  …/reports/report-..%2F..%2Ffoo.json   (no escape)
```

A single decoded `..` escapes the reports directory. Percent-encoded slashes do
not. Exploitability therefore hinges on whether Next.js delivers a decoded `..` in
a single dynamic segment or normalizes it away during routing — **UNVERIFIED; I
did not start the server to test it.** Two points regardless: the reachable file
set is constrained to a `.json` suffix, and the **`DELETE` handler makes this
destructive, not merely a read** — `unlinkSync` at
[route.ts:29](app/api/history/[id]/route.ts#L29) with no containment check. Raise
this yourself; it is exactly what a pen tester fuzzes first.

### 4.6 Other local surface

- `pid` is stored in the DB ([lib/db.ts:20](lib/db.ts#L20)) and used for orphan cleanup: `process.kill(scan.pid, 0)` then `process.kill(scan.pid, 'SIGKILL')` ([lib/scanManager.ts:183-189](lib/scanManager.ts#L183-L189)). A stale row whose PID has been recycled by an unrelated process would cause the app to **SIGKILL that unrelated process**. Reachable only by a same-user attacker who can write the DB, so it is a low-severity note, not a finding.
- The Electron shell is configured tightly: `contextIsolation: true`, `nodeIntegration: false` ([electron/main.js:143-147](electron/main.js#L143-L147)); the preload exposes only `{isElectron, platform}` ([electron/preload.js:7-10](electron/preload.js#L7-L10)); `setWindowOpenHandler` denies in-app windows and defers to the OS browser ([electron/main.js:152-155](electron/main.js#L152-L155)). Good, and worth showing IA.

---

## 5. Destructive Action Controls

### Exact defaults

**Engine, always applied, cannot be removed** — [lib/crawler/config.ts:33-36](lib/crawler/config.ts#L33-L36):

```
'/logout', '/delete', '/remove', '/signout', '/sign-out', '/log-out'
```

**UI form defaults, user-editable, appended via `CRAWLER_BLOCKED`** —
[app/components/CrawlScanForm.tsx:43-46](app/components/CrawlScanForm.tsx#L43-L46), merged at [lib/scanManager.ts:64](lib/scanManager.ts#L64):

```
'Log out', 'Sign out', 'Delete', 'Remove', 'Grant', 'Access',
'Pay', 'Payment', 'Purchase', 'Buy', 'Checkout', 'Deactivate', 'Disable'
```

### Matching logic

One flat list, **case-insensitive substring** (no regex, no word boundaries),
applied to two different fields:

1. **URLs** - [lib/crawler/urlUtils.ts:6-9](lib/crawler/urlUtils.ts#L6-L9): `url.toLowerCase().includes(pattern.toLowerCase())`. Matches anywhere in the whole URL, not just the path. Enforced when dequeuing ([lib/crawler/index.ts:80-83](lib/crawler/index.ts#L80-L83)), when enqueuing ([index.ts:140-141](lib/crawler/index.ts#L140-L141)), and during link discovery ([lib/crawler/linker.ts:28](lib/crawler/linker.ts#L28)).
2. **Control labels** - [lib/crawler/scanner.ts:169-175](lib/crawler/scanner.ts#L169-L175): `label.includes(p.toLowerCase())`, where `label` comes from [scanner.ts:102-105](lib/crawler/scanner.ts#L102-L105): `aria-label` if present, **else** `textContent` with snake_case tokens stripped and whitespace collapsed, **truncated to 50 characters**.

`href` is *not* matched as a separate field - it is covered only insofar as the URL
is checked when the link is queued. `title`, `name`, `value`, `id`, `class`, and
`aria-describedby` are never consulted.

### What is NOT covered

1. **Unlabeled and icon-only controls.** If `aria-label` is absent and `textContent` is empty, `label` is `''` and no pattern can match — the control is clicked. **48 clicks on empty-label elements are recorded in `scan_logs`.** An unlabeled trash-can icon button is exactly this case, and it is also exactly the kind of button axe-core flags for `button-name`, so the crawler is drawn to it.
2. **The 50-character truncation.** [scanner.ts:104](lib/crawler/scanner.ts#L104) — a denylisted word past character 50 of a long label is invisible to the matcher.
3. **Any verb not on the list.** Confirmed clicked, from the reports on disk: `Archive community`, `Archive course`, `Create Community`, `Create course`, `Create assignment`, `Create new post`, `Create new accolade`, `Generate Key +`, `Click Here To Generate Report`, `Invite members to this community`, `Invite as Community Facilitator`, `Send email`, `Submit`, `Save`, `Import`, `Start a new conversation`, `Assign grader to Lynn Sabieddine`, and three `Notify me when …` toggles. **Archive, create, invite, send, submit, save, import, generate, assign, and notify are all absent from the default list.**
4. **Confirmation dialogs are actively defeated.** After each click the crawler presses Escape ([scanner.ts:300](lib/crawler/scanner.ts#L300)) — which dismisses modals — but it has *already clicked every visible control in the modal* during the recursive descent ([scanner.ts:297](lib/crawler/scanner.ts#L297), depth up to `maxInteractionDepth`, default 3 / UI default 2). A "Are you sure? [Cancel] [Delete]" dialog is a two-control DOM; `Delete` is denylisted by the UI default, but `Confirm`, `Yes`, `OK`, and `Proceed` are not. **A confirm dialog is not a backstop here — it is one more thing to click.**
5. **Form submission.** `Submit` is not on the default list and appears in the clicked set. Text inputs are never filled, so submissions carry whatever the page pre-populated.
6. **Semantics vs. substring.** `'Access'` blocks the unrelated `Request Access` and truncates `Course options for "Peerceptiv Accessibility Cours`; `'Remove'` blocks the FAQ heading `Will inaccessible PDFs be removed?`; `'Purchase'` blocks `What's included when I purchase a Ready-Made simul`. All observed in `scan_logs` — the list produces false positives that reduce coverage while the real gaps stay open.

### Can it be disabled?

- **Via the UI:** yes, by clearing the tag field ([app/components/CrawlScanForm.tsx:43-46](app/components/CrawlScanForm.tsx#L43-L46) is `useState`, and `TagInput` allows removal). This takes explicit user action, but there is no warning, no confirmation, and no minimum.
- **Via the API:** yes, trivially and with no user action at all. Omit `forbiddenWords` from the `POST /api/scan` body and [lib/scanManager.ts:64](lib/scanManager.ts#L64) substitutes `[]`. The six engine patterns remain, and — as established in Claim 4 — those six have leading slashes and therefore **provide no label protection whatsoever**. A scan launched via the API with no `forbiddenWords` clicks every button on every page.

### Other safety controls, and whether they default on

| Control | Default | Evidence |
|---|---|---|
| Excluded scopes | On, but seeded with **three unrelated W3C demo URLs** | [lib/crawler/config.ts:37-41](lib/crawler/config.ts#L37-L41); UI default is `[]` ([CrawlScanForm.tsx:48](app/components/CrawlScanForm.tsx#L48)) |
| Crawl boundary (scope prefix) | On - links outside the boundary are not followed | [lib/crawler/linker.ts:19-20](lib/crawler/linker.ts#L19-L20), [index.ts:139](lib/crawler/index.ts#L139) |
| Top-URL pinning + revert | On - a click that navigates the tab away is undone via `goBack`/`goto` | [lib/crawler/scanner.ts:248-271](lib/crawler/scanner.ts#L248-L271) |
| Repeated-control cap | On, `maxRepeatedInteractions = 3` | [lib/crawler/config.ts:30](lib/crawler/config.ts#L30) |
| Interaction depth cap | On, engine default 3, UI default 2 | [config.ts:26](lib/crawler/config.ts#L26), [CrawlScanForm.tsx:41](app/components/CrawlScanForm.tsx#L41) |
| Per-page interaction cap | **Off — `Infinity`** | [lib/crawler/config.ts:29](lib/crawler/config.ts#L29) |
| `maxPages` | **Off — `Infinity`** | [lib/crawler/config.ts:23](lib/crawler/config.ts#L23) |
| Wall-clock budget | On, 30 min via UI | [config.ts:31](lib/crawler/config.ts#L31), [scanManager.ts:63](lib/scanManager.ts#L63) |
| **Dry-run / preview mode** | **Does not exist** | no such flag in [lib/crawler/config.ts](lib/crawler/config.ts) |
| **Confirm-before-click** | **Does not exist** | — |
| **Read-only / no-interaction mode** | **Does not exist** — interaction is unconditional | [lib/crawler/index.ts:175-181](lib/crawler/index.ts#L175-L181) |

### The crawler clicks inside third-party iframes

[lib/crawler/index.ts:175](lib/crawler/index.ts#L175) iterates **every** frame
matching `/^https?:/` and interacts with each. Evidence from `scan_logs` shows the
crawler entering and clicking inside `js.stripe.com`, `m.stripe.network`,
`google.com/recaptcha/api2/{anchor,bframe}`, `youtube.com/embed`, and
`youtube-nocookie.com/embed` frames. Those origins are outside any configured
scope or boundary — the boundary governs *navigation*, not *in-frame interaction*.
Clicking inside a payment provider's iframe on an authenticated page is a
consequence IA will want to hear about, and it also means the crawler's blast
radius extends to third-party vendors of the target application.

---

## 6. Dependency Findings

`npm audit` (read-only) — **32 vulnerabilities: 1 critical, 31 high, 0 moderate, 0 low.**
564 total deps (82 prod, 424 dev, 117 optional).

**The split matters far more than the headline number.** `npm audit --omit=dev`
reports **3 high, 0 critical** — every other finding is in the `electron-builder`
build toolchain, which runs only when *you* package a release. It is never present
at scan time and never on an end user's machine.

### Runtime (production) — 3 high

| Package | Installed | Issue | Fix |
|---|---|---|---|
| `next` | 16.2.4 | ~22 advisories: SSRF in Server Actions on custom servers, SSRF via WebSocket upgrades, middleware/proxy bypass, cache poisoning, XSS with CSP nonces, several DoS | `fixAvailable: true`, non-major |
| `postcss` | 8.5.10 | XSS via unescaped `</style>`; arbitrary file read + path traversal via attacker-controlled `sourceMappingURL` in CSS comments | `fixAvailable: true`, non-major |
| `sharp` | 0.34.5 | Inherited libvips CVE-2026-33327 / -33328 / -35590 / -35591 | `fixAvailable: true`, non-major |

Practical exposure: `next` is the one that matters, since it serves the
unauthenticated, LAN-bound API surface of §4. `postcss` and `sharp` are transitive
under `next`; `postcss` is build-time CSS processing and `sharp` backs the Image
Optimization API, which this app does not use (`public/` is empty, no
`next/image` import anywhere).

### Build-time (dev) — 1 critical, 28 high

- **`tar` ≤ 7.5.20 — CRITICAL.** Twelve advisories: arbitrary file create/overwrite via hardlink path traversal, symlink poisoning, arbitrary read/write via symlink chains, plus DoS variants. Reached through `@electron/rebuild` → `node-gyp` → `tar` and `app-builder-lib` → `tar`. Triggered during `npm run dist`, when it extracts downloaded Electron/Chromium archives.
- **`electron` 33.4.11 — HIGH, 18 advisories**, including ASAR integrity bypass, several use-after-frees, iframe permission-origin confusion, and header injection in custom protocol handlers. `package.json` pins `^33.2.0` ([package.json:20](package.json#L20)); current is 43.x. **This one ships to end users** in a packaged build, so despite being a `devDependency` it is genuinely runtime-relevant for anyone running the `.dmg`/`.exe`/AppImage. Fix requires a major bump (`electron@43.2.0`).
- The remaining ~26 are the `electron-builder` 25.x dependency tree (`app-builder-lib`, `builder-util*`, `archiver`, `glob`, `minimatch`, `brace-expansion`, `cacache`, `rimraf`, `ejs`, `jake`, `node-gyp`, `dir-compare`, `config-file-ts`, `@electron/{asar,rebuild,universal}`, `@npmcli/move-file`, `readdir-glob`, `zip-stream`, `make-fetch-happen`, `filelist`, `dmg-builder`, `electron-publish`, `electron-builder-squirrel-windows`). All resolve to one upgrade: `electron-builder@26.15.3`, **`isSemVerMajor: true`**. Two are notable on their own: `builder-util-runtime` leaks `PRIVATE-TOKEN` / mixed-case `Authorization` headers across cross-origin redirects, and `app-builder-lib` has uncontrolled search-path elements in built AppImages.

### Deprecated / unmaintained / old-major

- **`electron` pinned to major 33** while 43 is current — 10 majors behind, and it is the shipped runtime.
- **`electron-builder` pinned to `^25.1.8`** ([package.json:22](package.json#L22)) while 26.x is current; the entire dev-vuln tree derives from this pin.
- `@npmcli/move-file` is **deprecated** upstream (folded into `@npmcli/fs`); reached transitively via `cacache`.
- `node-gyp` 9 is old enough that the CI workflow has to pin Python 3.11 for `distutils` ([.github/workflows/build-desktop.yml:37-43](.github/workflows/build-desktop.yml#L37-L43)) and pin `windows-2022` for VS 2022 ([workflow:24-27](.github/workflows/build-desktop.yml#L24-L27)) — a reliable signal of a stale toolchain.

### Native bindings and elevated privilege

| Dependency | Privilege | Needed? |
|---|---|---|
| `better-sqlite3` 12.10.0 | **Native C++ addon**; synchronous local filesystem access. Compiled on the build host and rebuilt for Electron's ABI ([workflow:52-61](.github/workflows/build-desktop.yml#L52-L61)); excluded from the server bundle ([next.config.mjs:8](next.config.mjs#L8)) and hot-patched into the standalone output ([scripts/patch-standalone-sqlite.mjs](scripts/patch-standalone-sqlite.mjs)) | Yes — it is the datastore |
| `playwright` / `playwright-core` 1.59.1 | Downloads and executes a **full browser**; spawns processes; unrestricted network access; writes to `~/.cache/ms-playwright` and `/tmp` | Yes — it is the crawl engine. This is the single largest privilege in the tool and is inherent to the design |
| `electron` 33.4.11 | Bundles Chromium + Node; spawns the Next server as a child ([electron/main.js:108-112](electron/main.js#L108-L112)) | Yes for the desktop build. Sandbox posture is tight (§4.6) |
| `sharp` 0.34.5 | **Native libvips bindings**; image decoding — a historically CVE-dense attack surface | **No.** Transitive under `next` for Image Optimization, which this app never uses. Worth noting to IA as an unused native dependency rather than pretending it is required |
| `esbuild`, `concurrently`, `electron-builder` | Build-time only; filesystem + process spawn | Build only |

Nothing in the tree phones home at runtime — see §7 of this section's companion, §3 Network Egress below.

### Network egress — confirmed local-only at runtime

**Confirmed: nothing leaves the machine at runtime except requests to the target
being audited and whatever that target's own pages load.**

- Every `fetch()` in the app is a **same-origin relative path**: `/api/history`, `/api/history/${id}`, `/api/scan`, `/api/scan/stream`, `/api/scan/status`, `/api/scan/pause`, `/api/scan/resume`, `/api/scan/stop`, `/api/scan/login-complete` ([app/components/History.tsx:22,35,43](app/components/History.tsx#L22), [app/page.tsx:35](app/page.tsx#L35), [app/components/Scanning.tsx:29,37,64,137,183,186,196](app/components/Scanning.tsx#L29)). There is not a single absolute-URL fetch in the codebase.
- No `axios`, no `XMLHttpRequest`, no `WebSocket`, no `navigator.sendBeacon`, no telemetry SDK, no analytics, no crash reporter (Sentry/Bugsnag/etc.) anywhere in the source.
- The only Node-side HTTP client is `http.get` against `http://127.0.0.1:${PORT}` — the Electron main process waiting for its own server to come up ([electron/main.js:120-135](electron/main.js#L120-L135)).
- No `@vercel/analytics`, no `next/script` with an external `src`, `public/` is empty.

**Fonts — the one nuance, and it is build-time only.**
[app/layout.tsx:2](app/layout.tsx#L2) imports `Atkinson_Hyperlegible_Next` from
`next/font/google` ([layout.tsx:11-15](app/layout.tsx#L11-L15)). `next/font/google`
fetches the font from Google **during `next build` / `next dev` compilation** and
self-hosts the result; the served page makes **no request to
`fonts.googleapis.com` or `fonts.gstatic.com`**. So: build-time egress to Google
exists, runtime egress does not. State it that way — it is accurate and it
pre-empts the obvious question. `app/globals.css` contains exactly one `@import`
(`"tailwindcss"`, local) and **zero `url()`** references. No CDN `<script>` or
`<link>` tags anywhere.

**Third-party requests during a crawl — expected, but name them.** When Chromium
renders the target, it loads whatever that page embeds. `scan_logs` shows frames
from `js.stripe.com`, `m.stripe.network`, `google.com/recaptcha`,
`youtube.com/embed`, and `youtube-nocookie.com/embed`. That is the browser
faithfully rendering the target, not the tool exfiltrating anything — **but** per
§5, the crawler also *clicks inside* those frames, which goes beyond passive
rendering. Distinguish the two clearly when IA asks.

---

## 7. Repository Hygiene Findings

### The one real finding: `database.sqlite` is in public git history

**`database.sqlite`, `database.sqlite-wal`, and `database.sqlite-shm` were
committed and pushed to the public repository, and the blobs are still reachable.**

- Added in `e3fb373` — "feat: implement SQLite-backed scan management system…", Mon 2026-05-25 14:15:42 -0400.
- Deleted in `261cb69` — "chore: update SQLite database state files", same day, 15:58:08.
- **`git branch -a --contains e3fb373` includes `remotes/origin/main`**, plus `origin/{HEAD,Server-Side-Persistence,data-export,electron,iteration1,iteration2,tabular-format}`. The commit is on the public default branch's history, so the blobs are downloadable from GitHub today. Deleting a file in a later commit does not remove it from history.
- Blob sizes: `database.sqlite` 376,832 bytes; `-wal` 4,120,032 bytes.

**Good news on content — I extracted and queried the committed blobs.** The
historical DB holds 2 `active_scan` rows and 3,010 `scan_logs` rows. Every URL in
it resolves to a single host: **`https://www.w3.org`** (2,923 occurrences, no
others). Queries for `umich`, `@*.edu`, `instructure`, `yellowdig`, `codegra`, and
`peerceptiv` return **0 rows**, and `strings` over the raw 4 MB `-wal` blob finds
only `www.w3.org`. The stored config confirms it: `{"scope":"https://www.w3.org/", …}`.

**So: `git ls-files` is clean today, `.gitignore` covers the DB
([.gitignore:17-20](.gitignore#L17-L20)), and no authenticated UMich scan output
was ever committed.** The finding is a process finding — a database file reached a
public branch — not a data-breach finding. Tell IA both halves. If you only
mention the first they will assume the worst; if you only mention the second they
will find the commit and assume you were hiding it.

### No real authenticated scan output was ever committed

- `git log --all --pretty=format: --name-only --diff-filter=A` shows **no** `reports/` file, and no `.json` report, ever added on any branch.
- `reports/` is gitignored ([.gitignore:11](.gitignore#L11)) and untracked; all 20 files on disk — including the three containing `harrygu@umich.edu` — are **local only**.
- `screenshot.png` **is tracked**, so I read it: it is a UI screenshot of a **`www.w3.org`** scan (142/265 pages, w3.org URLs in the table). No authenticated content, no institutional data. Clean.

### No secrets in history

- A regex sweep of `git log --all -p` for `api[_-]?key`, `secret`, `password`, `passwd`, `token`, `bearer`, `private[_-]key`, `BEGIN … PRIVATE KEY`, `aws_access`, `ghp_`, `gho_`, `sk-…`, `xox[baprs]-` produced **three matches, all benign**: a `for /f "tokens=1 delims=."` shell idiom in `start.bat`, and two mock-data lines in `mockHistoryData.ts` containing the literal HTML `<input type="password" …>` (a fake violation fixture).
- No `.env*`, `.pem`, `.key`, `id_rsa`, or credential file was ever committed.
- CI has no hardcoded secrets; it uses `CSC_IDENTITY_AUTO_DISCOVERY: false` and the built-in `GITHUB_TOKEN` via `permissions: contents: write` ([.github/workflows/build-desktop.yml:16-17,60-61](.github/workflows/build-desktop.yml#L16-L17)).

### Hardcoded internal hostnames in public source

**`https://umitstest.h5p.com/content` is the hardcoded default crawl scope** —
[lib/crawler/config.ts:18](lib/crawler/config.ts#L18):

```ts
const scope = process.env.CRAWLER_SCOPE ?? 'https://umitstest.h5p.com/content';
```

It is also in [tests/example.spec.ts:8-11](tests/example.spec.ts#L8-L11) and,
extensively, in [app/components/mockHistoryData.ts](app/components/mockHistoryData.ts) —
~45 fabricated URLs under that host (`/admin`, `/admin/users`, `/user/profile`,
`/dashboard`, …) plus `https://app.peerceptiv.com`. This is a UMich ITS test
instance name published on GitHub, and the mock file effectively publishes a
guessed route map for it. Low severity — a hostname is not a credential and these
paths are invented — but it is exactly the kind of thing an IA reviewer flags, and
`config.ts:18` means **a scan launched with no configuration at all defaults to
pointing at a UMich host**. Worth fixing (see §9).

### `.gitignore` coverage vs. the working tree

| Path on disk | Ignored? | Tracked? | Assessment |
|---|---|---|---|
| `database.sqlite`, `-wal`, `-shm` | Yes — [.gitignore:17-20](.gitignore#L17-L20) | No | Correct now; **history is not clean** (above) |
| `reports/` (20 files, incl. PII) | Yes — [.gitignore:11](.gitignore#L11) | No | Correct |
| `test-results/`, `playwright-report/` | Yes — [.gitignore:4-5](.gitignore#L4-L5) | No | Correct |
| `.stop`, `.pause`, `.login-complete` | Yes — [.gitignore:13-15](.gitignore#L13-L15) | No | Correct (a stale `.stop` is present) |
| `.crawler-build/`, `pw-browsers/`, `.next/`, `dist/` | Yes — [.gitignore:26-34](.gitignore#L26-L34) | No | Correct |
| `tsconfig.tsbuildinfo` | Yes — `*.tsbuildinfo` [.gitignore:23](.gitignore#L23) | No | Correct now; **was committed historically** (present in `--diff-filter=A` output). Build metadata only |
| `.env*.local` | Yes — [.gitignore:37-38](.gitignore#L37-L38) | — | Note: plain `.env` is **not** ignored, only `.env*.local`. No `.env` exists today, but the gap invites one |
| `screenshot.png` | **No** | **YES** | Content verified clean (w3.org UI shot). Intentional-looking, but an unignored PNG that a future screenshot could overwrite with authenticated content |
| `start-error.log` | **No** | **YES**, 0 bytes | **Real hygiene gap.** Both launchers *append* to this tracked file ([start.command:33,39](start.command#L33), [start.bat:42,55](start.bat#L42)). Any user who runs `./start.command` and hits an install error dirties a tracked file, and the next `git add -A` commits local environment detail (paths, usernames, npm output) to the public repo |
| `course/` (3 empty dirs `12345`, `67890`, `99999`, mode `0700`) | **No** | No | Untracked and empty — verified no files. Harmless, but not ignored, so it could be committed accidentally |

---

## 8. Logging

### What is logged, and where it goes

Every crawler `console.log` is captured by the parent and persisted. The pipeline:

`crawler stdout/stderr`
→ `handleOutput` splits on newline ([lib/scanManager.ts:90-98](lib/scanManager.ts#L90-L98))
→ `insertLog` writes a row to `scan_logs` **and** emits to an `EventEmitter` ([lib/scanManager.ts:28-31](lib/scanManager.ts#L28-L31))
→ `GET /api/scan/stream` replays **all historical rows** then streams live ones over SSE ([app/api/scan/stream/route.ts:13-31](app/api/scan/stream/route.ts#L13-L31))
→ rendered into the UI log pane ([app/components/Scanning.tsx:72-73](app/components/Scanning.tsx#L72-L73)).

**Verbosity is high and there is no level control** — no log level, no quiet mode,
no redaction hook. Current DB: **14,762 rows across 21 scans.** Every line is
stored verbatim, including raw ANSI escape sequences (`^[[1A^[[2K`), which is
cosmetic but confirms zero sanitization.

Logged per page/interaction: full page URL ([index.ts:92](lib/crawler/index.ts#L92)),
every queued link ([index.ts:145](lib/crawler/index.ts#L145)), full frame URLs
([scanner.ts:131,155,316](lib/crawler/scanner.ts#L131)), **the accessible label of
every control clicked or skipped** ([scanner.ts:173,233](lib/crawler/scanner.ts#L173)),
navigation reverts including destination URL ([scanner.ts:257,260](lib/crawler/scanner.ts#L257)),
the post-login URL ([driver.ts:56](lib/crawler/driver.ts#L56)), violation counts,
and a per-route summary that re-prints page URLs ([reporter.ts:80-107](lib/crawler/reporter.ts#L80-L107)).

### Can logs contain page content, tokens, or session identifiers? - YES to the first two

**Page content: confirmed.** Control labels are page text. From `scan_logs`:

```
→ Clicking: <button> "harrygu@umich.edu"
→ Clicking: <li> "Username: harrygu@umich.edu"
→ Clicking (#1 this frame): <select> "Ann ArborDearbornFlintMichigan Medicine"
```

**Your own UMich account identifier is in the database in cleartext.** On a page
listing students, `→ Clicking (#n): <button> "<student name>"` is the direct
consequence.

**URLs with tokens in query strings: confirmed.** Frame URLs are logged whole, with
no parameter stripping. Extracting `param=<40+ char value>` from `scan_logs`:

| Param | Occurrences | What it is |
|---|---|---|
| `sid=` | 94 | Stripe session identifier |
| `muid=` | 94 | Stripe machine/device identifier |
| `url=` | 94 | URL-encoded parent page URL, embedded in a Stripe frame URL |
| `redirect=` | 41 | Redirect target |
| `co=` | 12 | reCAPTCHA base64 origin |
| `title=` | 8 | **URL-encoded page title of the authenticated app** |
| `bft=` | 2 | reCAPTCHA bearer-style token |

Two concrete examples of content leaking through URL logging:

```
…m-outer-….html#url=https%3A%2F%2Fapp.peerceptiv.com%2Fcourse%2F6246788e-d359-4233-98dc-41755bc924d7
  %2Fassignment%2F007050a9-362f-4d8f-83e6-8ffdc8d794b8%2Fdashboard
  &title=(69)%20For%20accessibility%20review%20purposes%20%232%20-%20Assignment%20Dash…

…recaptcha/api2/bframe?…&bft=0dAFcWeA7xcaQApRDVl8EIxepnm0hJPxeS4pWf7PLy6fFH9XMgNVHVs33Qs…
```

Course and assignment UUIDs from an authenticated LMS, and the page's document
title, both persisted to disk.

**Session identifiers: not found, and the design argues against them.** Zero rows
match `jsessionid`, `bearer `, `eyJ`, `session_id`, `sessionid`, `access_token`,
or `id_token`; the only `cookie` hits are the hostname `youtube-nocookie.com`. The
`storageState` object is never passed to a log call. **But** nothing *prevents* it:
because full URLs are logged verbatim, a target that puts a token in a query
string or fragment — a SAML/OIDC callback, a password-reset link, a signed
download URL — would have it written to `scan_logs` in cleartext. The Stripe `sid`
and reCAPTCHA `bft` values above are proof that opaque credentials in URLs do get
captured; it is only luck that none of them were *your* session.

### Rotation and cleanup

- **No rotation.** No size cap, no age cap, no truncation anywhere in the log path.
- **Indirect DB cleanup only:** the 20-scan cap at [lib/scanManager.ts:39-46](lib/scanManager.ts#L39-L46) cascades log deletion via [lib/db.ts:30](lib/db.ts#L30). Count-based, not age-based. No `VACUUM`, so deleted text may persist in SQLite free pages and in the 4 MB `-wal`.
- `start-error.log` is **append-only forever**, never rotated.
- No cleanup on app exit or uninstall; `before-quit` only kills the server child ([electron/main.js:187-192](electron/main.js#L187-L192)).

---

## 9. Gaps and Open Questions

### Raise these proactively - they are findings a pen test will produce in the first hour

1. **The documented launch binds to `0.0.0.0`, and every API route is unauthenticated.** §4.1–4.2. Highest-severity item in this audit: any device on the subnet can read scan history and full reports (including `harrygu@umich.edu`), stop a running scan, or launch a scan against an arbitrary URL. The Electron build pins `127.0.0.1`; the `npm run dev` path in the README does not.
2. **Report files contain real institutional PII, world-readable, with no retention limit.** §2. Three files contain your `@umich.edu` address; one contains a third party's name; ten reference `umich.edu`. All mode `0644`, oldest from 2026-06-16, no pruning logic.
3. **`database.sqlite` is in the public git history on `origin/main`.** §7. Content verified benign (w3.org only) — but say it before they find it, and say both halves.
4. **The destructive-action denylist did not prevent state-changing clicks.** §5. `Archive community`, `Archive course`, `Create course`, `Generate Key +`, `Invite members…`, `Send email`, `Assign grader to Lynn Sabieddine` were all clicked. 934 clicks vs. 187 skips. The six engine-level defaults have leading slashes and provide **zero** label protection; all real label protection is a React `useState` default that the API bypasses entirely.
5. **Confirmation dialogs are not a safety net.** §5 item 4 — the crawler recurses into the modal and clicks its controls, then presses Escape.
6. **No target-URL validation anywhere: SSRF-adjacent read primitive.** §4.4. Unauthenticated `POST /api/scan` + `GET /api/history/<id>` = point a browser at an internal host and read the rendered result back. A stored report already targets `http://localhost:9921`.
7. **Logs contain page text and full URLs with opaque tokens.** §8. Your own email, LMS course/assignment UUIDs, authenticated page titles, Stripe `sid`/`muid`, reCAPTCHA `bft`.
8. **The crawler clicks inside third-party iframes** (Stripe, reCAPTCHA, YouTube) outside any configured scope. §5, last subsection.
9. **`electron` is 10 majors behind (33.4.11 vs 43.x) with 18 advisories, and it ships to end users.** §6.
10. **`tar` CRITICAL in the packaging toolchain.** §6 — arbitrary file write during `npm run dist`, i.e. on your build machine.

### Genuinely open - I could not determine these statically

1. **Does Playwright always delete the temporary browser profile?** Especially on the `process.exit(1)` hard-backstop path ([run.ts:23-28](lib/crawler/run.ts#L23-L28)) where `browser.close()` never runs. Empirically no profile remnants exist on this machine, but that is one observation, not a guarantee. **Requires runtime verification.**
2. **Is the `/api/history/[id]` path traversal reachable?** §4.5. Depends on whether Next.js 16 delivers a decoded `..` in a single dynamic segment. The `path.join` math is confirmed; the routing behaviour is not. **Requires runtime verification** — do this before Friday if you can (a single GET, no writes).
3. **Is `POST /api/scan` CSRF-reachable via a `text/plain` form?** §4.3. The no-body routes (`/stop`, `/pause`, `/resume`, `/login-complete`) definitely are.
4. **What actually happens to the DB and reports on uninstall?** No cleanup code exists, and in the portable Electron layout data sits beside the binary ([electron/main.js:38-45,66-73](electron/main.js#L38-L45)). Where data lands, and whether it survives uninstall, differs per packaging format — untested.
5. **Do freed SQLite pages retain deleted log text?** No `VACUUM` is issued and the `-wal` is 4 MB. Likely recoverable; not verified.
6. **How many report files exist on other machines?** This audit covers one workstation. If the tool has been run elsewhere, each of those has its own unpruned `reports/`.
7. **`app/components/mockHistoryData.ts`** — I read it as fabricated demo data (the `springfield.gov` and `hr.meridian-corp.com` entries are clearly synthetic). If any part of it was derived from a real `umitstest.h5p.com` crawl, that changes its classification. **You know; I cannot tell from the file.**

---



### Explicitly wait until after the review

9. **`electron` 33 → 43 and `electron-builder` 25 → 26.** Both `isSemVerMajor: true`; together they clear the critical `tar` finding and 28 highs. But they touch native rebuilds (`better-sqlite3`), the asar/standalone packaging patches ([scripts/patch-standalone-sqlite.mjs](scripts/patch-standalone-sqlite.mjs), [scripts/prepare-standalone.mjs](scripts/prepare-standalone.mjs)), and CI. **Do not attempt in two days.** Bring a written remediation plan instead.
10. **Authentication / CSRF tokens on the API.** The right fix is a per-session token or an `Origin` check in middleware. Real design work; localhost binding (#1) is the correct two-day mitigation.
11. **Path-traversal containment in `reportPath`.** A `path.resolve` + `startsWith(reportsDir())` guard is three lines, but I could not confirm the vulnerability is reachable (§9 open question 2), and it sits on the read/delete path for history. Verify reachability first, then fix deliberately.
12. **Retention policy for `reports/`.** Needs a decision on retention period and deletion semantics — a policy question for IA, not a code change to rush.
13. **Dry-run mode / read-only scan mode.** The correct answer to finding #4, and a feature, not a fix. Propose it; do not build it this week.

---

### One-paragraph summary for the ticket

The tool's credential handling is genuinely sound: passwords are typed only into a
real browser window, session state is captured via an in-memory `storageState()`
call with no `path` argument, held in a single function-scoped variable inside a
short-lived subprocess, and no cookie or token material appears anywhere in the
database or the report files. Nothing is transmitted off the machine at runtime.
The weaknesses are elsewhere: the documented launch command binds to all network
interfaces while every one of the ten API routes is unauthenticated; scan reports
persist indefinitely at mode `0644` and demonstrably contain real institutional
PII captured from authenticated sessions; the destructive-action denylist's
engine-level defaults cannot match button labels at all, and the reports on disk
record clicks on "Archive course", "Create course", and "Send email"; and a
SQLite database — verified to contain only `www.w3.org` scan data — reached the
public repository's `main` branch history.
