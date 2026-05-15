import type { Page } from '@playwright/test';
import type { PageResult } from '../types';
import type { CrawlerConfig } from './config';
import { scanPage, scanInteractiveElements } from './scanner';
import { discoverLinks } from './linker';
import { isExcluded, getCanonicalUrl, getRoutePattern } from './urlUtils';

export async function crawl(page: Page, config: CrawlerConfig): Promise<PageResult[]> {
  const visited = new Set<string>();
  const queue: string[] = [config.startUrl];
  const scannedInteractions = new Set<string>();
  const patternHashes = new Map<string, number>();
  const allResults: PageResult[] = [];

  while (queue.length > 0 && visited.size < config.maxPages) {
    const url = queue.shift()!;
    const urlBase = getCanonicalUrl(url);
    if (visited.has(urlBase)) continue;
    if (isExcluded(url, config.excludedScopes)) {
      console.log(`  → SKIPPED (excluded scope): ${url}`);
      continue;
    }
    visited.add(urlBase);

    const urlPattern = getRoutePattern(url);
    console.log(`[${visited.size}/${config.maxPages}] Scanning: ${url}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(config.slowMo);

      const links = await discoverLinks(page, config);
      for (const link of links) {
        const linkBase = getCanonicalUrl(link);
        if (!visited.has(linkBase) && !queue.some(q => getCanonicalUrl(q) === linkBase)) {
          console.log(`    + queued: ${link}`);
          queue.push(link);
        }
      }
      console.log(`  → ${links.length} links found, ${queue.length} in queue`);

      const domHash = await page.evaluate(() => {
        let hash = 0;
        const str = document.body.innerHTML;
        for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
        return hash;
      });

      if (patternHashes.has(urlPattern) && patternHashes.get(urlPattern) === domHash) {
        console.log(`  → Same DOM as previous ${urlPattern} — skipping Axe/Interactive scans`);
        continue;
      }
      patternHashes.set(urlPattern, domHash);

      const result = await scanPage(page);
      allResults.push(result);
      console.log(`  → ${result.violations.length} violations`);

      const interactiveResults = await scanInteractiveElements(page, scannedInteractions, config);
      allResults.push(...interactiveResults);

    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('browser has been closed') || msg.includes('Target closed')) {
        console.log('  → FATAL: Browser closed. Ending crawl.');
        break;
      }
      console.log(`  → ERROR: ${(err as Error).message.slice(0, 100)}`);
    }
  }

  return allResults;
}
