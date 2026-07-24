const ID_PATTERNS = [
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
  /\/\d{4,}\b/g,
];

export function isBlocked(url: string, patterns: string[]): boolean {
  const lower = url.toLowerCase();
  return patterns.some(pattern => pattern && lower.includes(pattern.toLowerCase()));
}

export function isExcluded(url: string, scopes: string[]): boolean {
  return scopes.some(scope => {
    const clean = scope.replace(/\/$/, '');
    return url === clean ||
           url.startsWith(clean + '/') ||
           url.startsWith(clean + '?');
  });
}

export function getCanonicalUrl(url: string): string {
  return url.split('?')[0];
}

// Distinguishes an in-page fragment anchor from a client-side SPA route.
//   #/dashboard, #/         -> a route (crawl it)
//   #section, #top, #       -> a plain fragment anchor (skip it)
// A URL with no '#' is not a fragment anchor.
export function isFragmentAnchor(url: string): boolean {
  const i = url.indexOf('#');
  return i !== -1 && url[i + 1] !== '/';
}

// Collapse digits so that structurally-identical controls that differ only by a
// number/date (calendar days, table rows, paginated items) share one signature.
export function normalizeSignature(s: string): string {
  return s.toLowerCase().replace(/\d+/g, '#');
}

export function getRoutePattern(url: string): string {
  const currentUrl = new URL(url);
  let pattern = currentUrl.pathname;
  for (const regex of ID_PATTERNS) {
    pattern = pattern.replace(regex, ':id');
  }
  currentUrl.search = '';
  // Fold a client-side route hash (#/...) into the pattern so SPA routes group
  // separately in reports and dedup independently, instead of all collapsing to
  // the base path. Plain fragment anchors (#section) are ignored.
  let hash = '';
  if (currentUrl.hash.startsWith('#/')) {
    hash = currentUrl.hash;
    for (const regex of ID_PATTERNS) hash = hash.replace(regex, ':id');
  }
  return `${currentUrl.origin}${pattern}${hash}`;
}
