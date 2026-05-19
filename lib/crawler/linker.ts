import type { Page } from '@playwright/test';
import type { CrawlerConfig } from './config';
import { isBlocked, isExcluded } from './urlUtils';

export async function discoverLinks(page: Page, config: CrawlerConfig): Promise<string[]> {
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .map(a => (a as HTMLAnchorElement).href)
  );

  return [...new Set(
    hrefs.filter(href =>
      (href === config.crawlBoundary || href.startsWith(config.crawlBoundary.replace(/\/?$/, '/'))) &&
      !href.includes('#') &&
      !href.startsWith('mailto:') &&
      !href.startsWith('tel:') &&
      !isBlocked(href, config.blockedPatterns) &&
      !isExcluded(href, config.excludedScopes)
    )
  )];
}
