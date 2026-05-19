import type { Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { PageResult } from '../types';
import type { CrawlerConfig } from './config';
import { scanPage, scanInteractiveElements } from './scanner';
import { discoverLinks } from './linker';
import { isBlocked, isExcluded, getCanonicalUrl, getRoutePattern } from './urlUtils';

const PAUSE_FILE = path.join(process.cwd(), '.pause');
const STOP_FILE  = path.join(process.cwd(), '.stop');

async function waitIfPaused(page: Page): Promise<void> {
  if (!fs.existsSync(PAUSE_FILE)) return;
  console.log('  → PAUSED (waiting for resume)');
  while (fs.existsSync(PAUSE_FILE)) {
    await page.waitForTimeout(500);
  }
  console.log('  → RESUMED');
}

export async function crawl(page: Page, config: CrawlerConfig): Promise<PageResult[]> {
  if (fs.existsSync(PAUSE_FILE)) fs.unlinkSync(PAUSE_FILE);
  if (fs.existsSync(STOP_FILE))  fs.unlinkSync(STOP_FILE);

  const visited = new Set<string>();
  const queue: string[] = [config.startUrl];
  const scannedInteractions = new Set<string>();
  const patternHashes = new Map<string, number>();
  const allResults: PageResult[] = [];

  while (queue.length > 0 && visited.size < config.maxPages) {
    if (fs.existsSync(STOP_FILE)) {
      fs.unlinkSync(STOP_FILE);
      console.log('  → Stopped by user');
      break;
    }
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

    await waitIfPaused(page);

    const urlPattern = getRoutePattern(url);
    console.log(`[${visited.size}/${config.maxPages}] Scanning: ${url}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      if (config.watchMode) await page.waitForTimeout(config.slowMo);

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
      if (msg.includes('ERR_NAME_NOT_RESOLVED') || msg.includes('ERR_ADDRESS_UNREACHABLE') || msg.includes('ERR_CONNECTION_REFUSED')) {
        console.log(`  → UNREACHABLE: ${url}`);
        break;
      }
      console.log(`  → ERROR: ${msg.slice(0, 100)}`);
    }
  }

  return allResults;
}
