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
    <div className="max-w-150 mx-auto py-8 px-4">
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
        <p className="text-sm text-gray-400 mt-1 break-all">{scan.url}</p>
        <p className="text-sm text-gray-400 mt-1">
          {formatDate(scan.date)} · {formatDuration(scan.durationSeconds)}
        </p>
      </div>

      {/* Stats dashboard */}
      <div className="flex gap-4 mb-8 flex-wrap">
        {/* Total */}
        <div className="bg-gray-800 border-2 border-gray-600 rounded-md p-5 min-w-[110px]">
          <p className="text-5xl font-bold text-white tabular-nums">{total}</p>
          <p className="text-sm text-gray-400 mt-1">Total Issues</p>
        </div>

        {/* Severity breakdown */}
        <div className="bg-gray-800 border-2 border-gray-600 rounded-md p-5 flex-1 min-w-[180px]">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">By Severity</p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-red-400">Critical</span>
              <span className="text-white font-medium tabular-nums">{counts.critical}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-orange-400">Serious</span>
              <span className="text-white font-medium tabular-nums">{counts.serious}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-yellow-400">Moderate</span>
              <span className="text-white font-medium tabular-nums">{counts.moderate}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-blue-400">Minor</span>
              <span className="text-white font-medium tabular-nums">{counts.minor}</span>
            </div>
          </div>
        </div>

        {/* WCAG conformance */}
        <div className="bg-gray-800 border-2 border-gray-600 rounded-md p-5 min-w-[160px]">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Violations Found In</p>
          <div className="flex flex-wrap gap-2">
            {wcagLevels.has('A') && <Pill label="WCAG 2.1 A" />}
            {wcagLevels.has('AA') && <Pill label="WCAG 2.1 AA" />}
            {wcagLevels.size === 0 && (
              <span className="text-sm text-gray-400">Best practice only</span>
            )}
          </div>
        </div>
      </div>

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
                      <span className="flex-1 text-sm text-white truncate">{page.url}</span>
                      <span className="text-sm text-amber-400 font-medium tabular-nums shrink-0" aria-hidden="true">
                        {page.violations.length}
                      </span>
                      <ChevronRight size={16} className="text-gray-500 shrink-0" aria-hidden="true" />
                    </div>
                  </button>
                ) : (
                  <div
                    className="bg-gray-800 border-2 border-gray-700 rounded-md p-3 opacity-50"
                    aria-label={`${page.url}: no violations`}
                  >
                    <div className="flex items-center gap-3">
                      <span aria-hidden="true" className="text-green-500 shrink-0 text-base leading-none">✓</span>
                      <span className="flex-1 text-sm text-gray-400 truncate">{page.url}</span>
                      <span className="text-sm text-gray-500 tabular-nums shrink-0" aria-hidden="true">0</span>
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
