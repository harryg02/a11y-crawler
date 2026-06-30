import type { Page, Frame } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { PageResult } from '../types';
import type { CrawlerConfig } from './config';
import { scanPage, scanInteractiveElements, newInteractionTally } from './scanner';
import { discoverLinks } from './linker';
import { isBlocked, isExcluded, getCanonicalUrl, getRoutePattern } from './urlUtils';
import { checkpoint, PAUSE_FILE, STOP_FILE } from './checkpoint';



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

export async function crawl(page: Page, config: CrawlerConfig): Promise<PageResult[]> {
  if (fs.existsSync(PAUSE_FILE)) fs.unlinkSync(PAUSE_FILE);
  if (fs.existsSync(STOP_FILE))  fs.unlinkSync(STOP_FILE);

  const visited = new Set<string>();
  const queue: string[] = [config.startUrl];
  const scannedInteractions = new Set<string>();
  const patternHashes = new Map<string, number>();
  const allResults: PageResult[] = [];
  // In-scope prefixes. Grows as we discover embedded tool frames so that, once
  // we navigate into the tool's own origin, its pages stay crawlable too.
  const boundaries = new Set<string>([config.crawlBoundary]);
  let endReason = '';
  // Watch mode: the last URL the crawler itself navigated to. If the live
  // browser URL differs at the top of an iteration, the user typed a new
  // address, and we crawl from there instead of the queued URL.
  let lastControlledUrl = '';
  // Crawl-wide interaction totals, for the final completion summary.
  const tally = newInteractionTally();

  while (queue.length > 0 && visited.size < config.maxPages) {
    if (await checkpoint(page) === 'stop') { endReason = 'stopped by user'; break; }

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
      console.log(`  → Manual navigation detected — crawling current location: ${live} (scope unchanged)`);
    } else {
      url = queue.shift()!;
    }

    const urlBase = getCanonicalUrl(url);
    if (!manualNav && visited.has(urlBase)) continue;
    if (isBlocked(url, config.blockedPatterns)) {
      console.log(`  → SKIPPED (blocked): ${url}`);
      continue;
    }
    if (isExcluded(url, config.excludedScopes)) {
      console.log(`  → SKIPPED (excluded scope): ${url}`);
      continue;
    }
    visited.add(urlBase);


    const urlPattern = getRoutePattern(url);
    console.log(`[${visited.size}/${config.maxPages}] Scanning: ${url}`);

    try {
      // LTI launches and other apps that boot a cross-origin iframe rarely reach
      // 'networkidle', so navigate on 'domcontentloaded' and treat idle as a
      // best-effort settle rather than a hard requirement.
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      if (config.watchMode) await page.waitForTimeout(config.slowMo);
      // Record where the crawler is now, so a different URL at the next
      // iteration is recognised as the user navigating manually.
      lastControlledUrl = page.url();

      // If the start URL redirected to a different origin (e.g. www → non-www),
      // realign crawlBoundary so discovered links aren't filtered out.
      if (visited.size === 1) {
        const actualOrigin = new URL(page.url()).origin;
        const startOrigin  = new URL(url).origin;
        if (actualOrigin !== startOrigin) {
          config.crawlBoundary = config.crawlBoundary.replace(startOrigin, actualOrigin);
          visited.add(getCanonicalUrl(page.url()));
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
        if (!inScope || link.includes('#')
            || isBlocked(link, config.blockedPatterns) || isExcluded(link, config.excludedScopes)) return false;
        const base = getCanonicalUrl(link);
        if (visited.has(base) || queue.some(q => getCanonicalUrl(q) === base)) return false;
        queue.push(link);
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
        console.log(`  → Same DOM as previous ${urlPattern} — skipping Axe/Interactive scans`);
        continue;
      }
      patternHashes.set(urlPattern, domHash);

      // scanPage runs Axe across the whole page (including frames).
      const result = await scanPage(page);
      allResults.push(result);
      console.log(`  → ${result.violations.length} violations`);

      // Interact with clickables in every frame, not just the top document.
      for (const frame of page.frames().filter(f => /^https?:/.test(f.url()))) {
        const interactiveResults = await scanInteractiveElements(
          page, frame, scannedInteractions, config, 0, undefined, tally,
          (navUrl) => enqueue(navUrl, 'click'),
        );
        allResults.push(...interactiveResults);
      }

    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('browser has been closed') || msg.includes('Target closed')) {
        console.log('  → FATAL: Browser closed. Ending crawl.');
        endReason = 'browser/page closed mid-crawl';
        break;
      }
      if (msg.includes('ERR_NAME_NOT_RESOLVED') || msg.includes('ERR_ADDRESS_UNREACHABLE') || msg.includes('ERR_CONNECTION_REFUSED')) {
        console.log(`  → UNREACHABLE: ${url}`);
        endReason = `site unreachable (${url})`;
        break;
      }
      console.log(`  → ERROR: ${msg}`);
    }
  }

  const allPagesScanned = queue.length === 0 && endReason === '';
  if (!endReason) {
    endReason = visited.size >= config.maxPages
      ? `reached page limit (maxPages=${config.maxPages})`
      : 'all discovered in-scope pages scanned';
  }

  console.log(`\n══════════════════════════════════`);
  console.log(`CRAWL SUMMARY`);
  console.log(`  Ended because: ${endReason}`);
  console.log(`  Pages scanned: ${visited.size}${allPagesScanned ? ' (queue fully drained — every in-scope page visited)' : `, ${queue.length} still queued (not scanned)`}`);
  console.log(`  Distinct controls clicked: ${tally.clicked}`);
  console.log(`  Scan results collected (pages + interaction states): ${allResults.length}`);
  console.log(`  Finalizing scan...`);
  console.log(`══════════════════════════════════`);

  return allResults;
}
