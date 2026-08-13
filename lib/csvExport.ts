import { ScanRecord } from './types';
import { parsePageUrl } from '../app/components/parsePageUrl';

function escapeCsv(value: string | undefined | null): string {
  if (!value) return '';
  const stringValue = String(value);
  // If the value contains quotes, commas, or newlines, it must be enclosed in quotes
  // and any internal quotes must be doubled up.
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export interface ScanRow {
  url: string;
  action: string;
  error: string;
  wcag: string;
  element: string;
  selector: string;
  fix: string;
  impact: string;
}

export function buildScanRows(scan: ScanRecord): ScanRow[] {
  const rows: ScanRow[] = [];

  // Dedup within each page (its base URL plus all its interaction states): the
  // crawler re-scans the whole page after every click, so a persistent element
  // that fails a rule gets re-reported in every state. Show it once. Identity is
  // rule id + selector — the element's stable identity — rather than its HTML,
  // which can change between states (e.g. a button whose label flips
  // "View Issues"/"Hide Issues"). Scoped per base URL, so the same element on a
  // different route still reports on its own. Non-destructive: the saved scan is
  // untouched; this only affects the table and CSV built from it.
  const seenByPage = new Map<string, Set<string>>();

  for (const page of scan.pages) {
    const { baseUrl, interaction } = parsePageUrl(page.url);
    const actionText = interaction ? `clicked "${interaction}"` : '';

    let seen = seenByPage.get(baseUrl);
    if (!seen) { seen = new Set<string>(); seenByPage.set(baseUrl, seen); }

    for (const violation of page.violations) {
      const impactLabel = violation.impact.charAt(0).toUpperCase() + violation.impact.slice(1);
      const errorText = `${impactLabel}: ${violation.help}`;
      const wcagText = violation.wcagTags ? violation.wcagTags.join(', ') : '';

      for (const node of violation.nodes) {
        const key = JSON.stringify([violation.id, node.selector]);
        if (seen.has(key)) continue; // same element + rule already shown for this page
        seen.add(key);

        rows.push({
          url: baseUrl,
          action: actionText,
          error: errorText,
          wcag: wcagText,
          element: node.html,
          selector: node.selector,
          fix: node.failureSummary,
          impact: violation.impact,
        });
      }
    }
  }

  return rows;
}

export function exportScanToCsv(scan: ScanRecord) {
  const headers = ['URL', 'Action', 'Error', 'WCAG', 'Element', 'Selector', 'Fix'];
  const rows = buildScanRows(scan);

  // Create CSV string
  const csvContent = [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => [
      row.url, row.action, row.error, row.wcag, row.element, row.selector, row.fix
    ].map(escapeCsv).join(','))
  ].join('\n');

  // Trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  
  // Format filename: a11y-report-domain.com-2026-05-27.csv
  const domain = (() => { try { return new URL(scan.url).hostname; } catch { return 'scan'; } })();
  const dateStr = new Date(scan.date).toISOString().split('T')[0];
  link.setAttribute('download', `a11y-report-${domain}-${dateStr}.csv`);
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
