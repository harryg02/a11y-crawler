'use client';

import { ChevronRight } from 'lucide-react';
import { ScanRecord } from '../../lib/types';

interface HistoryListProps {
  scans: ScanRecord[];
  onSelectScan: (id: string) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function getDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec === 0 ? `${min}m` : `${min}m ${sec}s`;
}

function getTotalViolations(scan: ScanRecord): number {
  return scan.pages.reduce((sum, p) => sum + p.violations.length, 0);
}

export default function HistoryList({ scans, onSelectScan }: HistoryListProps) {
  return (
    <div className="max-w-200 mx-auto py-8 px-4">
      <h1 className="text-3xl font-medium mb-6">History</h1>

      {scans.length === 0 ? (
        <p className="text-gray-400 text-center mt-16">
          No scans yet. Run a crawl to see it here.
        </p>
      ) : (
        <ul className="space-y-3" role="list">
          {scans.map(scan => {
            const total = getTotalViolations(scan);
            return (
              <li key={scan.id}>
                <button
                  type="button"
                  onClick={() => onSelectScan(scan.id)}
                  className="w-full text-left bg-gray-800 border-2 border-gray-600 rounded-md p-4 hover:border-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-950"
                  aria-label={`${getDomain(scan.url)}, scanned ${formatDate(scan.date)}, ${scan.pages.length} pages, ${total} violations`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0 flex items-baseline gap-2">
                      <p className="text-lg font-medium text-white shrink-0">{getDomain(scan.url)}</p>
                      <p className="text-base text-gray-400 truncate">{formatDate(scan.date)}</p>
                    </div>
                    <p className="text-base text-gray-400 shrink-0 text-right">
                      {scan.pages.length} pages · {total} violations · {formatDuration(scan.durationSeconds)}
                    </p>
                    <ChevronRight size={18} className="text-gray-400 shrink-0" aria-hidden="true" />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
