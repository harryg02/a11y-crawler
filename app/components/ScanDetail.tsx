'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ScanRecord } from './mockHistoryData';
import Pill from './Pill';

interface ScanDetailProps {
  scan: ScanRecord;
  onBack: () => void;
  onSelectPage: (pageId: string) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function getDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec === 0 ? `${min} min` : `${min} min ${sec} sec`;
}

export default function ScanDetail({ scan, onBack, onSelectPage }: ScanDetailProps) {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const wcagLevels = new Set<string>();
  let total = 0;

  for (const page of scan.pages) {
    for (const v of page.violations) {
      total++;
      counts[v.impact]++;
      for (const tag of v.wcagTags) {
        if (tag === 'wcag2aa' || tag === 'wcag21aa') wcagLevels.add('AA');
        else if (tag === 'wcag2a' || tag === 'wcag21a') wcagLevels.add('A');
      }
    }
  }

  const domain = getDomain(scan.url);

  return (
    <div className="max-w-200 mx-auto py-8 px-4">
      {/* Back */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors mb-6 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-950 rounded"
      >
        <ChevronLeft size={18} aria-hidden="true" />
        <span>Back to History</span>
      </button>

      {/* Scan metadata */}
      <div className="mb-6">
        <h1 className="text-3xl font-medium text-white">{domain}</h1>
        <p className="text-base text-gray-400 mt-1 break-all">{scan.url}</p>
        <p className="text-base text-gray-400 mt-1">
          {formatDate(scan.date)} · {formatDuration(scan.durationSeconds)}
        </p>
      </div>

      {/* Stats dashboard */}
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">Scan summary</h2>
        <div className="flex py-8 gap-14 mb-8 flex-wrap">

          {/* Total */}
          <div className="= min-w-[110px]">
            <p className="text-5xl font-bold text-white tabular-nums">{total}</p>
            <h3 className="text-base text-gray-400 mt-1">Total Issues</h3>
          </div>

          {/* Severity breakdown */}
          <div className="flex-1 min-w-[220px]">
            <h3 className="text-sm text-gray-400 uppercase tracking-wide mb-3">By Severity</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2">
              {([
                { label: 'Critical', color: 'text-red-400',    count: counts.critical },
                { label: 'Serious',  color: 'text-orange-400', count: counts.serious  },
                { label: 'Moderate', color: 'text-yellow-400', count: counts.moderate },
                { label: 'Minor',    color: 'text-blue-400',   count: counts.minor    },
              ] as const).map(({ label, color, count }) => (
                <div key={label} className="flex items-baseline gap-1 text-base">
                  <span className={`${color} shrink-0`}>{label}</span>
                  <span className="flex-1 border-b-2 border-dotted border-gray-400 mb-[3px]" aria-hidden="true" />
                  <span className="text-white font-medium tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* WCAG conformance */}
          <div className="min-w-[160px]">
            <h3 className="text-sm text-gray-400 uppercase tracking-wide mb-3">Violations Found In</h3>
            <div className="flex flex-wrap gap-2">
              {wcagLevels.has('A') && <Pill label="WCAG 2.1 A" />}
              {wcagLevels.has('AA') && <Pill label="WCAG 2.1 AA" />}
              {wcagLevels.size === 0 && (
                <span className="text-base text-gray-400">Best practice only</span>
              )}
            </div>
          </div>

        </div>
      </section>

      {/* Pages list */}
      <section aria-labelledby="pages-heading">
        <h2 id="pages-heading" className="text-xl font-medium mb-3">
          Pages Scanned ({scan.pages.length})
        </h2>
        <ul className="space-y-2" role="list">
          {scan.pages.map(page => {
            const hasViolations = page.violations.length > 0;
            return (
              <li key={page.id}>
                {hasViolations ? (
                  <button
                    type="button"
                    onClick={() => onSelectPage(page.id)}
                    aria-label={`${page.url}: ${page.violations.length} violation${page.violations.length === 1 ? '' : 's'}`}
                    className="w-full text-left bg-gray-800 border-2 border-gray-600 rounded-md p-3 hover:border-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-950"
                  >
                    <div className="flex items-center gap-3">
                      <span aria-hidden="true" className="text-amber-400 shrink-0 text-base leading-none">⚠</span>
                      <span className="flex-1 text-base text-white truncate">{page.url}</span>
                      <span className="text-base text-amber-400 font-medium tabular-nums shrink-0" aria-hidden="true">
                        {page.violations.length}
                      </span>
                      <ChevronRight size={16} className="text-gray-500 shrink-0" aria-hidden="true" />
                    </div>
                  </button>
                ) : (
                  <div className="bg-gray-800 border-2 border-gray-700 rounded-md p-3">
                    <div className="flex items-center gap-3">
                      <span aria-hidden="true" className="text-green-500 shrink-0 text-base leading-none">✓</span>
                      <span className="flex-1 text-base text-gray-400 truncate">{page.url}</span>
                      <span className="text-base text-gray-600 tabular-nums shrink-0" aria-hidden="true">0</span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
