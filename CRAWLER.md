# How the Crawler Discovers the DOM

How this crawler finds pages and page states, with a source location for every claim.
Line numbers refer to the state of the code at the time of writing — if one looks off,
search for the quoted symbol name instead.

## Contents

- [The two discovery mechanisms](#the-two-discovery-mechanisms)
- [File map](#file-map)
- [Mechanism 1 — link discovery](#mechanism-1--link-discovery)
- [Mechanism 2 — interaction discovery (clicking)](#mechanism-2--interaction-discovery-clicking)
- [Deduplication: the four independent layers](#deduplication-the-four-independent-layers)
- [Frames and embedded tools](#frames-and-embedded-tools)
- [Termination and safety limits](#termination-and-safety-limits)
- [Configuration reference](#configuration-reference)
- [Known discrepancy: the `boundaries` set](#known-discrepancy-the-boundaries-set)

---

## The two discovery mechanisms

The crawler explores in two distinct ways, and keeping them separate is the key to
reading the code:

| | **Link discovery** | **Interaction discovery** |
|---|---|---|
| What it finds | New **URLs** | New **states of the current URL** |
| How it moves | Navigates the browser (`page.goto`) | Clicks in place; URL is pinned |
| Where | Main frame only | Every frame, including cross-origin iframes |
| Entry point | `crawl` — [lib/crawler/index.ts:29](lib/crawler/index.ts#L29) | `scanInteractiveElements` — [lib/crawler/scanner.ts:111](lib/crawler/scanner.ts#L111) |

They feed each other: a click that turns out to be a navigation hands its destination
back to the URL queue ([lib/crawler/scanner.ts:253-257](lib/crawler/scanner.ts#L253-L257)).

## File map

| File | Role |
|---|---|
| [lib/crawler/index.ts](lib/crawler/index.ts) | The main crawl loop: URL queue, dedup, orchestration |
| [lib/crawler/linker.ts](lib/crawler/linker.ts) | Link harvesting and scope filtering |
| [lib/crawler/scanner.ts](lib/crawler/scanner.ts) | Clicking engine and axe scans |
| [lib/crawler/urlUtils.ts](lib/crawler/urlUtils.ts) | URL canonicalization, route patterns, block/exclude checks |
| [lib/crawler/checkpoint.ts](lib/crawler/checkpoint.ts) | File-signal pause/stop control |
| [lib/crawler/config.ts](lib/crawler/config.ts) | Reads `CRAWLER_*` environment variables |
| [lib/crawler/driver.ts](lib/crawler/driver.ts) | Browser setup, login phase, report generation |
| [lib/crawler/run.ts](lib/crawler/run.ts) | Standalone entry point (bundled for Electron) |

---

## Mechanism 1 — link discovery

### The queue

A plain breadth-first queue seeded with the start URL
([lib/crawler/index.ts:34](lib/crawler/index.ts#L34)), draining in a `while` loop that
also enforces the page cap ([lib/crawler/index.ts:54](lib/crawler/index.ts#L54)).

Per iteration, before doing any work:

1. **Pause/stop check** — `checkpoint` returns `'stop'` if a stop file exists, or blocks
   in a 500 ms poll loop while a pause file exists
   ([lib/crawler/checkpoint.ts:8-30](lib/crawler/checkpoint.ts#L8-L30)); called from
   [lib/crawler/index.ts:55](lib/crawler/index.ts#L55). Both files are cleared at crawl
   start so a stale signal can't kill a fresh run
   ([lib/crawler/index.ts:30-31](lib/crawler/index.ts#L30-L31)).
2. **Time budget** — the deadline is set once at
   [lib/crawler/index.ts:52](lib/crawler/index.ts#L52) and checked *between pages*
   ([lib/crawler/index.ts:56-60](lib/crawler/index.ts#L56-L60)), so expiry stops the
   crawl cleanly and still returns everything gathered so far, rather than losing the run.
3. **Blocked / excluded checks** — [lib/crawler/index.ts:80-87](lib/crawler/index.ts#L80-L87),
   using `isBlocked` (substring match, case-insensitive —
   [lib/crawler/urlUtils.ts:6-9](lib/crawler/urlUtils.ts#L6-L9)) and `isExcluded`
   (prefix match on path boundary or `?` —
   [lib/crawler/urlUtils.ts:11-18](lib/crawler/urlUtils.ts#L11-L18)).

### Navigation

Two paths, chosen at [lib/crawler/index.ts:102-103](lib/crawler/index.ts#L102-L103):

- **Same-document hash change** (SPA routing, `#/` → `#/dashboard`): driven by assigning
  `window.location.href` rather than `page.goto`, because no reload occurs and `goto`'s
  load events would never fire; then a settle wait
  ([lib/crawler/index.ts:104-107](lib/crawler/index.ts#L104-L107)).
- **Normal navigation**: `page.goto` waiting on `domcontentloaded`, with `networkidle`
  attempted afterward as **best-effort only** — a 10 s wait whose failure is swallowed
  ([lib/crawler/index.ts:109-110](lib/crawler/index.ts#L109-L110)). This is deliberate:
  pages that boot a cross-origin iframe (LTI tools) frequently never reach idle.

**Redirect realignment** — on the first page only, if the start URL redirected to a
different origin (e.g. `www` → non-`www`), `crawlBoundary` is rewritten to the actual
origin, otherwise every discovered link would be judged out of scope
([lib/crawler/index.ts:119-126](lib/crawler/index.ts#L119-L126)).

### Harvesting links

`discoverLinks` collects every `a[href]` from the **main frame only** and returns a
deduplicated, filtered list ([lib/crawler/linker.ts:9-32](lib/crawler/linker.ts#L9-L32)).
The `href` property (not the attribute) is read, so relative URLs arrive already resolved
to absolute ([lib/crawler/linker.ts:14-17](lib/crawler/linker.ts#L14-L17)).

A link survives only if it is:

| Filter | Location |
|---|---|
| Under an in-scope boundary prefix | [lib/crawler/linker.ts:19-20](lib/crawler/linker.ts#L19-L20) |
| Not a plain fragment anchor | [lib/crawler/linker.ts:25](lib/crawler/linker.ts#L25) |
| Not `mailto:` / `tel:` | [lib/crawler/linker.ts:26-27](lib/crawler/linker.ts#L26-L27) |
| Not blocked, not in an excluded scope | [lib/crawler/linker.ts:28-29](lib/crawler/linker.ts#L28-L29) |

**Fragment handling is deliberately asymmetric** —
`isFragmentAnchor` ([lib/crawler/urlUtils.ts:28-31](lib/crawler/urlUtils.ts#L28-L31))
treats `#/dashboard` as a real client-side route (crawl it) but `#section` as a
same-page jump (skip it). The discriminator is a single character: whether `/` follows `#`.

Survivors go through `enqueue` ([lib/crawler/index.ts:138-147](lib/crawler/index.ts#L138-L147)),
which re-applies scope and block rules and rejects anything already visited or already
queued. The same closure is reused for URLs discovered by clicking, tagged with a
different source label for the log.

For diagnostics, the total anchor count is compared against the in-scope count, and a
page with links but none in scope is called out explicitly
([lib/crawler/index.ts:150-157](lib/crawler/index.ts#L150-L157)) — this is the log line
to look for when a crawl unexpectedly stops after one page.

---

## Mechanism 2 — interaction discovery (clicking)

`scanInteractiveElements` ([lib/crawler/scanner.ts:111](lib/crawler/scanner.ts#L111)).
Called once per http frame after the page's own axe scan
([lib/crawler/index.ts:175-181](lib/crawler/index.ts#L175-L181)).

**Core invariant: the top-level URL must not change.** It is captured as `pinnedUrl` on
entry ([lib/crawler/scanner.ts:137](lib/crawler/scanner.ts#L137)) and any click that
navigates away from it is undone. Clicking explores *states*, not pages.

### What counts as clickable

`collectClickables` ([lib/crawler/scanner.ts:84-109](lib/crawler/scanner.ts#L84-L109))
runs a single `querySelectorAll` in the target document
([lib/crawler/scanner.ts:87-92](lib/crawler/scanner.ts#L87-L92)) for:

`button`, `[role="button"]`, `[role="tab"]`, `[role="menuitem"]`, `[role="switch"]`,
`[role="checkbox"]`, `[role="radio"]`, `details > summary`, `[aria-expanded]`,
`[aria-haspopup]`, `select`, `[onclick]`

Then three exclusions ([lib/crawler/scanner.ts:94-96](lib/crawler/scanner.ts#L94-L96)):

- anything inside an `<a>` — links belong to the other mechanism;
- anything with `offsetParent === null` — a cheap hidden-element test;
- `TD` / `TR` / `TH` — table cells, which would otherwise explode combinatorially.

Each survivor is reduced to `{ selector, tag, text }`
([lib/crawler/scanner.ts:98-105](lib/crawler/scanner.ts#L98-L105)). Two details matter
downstream:

- The selector is `tag#id` when an id exists, otherwise `tag` plus **at most the first
  two classes** — deliberately coarse, and always resolved with `.first()`
  ([lib/crawler/scanner.ts:185](lib/crawler/scanner.ts#L185)). It identifies a *shape* of
  control more than a unique node.
- The label prefers `aria-label` over text content, strips `snake_case` tokens, and is
  truncated to 50 chars ([lib/crawler/scanner.ts:103-104](lib/crawler/scanner.ts#L103-L104)).

### The per-element loop

For each candidate ([lib/crawler/scanner.ts:159](lib/crawler/scanner.ts#L159)):

1. **Stop check**, then **budget check** —
   [lib/crawler/scanner.ts:160-164](lib/crawler/scanner.ts#L160-L164).
2. **Avoided-label check** — if the accessible text contains any blocked pattern
   (e.g. "sign out"), skip ([lib/crawler/scanner.ts:169-175](lib/crawler/scanner.ts#L169-L175)).
   This is the label-based counterpart to the URL blocklist; without it a "Log out"
   *button* would be clicked even though the `/logout` *link* is blocked.
3. **URL drift repair** — if a previous click left the page somewhere else, return to
   `pinnedUrl`; for a sub-frame the frame handle is now stale, so abandon the frame
   ([lib/crawler/scanner.ts:179-183](lib/crawler/scanner.ts#L179-L183)).
4. **Visibility, with restoration** — if the element isn't visible *and* an earlier click
   modified the page in place (`pageDirty`), reload `pinnedUrl` and re-resolve, so
   siblings hidden by a prior interaction are still reachable
   ([lib/crawler/scanner.ts:191-199](lib/crawler/scanner.ts#L191-L199)). Still invisible
   → skip ([lib/crawler/scanner.ts:200](lib/crawler/scanner.ts#L200)).
5. **Identity check** — see [dedup layer 3](#3-interaction-identity-per-control) below.
6. **Repeat cap** — see [dedup layer 4](#4-structural-signature-cap-per-page-load) below.
7. **Hash the DOM, click, wait 500 ms** —
   [lib/crawler/scanner.ts:235-243](lib/crawler/scanner.ts#L235-L243). The hash is a
   simple `djb2`-style rolling hash of `document.body.innerHTML`.
8. **Did the top URL change?**
   ([lib/crawler/scanner.ts:248](lib/crawler/scanner.ts#L248)) — if yes, the click was a
   navigation in disguise:
   - **Main frame** → hand the destination to the crawl queue via the `enqueue` callback,
     which applies scope and dedup ([lib/crawler/scanner.ts:253-257](lib/crawler/scanner.ts#L253-L257)).
   - **Sub-frame** → an embedded tool tried to take over the tab; just revert
     ([lib/crawler/scanner.ts:258-261](lib/crawler/scanner.ts#L258-L261)).
   - Either way: `goBack`, falling back to an explicit `goto(pinnedUrl)` if that didn't
     land ([lib/crawler/scanner.ts:262-267](lib/crawler/scanner.ts#L262-L267)); sub-frames
     then break out entirely because the frame handle is stale
     ([lib/crawler/scanner.ts:269](lib/crawler/scanner.ts#L269)).
9. **Did the DOM change?** Re-hash and compare
   ([lib/crawler/scanner.ts:273-284](lib/crawler/scanner.ts#L273-L284)). Identical hash →
   the click did nothing observable → discard, no scan.
10. **A new state exists.** Mark the page dirty
    ([lib/crawler/scanner.ts:287](lib/crawler/scanner.ts#L287)), run a full axe scan, and
    record it under a synthetic URL of the form `<url> (clicked "<label>")`
    ([lib/crawler/scanner.ts:289-291](lib/crawler/scanner.ts#L289-L291)) — that string is
    how interaction states appear in reports.
11. **Recurse** into whatever the click revealed, one level deeper, sharing the same
    budget and dedup set ([lib/crawler/scanner.ts:297-298](lib/crawler/scanner.ts#L297-L298)).
12. **Press `Escape`** to close whatever opened, then continue
    ([lib/crawler/scanner.ts:300-301](lib/crawler/scanner.ts#L300-L301)).

Any error on a single element is logged and skipped rather than aborting the frame
([lib/crawler/scanner.ts:303-306](lib/crawler/scanner.ts#L303-L306)).

### Multi-pass re-scanning

The whole element sweep is wrapped in an outer pass loop
([lib/crawler/scanner.ts:150](lib/crawler/scanner.ts#L150)). After a sweep finishes, the
DOM is re-queried, because clicking can reveal new top-level controls that didn't exist
when the list was built. The loop exits when a pass clicks nothing new
(`progressed === 0`, [lib/crawler/scanner.ts:310](lib/crawler/scanner.ts#L310)).

`MAX_PASSES = 100` ([lib/crawler/scanner.ts:148](lib/crawler/scanner.ts#L148)) is a
backstop, not the real bound — termination is guaranteed by the crawl-wide dedup set and
the per-signature cap, since every pass either clicks something never clicked before or
ends the loop.

---

## Deduplication: the four independent layers

This is where most of the crawler's intelligence lives.

### 1. Canonical URL (per crawl)

Query strings are stripped ([lib/crawler/urlUtils.ts:20-22](lib/crawler/urlUtils.ts#L20-L22))
and the result is the key in the `visited` set
([lib/crawler/index.ts:78-88](lib/crawler/index.ts#L78-L88)). So `/page?a=1` and
`/page?a=2` are one page.

### 2. Route pattern + DOM hash (skips whole scans)

`getRoutePattern` ([lib/crawler/urlUtils.ts:39-55](lib/crawler/urlUtils.ts#L39-L55))
collapses UUIDs and runs of 4+ digits into `:id`
([lib/crawler/urlUtils.ts:1-4](lib/crawler/urlUtils.ts#L1-L4)), drops the query string,
and folds SPA route hashes (`#/...`) into the pattern so client-side routes group
separately instead of collapsing onto the base path
([lib/crawler/urlUtils.ts:50-53](lib/crawler/urlUtils.ts#L50-L53)).

The crawler then stores one DOM hash per pattern
([lib/crawler/index.ts:36](lib/crawler/index.ts#L36)). If the current page's hash equals
the stored hash for its pattern, **both the axe scan and all interactions are skipped**
([lib/crawler/index.ts:163-166](lib/crawler/index.ts#L163-L166)). This is what stops 500
near-identical `/course/1234` pages from producing 500 identical reports.

The hash is computed across **all frames combined**
(`hashAllFrames`, [lib/crawler/index.ts:15-27](lib/crawler/index.ts#L15-L27)), so a page
differing only inside an iframe is still recognized as new.

### 3. Interaction identity (per control)

Each control gets a key ([lib/crawler/scanner.ts:208-211](lib/crawler/scanner.ts#L208-L211)),
and the shape of that key depends on where the control sits:

- Inside `header`, `nav`, `footer`, or their ARIA equivalents
  ([lib/crawler/scanner.ts:204-206](lib/crawler/scanner.ts#L204-L206)) → keyed as
  `GLOBAL|<tag>:<text>`, i.e. **clicked once for the entire crawl**. Site chrome is the
  same everywhere; there's no value in opening the same nav menu on all 300 pages.
- Anywhere else → keyed as `<routePattern>|<tag>:<text>`, i.e. once per route *pattern*.

The set is threaded through the whole crawl
([lib/crawler/index.ts:35](lib/crawler/index.ts#L35)), so it survives across pages and
across recursion levels.

### 4. Structural signature cap (per page load)

A second, coarser key: `<scope>|<tag>|<selector with all digits → #>`, built at
[lib/crawler/scanner.ts:218](lib/crawler/scanner.ts#L218) using `normalizeSignature`
([lib/crawler/urlUtils.ts:35-37](lib/crawler/urlUtils.ts#L35-L37)). It deliberately
**ignores the visible text**, so structurally identical controls that differ only by a
number collapse into one group, capped at `maxRepeatedInteractions` (default 3)
([lib/crawler/scanner.ts:219-225](lib/crawler/scanner.ts#L219-L225)).

This is the calendar guard: 31 day cells share a signature, so 3 get sampled and the rest
are skipped. Counts live in the `InteractionBudget`
([lib/crawler/scanner.ts:15-18](lib/crawler/scanner.ts#L15-L18)), created once at the
top-level call and shared down the recursion
([lib/crawler/scanner.ts:127](lib/crawler/scanner.ts#L127)) so the cap applies to the
entire interaction tree for that page load.

---

## Frames and embedded tools

Interaction runs against **every frame with an http(s) URL**, not just the top document
([lib/crawler/index.ts:175](lib/crawler/index.ts#L175)); the same filter builds the frame
list used for hashing ([lib/crawler/index.ts:134](lib/crawler/index.ts#L134)).

The design rule, stated in the comment at
[lib/crawler/index.ts:128-133](lib/crawler/index.ts#L128-L133): an embedded tool's URLs
are **never queued for top-level navigation**. The tool is explored by clicking around
inside its iframe in place, so the browser's address bar stays on the scoped page.
Link harvesting therefore reads only the main frame
([lib/crawler/index.ts:149](lib/crawler/index.ts#L149)).

Sub-frames get stricter handling throughout, because a top-level navigation invalidates
the frame handle: `isSubFrame` ([lib/crawler/scanner.ts:136](lib/crawler/scanner.ts#L136))
gates the early breaks at [lib/crawler/scanner.ts:182](lib/crawler/scanner.ts#L182) and
[lib/crawler/scanner.ts:269](lib/crawler/scanner.ts#L269), and the page-restoration path
is limited to top-level, depth-0 scanning
([lib/crawler/scanner.ts:191-192](lib/crawler/scanner.ts#L191-L192)). A detached frame
during collection ends that frame's scan quietly
([lib/crawler/scanner.ts:153-154](lib/crawler/scanner.ts#L153-L154)).

---

## Termination and safety limits

| Limit | Effect | Location |
|---|---|---|
| `maxPages` | Caps distinct URLs visited | [lib/crawler/index.ts:54](lib/crawler/index.ts#L54) |
| `timeout` | Checked between pages; stops cleanly and keeps results | [lib/crawler/index.ts:52](lib/crawler/index.ts#L52), [56-60](lib/crawler/index.ts#L56-L60) |
| Hard backstop | `timeout + 3 min`, `process.exit(1)`; only for a hung page op, cannot save partial work | [lib/crawler/run.ts:23-28](lib/crawler/run.ts#L23-L28) |
| `maxInteractionDepth` | Recursion depth per page (default 3) | [lib/crawler/scanner.ts:121](lib/crawler/scanner.ts#L121) |
| `maxInteractionsPerPage` | Total clicks per page load | [lib/crawler/scanner.ts:161-164](lib/crawler/scanner.ts#L161-L164) |
| `maxRepeatedInteractions` | Clicks per structural signature (default 3) | [lib/crawler/scanner.ts:220](lib/crawler/scanner.ts#L220) |
| `MAX_PASSES` | 100 re-scan passes per frame (backstop only) | [lib/crawler/scanner.ts:148](lib/crawler/scanner.ts#L148) |
| Stop file | Checked at page loop, interaction entry, and per element | [index.ts:55](lib/crawler/index.ts#L55), [scanner.ts:122](lib/crawler/scanner.ts#L122), [scanner.ts:160](lib/crawler/scanner.ts#L160) |

Fatal conditions break the loop rather than continuing: a closed browser
([lib/crawler/index.ts:185-189](lib/crawler/index.ts#L185-L189)) and DNS/connection
failures ([lib/crawler/index.ts:190-194](lib/crawler/index.ts#L190-L194)). Any other
error is logged and the crawl moves to the next URL
([lib/crawler/index.ts:195](lib/crawler/index.ts#L195)).

Every run ends by recording *why* it ended
([lib/crawler/index.ts:199-204](lib/crawler/index.ts#L199-L204)) and printing a summary
that distinguishes "queue fully drained" from "stopped with N URLs still queued"
([lib/crawler/index.ts:206-213](lib/crawler/index.ts#L206-L213)). Per-frame interaction
stats are logged at [lib/crawler/scanner.ts:313-316](lib/crawler/scanner.ts#L313-L316) and
accumulated crawl-wide into the `InteractionTally`
([lib/crawler/scanner.ts:21-33](lib/crawler/scanner.ts#L21-L33), [318-326](lib/crawler/scanner.ts#L318-L326)).

### Watch mode

When `watchMode` is on the browser is headed
([lib/crawler/driver.ts:66](lib/crawler/driver.ts#L66)), clicked elements get a
temporary red outline ([lib/crawler/scanner.ts:68-82](lib/crawler/scanner.ts#L68-L82)),
and the user may take over: if the live browser URL differs from the last URL the crawler
itself navigated to, that manual destination is crawled instead of the queued one, with
scope left unchanged ([lib/crawler/index.ts:66-76](lib/crawler/index.ts#L66-L76),
tracked at [lib/crawler/index.ts:115](lib/crawler/index.ts#L115)).

### Login runs

With `requiresLogin`, a headed browser opens first, the login page itself is scanned
([lib/crawler/driver.ts:34](lib/crawler/driver.ts#L34)), and the crawler polls for a
signal file written by the app when the user confirms they're logged in
([lib/crawler/driver.ts:47](lib/crawler/driver.ts#L47)). Because auth flows usually
redirect, the crawl then **starts from wherever the user actually landed**, not the typed
URL — while leaving scope untouched
([lib/crawler/driver.ts:54-58](lib/crawler/driver.ts#L54-L58)). Cookies carry over to the
headless phase via `storageState`
([lib/crawler/driver.ts:61](lib/crawler/driver.ts#L61), [67](lib/crawler/driver.ts#L67)).

---

## Configuration reference

All of it comes from `CRAWLER_*` environment variables, read in `getConfig`
([lib/crawler/config.ts:17](lib/crawler/config.ts#L17)); real runs are launched by
[lib/scanManager.ts](lib/scanManager.ts).

| Variable | Default | Location |
|---|---|---|
| `CRAWLER_SCOPE` | W3C "before" demo site — deliberately a neutral public fixture, never a real host | [config.ts:24](lib/crawler/config.ts#L24) |
| `CRAWLER_BOUNDARY` / `CRAWLER_START_URL` | Fall back to scope | [config.ts:27-28](lib/crawler/config.ts#L27-L28) |
| `CRAWLER_MAX_PAGES` | `Infinity` | [config.ts:29](lib/crawler/config.ts#L29) |
| `CRAWLER_WATCH_MODE` | on unless `'false'` | [config.ts:30](lib/crawler/config.ts#L30) |
| `CRAWLER_MAX_DEPTH` | `3` | [config.ts:32](lib/crawler/config.ts#L32) |
| `CRAWLER_MAX_INTERACTIONS` | `Infinity` | [config.ts:35](lib/crawler/config.ts#L35) |
| `CRAWLER_MAX_REPEATED` | `3` | [config.ts:36](lib/crawler/config.ts#L36) |
| `CRAWLER_TIMEOUT` | 30 min | [config.ts:37](lib/crawler/config.ts#L37) |
| `CRAWLER_BLOCKED` | Always includes `/logout`, `/delete`, `/remove`, `/signout`, `/sign-out`, `/log-out` — user entries are appended, never replace these | [config.ts:39-42](lib/crawler/config.ts#L39-L42) |
| `CRAWLER_EXCLUDED` | Demo-site defaults | [config.ts:43-47](lib/crawler/config.ts#L43-L47) |

Note that `blockedPatterns` is consumed in two different ways: as a URL substring test
([lib/crawler/urlUtils.ts:6-9](lib/crawler/urlUtils.ts#L6-L9)) and as a button-label test
([lib/crawler/scanner.ts:169-175](lib/crawler/scanner.ts#L169-L175)).

### What a scan produces

`scanPage` ([lib/crawler/scanner.ts:35-66](lib/crawler/scanner.ts#L35-L66)) runs axe with
tags `wcag2a`, `wcag2aa`, `wcag21aa`
([lib/crawler/scanner.ts:36-38](lib/crawler/scanner.ts#L36-L38)) across the whole page
including frames, and additionally counts high-risk element types — tables, forms,
iframes, images, media, dialogs
([lib/crawler/scanner.ts:40-47](lib/crawler/scanner.ts#L40-L47)).

---

## Known discrepancy: the `boundaries` set

The comments at [lib/crawler/index.ts:38-39](lib/crawler/index.ts#L38-L39) and
[lib/crawler/linker.ts:6-8](lib/crawler/linker.ts#L6-L8) describe `boundaries` as a set
that **grows** as embedded tool frames are discovered, so that once the crawler navigates
into a tool's own origin, that tool's pages remain crawlable without wandering into the
host site.

In the current code it never grows. It is initialized with a single element
([lib/crawler/index.ts:40](lib/crawler/index.ts#L40)) and only read — at
[lib/crawler/index.ts:139](lib/crawler/index.ts#L139) and
[lib/crawler/index.ts:149](lib/crawler/index.ts#L149). There is no `boundaries.add` call
anywhere in the codebase.

Practical effect: `boundaries` is functionally identical to `config.crawlBoundary` alone,
and the described "follow links within an embedded tool's origin" behavior is not active.
Nothing misbehaves — the plumbing for multiple boundaries is in place and correct — but
the comments describe an intended capability rather than current behavior. Either the
population step should be added or the comments should be corrected.
