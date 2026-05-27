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

export function exportScanToCsv(scan: ScanRecord) {
  const headers = ['URL', 'Action', 'Error', 'Element', 'Selector', 'Fix'];
  const rows: string[][] = [];

  for (const page of scan.pages) {
    const { baseUrl, interaction } = parsePageUrl(page.url);
    const actionText = interaction ? `clicked "${interaction}"` : '';

    for (const violation of page.violations) {
      // Capitalize first letter of impact (e.g. "Serious")
      const impactLabel = violation.impact.charAt(0).toUpperCase() + violation.impact.slice(1);
      const errorText = `${impactLabel}: ${violation.help}`;

      for (const node of violation.nodes) {
        rows.push([
          baseUrl,
          actionText,
          errorText,
          node.html,
          node.selector,
          node.failureSummary
        ]);
      }
    }
  }

  // Create CSV string
  const csvContent = [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => row.map(escapeCsv).join(','))
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
