import type { Page, Frame } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { PageResult } from '../types';
import type { CrawlerConfig } from './config';
import { scanPage, scanInteractiveElements } from './scanner';
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

  while (queue.length > 0 && visited.size < config.maxPages) {
    if (await checkpoint(page) === 'stop') break;

    const url = queue.shift()!;
    const urlBase = getCanonicalUrl(url);
    if (visited.has(urlBase)) continue;
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

      const links = await discoverLinks(page.mainFrame(), config, [...boundaries]);
      for (const link of links) {
        const linkBase = getCanonicalUrl(link);
        if (!visited.has(linkBase) && !queue.some(q => getCanonicalUrl(q) === linkBase)) {
          console.log(`    + queued: ${link}`);
          queue.push(link);
        }
      }
      console.log(`  → ${links.length} in-scope links found (main frame), ${queue.length} in queue`);

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
        const interactiveResults = await scanInteractiveElements(page, frame, scannedInteractions, config, 0);
        allResults.push(...interactiveResults);
      }

    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('browser has been closed') || msg.includes('Target closed')) {
        console.log('  → FATAL: Browser closed. Ending crawl.');
        break;
      }
      if (msg.includes('ERR_NAME_NOT_RESOLVED') || msg.includes('ERR_ADDRESS_UNREACHABLE') || msg.includes('ERR_CONNECTION_REFUSED')) {
        console.log(`  → UNREACHABLE: ${url}`);
        break;
      }
      console.log(`  → ERROR: ${msg.slice(0, 100)}`);
    }
  }

  return allResults;
}
