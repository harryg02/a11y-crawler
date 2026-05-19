export interface ParsedPageUrl {
  baseUrl: string;
  interaction: string | null;
}

function sanitize(label: string): string | null {
  const cleaned = label.replace(/[a-z]+(?:_[a-z]+)+/g, '').replace(/\s+/g, ' ').trim();
  // Discard empty labels or raw HTML tag remnants (e.g. "<div>")
  if (!cleaned || cleaned.startsWith('<')) return null;
  return cleaned;
}

export function parsePageUrl(url: string): ParsedPageUrl {
  // New format: "https://... (clicked "Label")"
  const newMatch = url.match(/^(.+?) \(clicked "(.+)"\)$/);
  if (newMatch) return { baseUrl: newMatch[1], interaction: sanitize(newMatch[2]) };

  // Legacy format: "https://... → <button> "Label""  (old reports on disk)
  const arrowIdx = url.indexOf(' → ');
  if (arrowIdx === -1) return { baseUrl: url, interaction: null };
  const baseUrl = url.slice(0, arrowIdx);
  const rest = url.slice(arrowIdx + 3);
  const match = rest.match(/^<[^>]+>\s*"(.+)"$/);
  return { baseUrl, interaction: sanitize(match ? match[1] : rest) };
}
