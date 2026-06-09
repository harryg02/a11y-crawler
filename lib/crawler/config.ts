export interface CrawlerConfig {
  scope: string;
  crawlBoundary: string;
  startUrl: string;
  maxPages: number;
  watchMode: boolean;
  slowMo: number;
  maxInteractionDepth: number;
  maxInteractionsPerPage: number;
  maxRepeatedInteractions: number;
  timeout: number;
  requiresLogin: boolean;
  blockedPatterns: string[];
  excludedScopes: string[];
}

export function getConfig(): CrawlerConfig {
  const scope = process.env.CRAWLER_SCOPE ?? 'https://umitstest.h5p.com/content';
  return {
    scope,
    crawlBoundary:       process.env.CRAWLER_BOUNDARY ?? scope,
    startUrl:            process.env.CRAWLER_START_URL ?? scope,
    maxPages:            process.env.CRAWLER_MAX_PAGES ? Number(process.env.CRAWLER_MAX_PAGES) : Infinity,
    watchMode:           process.env.CRAWLER_WATCH_MODE !== 'false',
    slowMo:              process.env.CRAWLER_SLOW_MO ? Number(process.env.CRAWLER_SLOW_MO) : 100,
    maxInteractionDepth: process.env.CRAWLER_MAX_DEPTH ? Number(process.env.CRAWLER_MAX_DEPTH) : 3,
    // Backstop against runaway interaction loops (e.g. clicking every cell of a
    // calendar/table). Per page: total clicks, and clicks of one repeated control.
    maxInteractionsPerPage:  process.env.CRAWLER_MAX_INTERACTIONS ? Number(process.env.CRAWLER_MAX_INTERACTIONS) : 40,
    maxRepeatedInteractions: process.env.CRAWLER_MAX_REPEATED ? Number(process.env.CRAWLER_MAX_REPEATED) : 3,
    timeout:             process.env.CRAWLER_TIMEOUT ? Number(process.env.CRAWLER_TIMEOUT) : 1_800_000,
    requiresLogin:       process.env.CRAWLER_REQUIRES_LOGIN === 'true',
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
