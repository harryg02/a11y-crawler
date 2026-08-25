import type { Page, Frame } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { PageResult } from '../types';
import type { CrawlerConfig } from './config';
import { scanPage, scanInteractiveElements, newInteractionTally } from './scanner';
import { discoverLinks } from './linker';
import { isBlocked, isExcluded, getCanonicalUrl, getRoutePattern, isFragmentAnchor } from './urlUtils';
import { checkpoint, PAUSE_FILE, STOP_FILE } from './checkpoint';
import type { CrawlState } from './state';



// Combined DOM hash across all frames, so a change confined to an embedded
// iframe still produces a different hash from a previously seen page.
async function hashAllFrames(frames: Frame[]): Promise<number> {
  let combined = 0;
  for (const frame of frames) {
    const h = await frame.evaluate(() => {
      let hash = 0;
      const str = document.body?.innerHTML ?? '';
      for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
      return hash;
    }).catch(() => 0);
    combined = ((combined << 5) - combined + h) | 0;
  }
  return combined;
}

/**
 * Errors that mean "this one page is bad", not "the environment is broken".
 * Only these let the crawl carry on to the next URL.
 *
 * The default is deliberately the other way round from how this used to work.
 * It previously listed the FATAL errors and continued on anything unrecognised,
 * so a failure nobody had anticipated - a laptop suspending mid-crawl throws
 * net::ERR_INTERNET_DISCONNECTED, which was not on the list - silently drained
 * the whole queue in seconds, reported "all discovered in-scope pages scanned",
 * and exited 0. The run looked successful while having scanned almost nothing.
 *
 * Now anything not listed here pauses the crawl instead, leaving saved state
 * behind so it can be resumed once the machine is back.
 */
const PAGE_LOCAL_ERRORS = [
  'net::ERR_ABORTED',            // navigation superseded, or the link was a download
  'net::ERR_BLOCKED_BY_CLIENT',
  'net::ERR_BLOCKED_BY_RESPONSE',
  'net::ERR_UNSAFE_REDIRECT',
  'net::ERR_INVALID_URL',
  'net::ERR_UNKNOWN_URL_SCHEME',
  'Execution context was destroyed',  // the page navigated while we scanned it
  'frame was detached',
  'Frame was detached',
  'Timeout',                     // one slow page; a network-wide stall is caught
                                 // by the consecutive-failure breaker below
];

export interface CrawlOutcome {
  results: PageResult[];
  /** True when the crawl stopped because the environment broke, so the saved
   *  state should be kept and offered back to the user as resumable. */
  aborted: boolean;
  endReason: string;
}

export async function crawl(page: Page, config: CrawlerConfig, state?: CrawlState): Promise<CrawlOutcome> {
  if (fs.existsSync(PAUSE_FILE)) fs.unlinkSync(PAUSE_FILE);
  if (fs.existsSync(STOP_FILE))  fs.unlinkSync(STOP_FILE);

  // Resuming rehydrates the frontier and the results already collected, so the
  // loop re-enters exactly where the previous process died. The in-memory
  // structures remain the working copy; every mutation below is mirrored into
  // `state` so the next process can rebuild them.
  const snap = config.resume && state ? state.load() : null;
  if (snap) {
    console.log(`  → Resuming ${config.scanId}: ${snap.visited.length} page(s) done, ${snap.queue.length} queued, ${snap.results.length} result(s) recovered`);
    if (snap.boundary) config.crawlBoundary = snap.boundary;
  }

  const visited = new Set<string>(snap?.visited ?? []);
  const queue: string[] = snap && snap.queue.length ? [...snap.queue] : [config.startUrl];
  const scannedInteractions = new Set<string>(snap?.interactions ?? []);
  const patternHashes = new Map<string, number>(snap?.routeHashes ?? []);
  const allResults: PageResult[] = snap ? [...snap.results] : [];
  // In-scope prefixes. Grows as we discover embedded tool frames so that, once
  // we navigate into the tool's own origin, its pages stay crawlable too.
  const boundaries = new Set<string>(
    snap && snap.boundaries.length ? snap.boundaries : [config.crawlBoundary]
  );
  if (!snap) {
    state?.addBoundary(config.crawlBoundary);
    state?.enqueue(config.startUrl, getCanonicalUrl(config.startUrl));
  }
  let endReason = '';
  // Set when the crawl stops for an environmental reason rather than finishing.
  let aborted = false;
  // Reset by any successful navigation. Guards against an error string nobody
  // classified turning into a silent queue drain.
  let consecutiveFailures = 0;
  // Watch mode: the last URL the crawler itself navigated to. If the live
  // browser URL differs at the top of an iteration, the user typed a new
  // address, and we crawl from there instead of the queued URL.
  let lastControlledUrl = '';
  // Crawl-wide interaction totals, for the final completion summary.
  const tally = newInteractionTally();

  // Wall-clock budget. Checked between pages so that when time runs out the
  // crawl stops *cleanly* - the pages gathered so far are returned and written
  // to a report - instead of the process being hard-killed and the run lost.
  const deadline = Date.now() + config.timeout;

  while (queue.length > 0 && visited.size < config.maxPages) {
    if (await checkpoint(page) === 'stop') { endReason = 'stopped by user'; break; }
    if (Date.now() > deadline) {
      endReason = `time budget reached (${Math.round(config.timeout / 60000)} min) - saving results collected so far`;
      console.log(`  → ${endReason}`);
      break;
    }

    // Watch mode: if the user manually navigated the browser to a new address
    // since the last page, crawl that current location instead of the queued
    // URL. Scope/boundary is unchanged, so an out-of-scope address is scanned
    // once and its links are not followed.
    let url: string;
    let manualNav = false;
    const live = page.url();
    if (config.watchMode && lastControlledUrl && /^https?:/.test(live)
        && getCanonicalUrl(live) !== getCanonicalUrl(lastControlledUrl)) {
      url = live;
      manualNav = true;
      console.log(`  → Manual navigation detected - crawling current location: ${live} (scope unchanged)`);
    } else {
      url = queue.shift()!;
    }

    const urlBase = getCanonicalUrl(url);
    if (!manualNav && visited.has(urlBase)) continue;
    if (isBlocked(url, config.blockedPatterns)) {
      console.log(`  → SKIPPED (blocked): ${url}`);
      state?.markPage(urlBase, url, 'skipped');
      continue;
    }
    if (isExcluded(url, config.excludedScopes)) {
      console.log(`  → SKIPPED (excluded scope): ${url}`);
      state?.markPage(urlBase, url, 'skipped');
      continue;
    }
    visited.add(urlBase);
    // Recorded as in-flight, not finished: if this process dies partway through
    // the page, a resume puts it back on the queue instead of losing its result.
    state?.markPage(urlBase, url, 'visiting');

    const urlPattern = getRoutePattern(url);
    console.log(`[${visited.size}/${config.maxPages}] Scanning: ${url}`);

    try {
      // A hash-route change on the same document (SPA routing, e.g. #/ -> #/dashboard)
      // doesn't reload the page, so page.goto's load events never fire and the
      // router may not have re-rendered. Drive that case through the address bar
      // and give the router a moment to settle. Otherwise navigate normally.
      // LTI launches and other apps that boot a cross-origin iframe rarely reach
      // 'networkidle', so navigate on 'domcontentloaded' and treat idle as a
      // best-effort settle rather than a hard requirement.
      const sameDocHashNav =
        url.includes('#') && page.url().split('#')[0] === url.split('#')[0] && page.url() !== url;
      let resp: Awaited<ReturnType<typeof page.goto>> = null;
      if (sameDocHashNav) {
        await page.evaluate((u) => { window.location.href = u; }, url);
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(Math.max(config.slowMo, 600));
      } else {
        resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        if (config.watchMode) await page.waitForTimeout(config.slowMo);
      }
      // Bot protection serves a challenge page in place of the site. Left
      // undetected the crawler scans the interstitial and reports it as a
      // successful one-page scan, complete with the challenge's own violations.
      // Needs both signals: a Turnstile frame alone is legitimate on a page that
      // really does embed a captcha.
      if (resp && (resp.status() === 403 || resp.status() === 503)
          && (/just a moment/i.test(await page.title().catch(() => ''))
              || page.frames().some(f => f.url().includes('challenges.cloudflare.com')))) {
        console.log(`  → BLOCKED by bot protection: ${url} returned HTTP ${resp.status()} and a challenge page.`);
        console.log('     Nothing here is the real site, so the crawl is stopping rather than scanning the challenge.');
        console.log('     Turn on Watch Mode — a visible browser is not challenged — or ask for the scanner to be allowlisted.');
        endReason = 'blocked by bot protection — try Watch Mode';
        aborted = true;
        break;
      }

      // Record where the crawler is now, so a different URL at the next
      // iteration is recognised as the user navigating manually.
      lastControlledUrl = page.url();
      // Navigation worked, so whatever went wrong before was not the environment.
      consecutiveFailures = 0;

      // If the start URL redirected to a different origin (e.g. www → non-www),
      // realign crawlBoundary so discovered links aren't filtered out.
      if (visited.size === 1) {
        const actualOrigin = new URL(page.url()).origin;
        const startOrigin  = new URL(url).origin;
        if (actualOrigin !== startOrigin) {
          config.crawlBoundary = config.crawlBoundary.replace(startOrigin, actualOrigin);
          visited.add(getCanonicalUrl(page.url()));
          state?.setBoundary(config.crawlBoundary);
          state?.markPage(getCanonicalUrl(page.url()), page.url(), 'done');
        }
      }

      // Keep every http frame for DOM hashing and in-place interaction, but only
      // follow links from the MAIN frame and only within the configured scope.
      // We never queue an embedded tool's URLs (e.g. an LTI iframe on another
      // origin like yellowdig.app) for top-level navigation, so the browser URL
      // bar stays on the scoped page. The tool is explored by clicking inside
      // its iframe in place (see scanInteractiveElements), not by visiting it.
      const frames = page.frames().filter(f => /^https?:/.test(f.url()));

      // Add an in-scope URL to the crawl queue if new. Used for discovered
      // <a> links and for pages reached by clicking a button/JS navigation.
      const enqueue = (link: string, source = 'link'): boolean => {
        const inScope = [...boundaries].some(b => link === b || link.startsWith(b.replace(/\/?$/, '/')));
        if (!inScope || isFragmentAnchor(link)
            || isBlocked(link, config.blockedPatterns) || isExcluded(link, config.excludedScopes)) return false;
        const base = getCanonicalUrl(link);
        if (visited.has(base) || queue.some(q => getCanonicalUrl(q) === base)) return false;
        queue.push(link);
        state?.enqueue(link, base);
        console.log(`    + queued (${source}): ${link}`);
        return true;
      };

      const links = await discoverLinks(page.mainFrame(), config, [...boundaries]);
      const totalAnchors = await page.mainFrame()
        .evaluate(() => document.querySelectorAll('a[href]').length).catch(() => 0);
      let newlyQueued = 0;
      for (const link of links) if (enqueue(link)) newlyQueued++;
      console.log(`  → links: ${links.length}/${totalAnchors} within scope, ${newlyQueued} newly queued, ${queue.length} now in queue`);
      if (totalAnchors > 0 && links.length === 0) {
        console.log(`     (page has ${totalAnchors} link(s) but none under boundary ${config.crawlBoundary})`);
      }

      // Hash the DOM of all frames so iframe-only changes aren't treated as
      // identical to a previously seen page on the same route pattern.
      const domHash = await hashAllFrames(frames);

      if (patternHashes.has(urlPattern) && patternHashes.get(urlPattern) === domHash) {
        console.log(`  → Same DOM as previous ${urlPattern} - skipping Axe/Interactive scans`);
        state?.markPage(urlBase, url, 'done');
        continue;
      }
      patternHashes.set(urlPattern, domHash);
      state?.setRouteHash(urlPattern, domHash);

      // scanPage runs Axe across the whole page (including frames).
      const result = await scanPage(page);
      allResults.push(result);
      state?.addResult(result);
      console.log(`  → ${result.violations.length} violations`);

      // Interact with clickables in every frame, not just the top document.
      for (const frame of page.frames().filter(f => /^https?:/.test(f.url()))) {
        const interactiveResults = await scanInteractiveElements(
          page, frame, scannedInteractions, config, 0, undefined, tally,
          (navUrl) => enqueue(navUrl, 'click'),
        );
        allResults.push(...interactiveResults);
        for (const r of interactiveResults) state?.addResult(r);
        state?.syncInteractions(scannedInteractions);
      }

      // Page and everything it revealed are durably recorded - safe to skip on
      // a resume.
      state?.markPage(urlBase, url, 'done');

    } catch (err) {
      const msg = (err as Error).message;

      if (msg.includes('browser has been closed') || msg.includes('Target closed')) {
        console.log('  → FATAL: Browser closed. Ending crawl.');
        endReason = 'browser/page closed mid-crawl';
        aborted = true;
        break;
      }

      consecutiveFailures++;
      const pageLocal = PAGE_LOCAL_ERRORS.some(e => msg.includes(e));

      if (!pageLocal) {
        // Unrecognised failure - assume the environment broke (network dropped,
        // machine suspended, browser wedged) rather than plough on. The page is
        // still 'visiting' in the state DB, so a resume retries it.
        console.log(`  → HALTED: ${url}`);
        console.log(`     ${msg.split('\n')[0]}`);
        endReason = `stopped after an unrecoverable error (${msg.split('\n')[0].slice(0, 120)})`;
        aborted = true;
        break;
      }

      console.log(`  → ERROR (${consecutiveFailures}/${config.maxConsecutiveFailures} in a row): ${msg.split('\n')[0]}`);
      if (consecutiveFailures >= config.maxConsecutiveFailures) {
        // Individually survivable errors, but nothing has succeeded in a while:
        // treat it as the environment being down rather than emptying the queue.
        console.log(`  → HALTED: ${consecutiveFailures} page(s) failed in a row without a success.`);
        endReason = `stopped after ${consecutiveFailures} consecutive page failures`;
        aborted = true;
        break;
      }
    }
  }

  const allPagesScanned = queue.length === 0 && endReason === '' && !aborted;
  if (!endReason) {
    endReason = visited.size >= config.maxPages
      ? `reached page limit (maxPages=${config.maxPages})`
      : 'all discovered in-scope pages scanned';
  }

  console.log(`\n══════════════════════════════════`);
  console.log(`CRAWL SUMMARY`);
  console.log(`  Ended because: ${endReason}`);
  console.log(`  Pages scanned: ${visited.size}${allPagesScanned ? ' (queue fully drained - every in-scope page visited)' : `, ${queue.length} still queued (not scanned)`}`);
  console.log(`  Distinct controls clicked: ${tally.clicked}`);
  console.log(`  Scan results collected (pages + interaction states): ${allResults.length}`);
  console.log(`  Finalizing scan...`);
  console.log(`══════════════════════════════════`);

  return { results: allResults, aborted, endReason };
}
