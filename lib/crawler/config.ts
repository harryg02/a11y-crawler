export interface CrawlerConfig {
  scope: string;
  crawlBoundary: string;
  startUrl: string;
  maxPages: number;
  watchMode: boolean;
  slowMo: number;
  /** Pause per clicked control so a watching user can see it highlighted.
   *  0 (the default) means no highlight and no pause. */
  highlightMs: number;
  maxInteractionDepth: number;
  maxInteractionsPerPage: number;
  maxRepeatedInteractions: number;
  timeout: number;
  requiresLogin: boolean;
  /** Stable id shared with scanManager, so crawl state can be resumed. */
  scanId: string;
  /** Continue a previous run of scanId instead of starting fresh. */
  resume: boolean;
  /** Consecutive page failures tolerated before the crawl pauses as resumable. */
  maxConsecutiveFailures: number;
  blockedPatterns: string[];
  excludedScopes: string[];
}

export function getConfig(): CrawlerConfig {
  // Every real run is launched by scanManager, which always sets CRAWLER_SCOPE
  // from the form (see lib/scanManager.ts). This fallback only applies when the
  // crawler is run bare (e.g. `npx playwright test tests/crawler.spec.ts` with no
  // env), so it must be a neutral, public accessibility test fixture - never a
  // real institutional host, which would make an unconfigured run point at
  // production infrastructure.
  const scope = process.env.CRAWLER_SCOPE ?? 'https://www.w3.org/WAI/demos/bad/before/home.html';
  return {
    scope,
    crawlBoundary:       process.env.CRAWLER_BOUNDARY ?? scope,
    startUrl:            process.env.CRAWLER_START_URL ?? scope,
    maxPages:            process.env.CRAWLER_MAX_PAGES ? Number(process.env.CRAWLER_MAX_PAGES) : Infinity,
    watchMode:           process.env.CRAWLER_WATCH_MODE !== 'false',
    slowMo:              process.env.CRAWLER_SLOW_MO ? Number(process.env.CRAWLER_SLOW_MO) : 100,
    // Off by default. Watch Mode is now the default (headless gets served bot
    // challenges), so this used to cost 400ms on EVERY click — minutes across a
    // large scan — purely for a visual flourish. Set CRAWLER_HIGHLIGHT_MS to
    // re-enable it when demoing.
    highlightMs:         process.env.CRAWLER_HIGHLIGHT_MS ? Number(process.env.CRAWLER_HIGHLIGHT_MS) : 0,
    maxInteractionDepth: process.env.CRAWLER_MAX_DEPTH ? Number(process.env.CRAWLER_MAX_DEPTH) : 3,
    // Backstop against runaway interaction loops (e.g. clicking every cell of a
    // calendar/table). Per page: total clicks, and clicks of one repeated control.
    maxInteractionsPerPage:  process.env.CRAWLER_MAX_INTERACTIONS ? Number(process.env.CRAWLER_MAX_INTERACTIONS) : Infinity,
    maxRepeatedInteractions: process.env.CRAWLER_MAX_REPEATED ? Number(process.env.CRAWLER_MAX_REPEATED) : 3,
    timeout:             process.env.CRAWLER_TIMEOUT ? Number(process.env.CRAWLER_TIMEOUT) : 1_800_000,
    requiresLogin:       process.env.CRAWLER_REQUIRES_LOGIN === 'true',
    scanId:              process.env.CRAWLER_SCAN_ID ?? `scan-${Date.now()}`,
    resume:              process.env.CRAWLER_RESUME === 'true',
    maxConsecutiveFailures: process.env.CRAWLER_MAX_CONSECUTIVE_FAILURES
      ? Number(process.env.CRAWLER_MAX_CONSECUTIVE_FAILURES) : 5,
    blockedPatterns:     [
      '/logout', '/delete', '/remove', '/signout', '/sign-out', '/log-out',
      ...(process.env.CRAWLER_BLOCKED ? (() => { try { return JSON.parse(process.env.CRAWLER_BLOCKED!); } catch { return []; } })() : []),
    ],
    excludedScopes:      (() => { try { return process.env.CRAWLER_EXCLUDED ? JSON.parse(process.env.CRAWLER_EXCLUDED) : null; } catch { return null; } })() ?? [
        'https://www.w3.org/WAI/demos/bad/before/tickets.html',
        'https://www.w3.org/WAI/demos/bad/before/survey.html',
        'https://www.w3.org/WAI/demos/bad/before/reports/',
      ],
  };
}
