export interface ParsedPageUrl {
  baseUrl: string;
  interaction: string | null;
}

export function parsePageUrl(url: string): ParsedPageUrl {
  // New format: "https://... (clicked "Label")"
  const newMatch = url.match(/^(.+?) \(clicked "(.+)"\)$/);
  if (newMatch) return { baseUrl: newMatch[1], interaction: newMatch[2] };

  // Legacy format: "https://... → <button> "Label""  (old reports on disk)
  const arrowIdx = url.indexOf(' → ');
  if (arrowIdx === -1) return { baseUrl: url, interaction: null };
  const baseUrl = url.slice(0, arrowIdx);
  const rest = url.slice(arrowIdx + 3);
  const match = rest.match(/^<[^>]+>\s*"(.+)"$/);
  const raw = match ? match[1] : rest;
  // Strip icon ligature text left in old data
  return { baseUrl, interaction: raw.replace(/[a-z]+(?:_[a-z]+)+/g, '').replace(/\s+/g, ' ').trim() };
}
