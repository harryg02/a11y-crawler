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
  return `${currentUrl.origin}${pattern}`;
}
