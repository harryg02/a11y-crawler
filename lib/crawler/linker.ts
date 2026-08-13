import type { Page, Frame } from '@playwright/test';
import type { CrawlerConfig } from './config';
import { isBlocked, isExcluded, isFragmentAnchor } from './urlUtils';

// `target` may be the top page or an embedded frame (e.g. an LTI tool iframe).
// `boundaries` is the set of in-scope prefixes: the configured crawl boundary
// plus the origin of any embedded tool frame we've discovered, so we crawl
// within the tool (across its own pages) without wandering into the host site.
export async function discoverLinks(
  target: Page | Frame,
  config: CrawlerConfig,
  boundaries: string[],
): Promise<string[]> {
  const hrefs = await target.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .map(a => (a as HTMLAnchorElement).href)
  );

  const inBoundary = (href: string) =>
    boundaries.some(b => href === b || href.startsWith(b.replace(/\/?$/, '/')));

  return [...new Set(
    hrefs.filter(href =>
      inBoundary(href) &&
      !isFragmentAnchor(href) &&  // keep #/route SPA links, drop #section anchors
      !href.startsWith('mailto:') &&
      !href.startsWith('tel:') &&
      !isBlocked(href, config.blockedPatterns) &&
      !isExcluded(href, config.excludedScopes)
    )
  )];
}
