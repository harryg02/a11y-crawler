'use client';

import { useState } from 'react';
import { ChevronRight, Copy, Check } from 'lucide-react';
import { ScanRecord } from '../../lib/types';
import Pill from './Pill';
import BackBar from './BackBar';
import { parsePageUrl } from './parsePageUrl';

interface ScanDetailProps {
  scan: ScanRecord;
  onBack: () => void;
  onSelectPage: (pageId: string) => void;
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
  if (min === 0) return `${sec} sec`;
  if (sec === 0) return `${min} min`;
  return `${min} min ${sec} sec`;
}

export default function ScanDetail({ scan, onBack, onSelectPage }: ScanDetailProps) {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const wcagLevels = new Set<string>();
  let pagesAffected = 0;

  for (const page of scan.pages) {
    if (page.violations.length > 0) pagesAffected++;
    for (const v of page.violations) {
      counts[v.impact] += v.nodes.length;
      for (const tag of v.wcagTags) {
        if (tag === 'wcag2aa' || tag === 'wcag21aa') wcagLevels.add('AA');
        else if (tag === 'wcag2a' || tag === 'wcag21a') wcagLevels.add('A');
      }
    }
  }

  const totalPages = scan.pages.length;
  const pct = totalPages === 0 ? 0 : Math.round((pagesAffected / totalPages) * 100);
  const domain = getDomain(scan.url);

  return (
    <div>
      <BackBar label="Back to History" onClick={onBack} />

      <div className="max-w-220 mx-auto p-8">
        {/* Scan metadata */}
        <div className="mb-6">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-3xl font-medium text-gray-900 dark:text-white">{domain}</h1>
            <p className="text-base text-gray-600 dark:text-gray-400 break-all">{scan.url}</p>
          </div>
          <div className="text-base text-gray-600 dark:text-gray-400 mt-4 space-y-0.5">
            <p>Completed {formatDate(scan.date)} (took {formatDuration(scan.durationSeconds)})</p>
            {scan.config && (
              <p>Interaction depth: {scan.config.maxDepth ?? 'Default'}</p>
            )}
          </div>
        </div>

        {/* Stats dashboard */}
        <section>
          <div className="flex py-6 gap-14 mb-8 flex-wrap">

            {/* Total */}
            <div className="= min-w-[110px]">
              <p className="text-6xl font-bold text-gray-900 dark:text-white tabular-nums">{pagesAffected}/{totalPages}</p>
              <h3 className="text-base text-gray-600 dark:text-gray-400 mt-1">Pages affected <br /> ({pct}% of all pages)</h3>
            </div>

            {/* Severity breakdown */}
            <div className="flex-1 min-w-[220px]">
              <h3 className="text-sm text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">Elements by Severity</h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                {([
                  { label: 'Critical', color: 'text-red-700 dark:text-red-400', count: counts.critical },
                  { label: 'Serious', color: 'text-orange-700 dark:text-orange-400', count: counts.serious },
                  { label: 'Moderate', color: 'text-yellow-800 dark:text-yellow-400', count: counts.moderate },
                  { label: 'Minor', color: 'text-blue-700 dark:text-blue-400', count: counts.minor },
                ] as const).map(({ label, color, count }) => (
                  <div key={label} className="flex items-baseline gap-1 text-base">
                    <span className={`${color} shrink-0`}>{label}</span>
                    <span className="flex-1 border-b-2 border-dotted border-gray-400 mb-[3px]" aria-hidden="true" />
                    <span className="text-gray-900 dark:text-white font-medium tabular-nums">{count}</span>
                  </div>
                ))}
              </div>

              <details className="mt-4 group">
                <summary className="cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white list-none flex items-center gap-1">
                  <span className="group-open:rotate-90 transition-transform text-[10px]" aria-hidden="true">▶</span>
                  What do these mean?
                </summary>
                <ul className="mt-2 space-y-1.5 text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 p-3 rounded-md border border-gray-300 dark:border-gray-700">
                  <li><span className="text-red-700 dark:text-red-400">Critical:</span> Blocks access to content or function. Fix immediately.</li>
                  <li><span className="text-orange-700 dark:text-orange-400">Serious:</span> Major barriers, but painful workarounds might exist.</li>
                  <li><span className="text-yellow-800 dark:text-yellow-400">Moderate:</span> Some barriers, most users can navigate around it.</li>
                  <li><span className="text-blue-700 dark:text-blue-400">Minor:</span> Nuisance or annoyance. Content is still accessible.</li>
                </ul>
              </details>
            </div>

            {/* WCAG conformance */}
            <div className="min-w-[160px]">
              <h3 className="text-sm text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">Violations Found In</h3>
              <div className="flex flex-wrap gap-2">
                {wcagLevels.has('A') && <Pill label="WCAG 2.1 A" />}
                {wcagLevels.has('AA') && <Pill label="WCAG 2.1 AA" />}
                {wcagLevels.size === 0 && (
                  <span className="text-base text-gray-600 dark:text-gray-400">Best practice only</span>
                )}
              </div>
            </div>

          </div>
        </section>

        {/* Pages list */}
        <section>
          <h2 className="text-xl font-medium mb-3">
            Pages Scanned ({scan.pages.length})
          </h2>
          <ul className="space-y-2">
            {scan.pages.map(page => (
              <li key={page.id}>
                <PageRow page={page} onSelectPage={onSelectPage} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}


function PageRow({ page, onSelectPage }: { page: { id: string; url: string; violations: any[] }; onSelectPage: (id: string) => void }) {
  const [copied, setCopied] = useState(false);
  const hasViolations = page.violations.length > 0;
  const { baseUrl, interaction } = parsePageUrl(page.url);

  function copyUrl() {
    const text = interaction
      ? `${baseUrl} (clicked "${interaction}")`
      : baseUrl;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const borderColor = hasViolations ? 'border-gray-400 dark:border-gray-600' : 'border-gray-300 dark:border-gray-700';
  const icon = hasViolations
    ? <span aria-hidden="true" className="text-amber-700 dark:text-amber-400 shrink-0 text-base leading-none">⚠</span>
    : <span aria-hidden="true" className="text-green-700 dark:text-green-500 shrink-0 text-base leading-none">✓</span>;

  const interactionBadge = interaction && (
    <span className="shrink-0 px-2 py-0.5 rounded bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">
      clicked &ldquo;{interaction}&rdquo;
    </span>
  );

  return (
    <div className={`flex items-center bg-gray-200 dark:bg-gray-800 border-2 ${borderColor} rounded-md`}>
      {/* Main results button */}
      {hasViolations ? (
        <button
          type="button"
          onClick={() => onSelectPage(page.id)}
          className="flex-1 min-w-0 flex items-center gap-3 p-3 text-left hover:bg-gray-300 dark:hover:bg-gray-700 rounded-l-md transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-gray-900 dark:focus:ring-white"
        >
          {icon}
          <span className="flex-1 text-base text-gray-900 dark:text-white truncate">{baseUrl}</span>
          {interactionBadge}
          <span className="text-base text-amber-800 dark:text-amber-400 font-medium tabular-nums shrink-0" aria-hidden="true">{page.violations.reduce((sum, v) => sum + v.nodes.length, 0)}</span>
          <ChevronRight size={16} className="text-gray-600 dark:text-gray-400 shrink-0" aria-hidden="true" />
        </button>
      ) : (
        <div className="flex-1 min-w-0 flex items-center gap-3 p-3">
          {icon}
          <span className="flex-1 text-base text-gray-600 dark:text-gray-400 truncate">{baseUrl}</span>
          {interactionBadge}
          <span className="text-base text-gray-600 dark:text-gray-400 tabular-nums shrink-0" aria-hidden="true">0</span>
        </div>
      )}

      {/* Copy button */}
      <div className="flex self-stretch shrink-0 border-l border-gray-300 dark:border-gray-700">
        <button
          type="button"
          onClick={copyUrl}
          aria-label={copied ? 'Copied' : 'Copy'}
          className="w-11 self-stretch flex items-center justify-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-gray-900 dark:focus:ring-white rounded-r-md"
        >
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
