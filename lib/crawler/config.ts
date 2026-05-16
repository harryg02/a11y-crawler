export interface CrawlerConfig {
  scope: string;
  crawlBoundary: string;
  startUrl: string;
  maxPages: number;
  watchMode: boolean;
  slowMo: number;
  maxInteractionDepth: number;
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
    timeout:             process.env.CRAWLER_TIMEOUT ? Number(process.env.CRAWLER_TIMEOUT) : 1_800_000,
    requiresLogin:       process.env.CRAWLER_REQUIRES_LOGIN === 'true',
    blockedPatterns:     [
      '/logout', '/delete', '/remove', '/signout', '/sign-out', '/log-out',
      ...(process.env.CRAWLER_BLOCKED ? JSON.parse(process.env.CRAWLER_BLOCKED) : []),
    ],
    excludedScopes:      process.env.CRAWLER_EXCLUDED
      ? JSON.parse(process.env.CRAWLER_EXCLUDED)
      : [
        'https://www.w3.org/WAI/demos/bad/before/tickets.html',
        'https://www.w3.org/WAI/demos/bad/before/survey.html',
        'https://www.w3.org/WAI/demos/bad/before/reports/',
      ],
  };
}
