'use client';

import { useState } from 'react';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { PageRecord, ScanRecord, Violation } from './mockHistoryData';

interface PageDetailProps {
  page: PageRecord;
  scan: ScanRecord;
  onBack: () => void;
}

type SeverityFilter = 'all' | 'critical' | 'serious' | 'moderate' | 'minor';

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'text-red-400 bg-red-950 border-red-800',
  serious:  'text-orange-400 bg-orange-950 border-orange-800',
  moderate: 'text-yellow-400 bg-yellow-950 border-yellow-800',
  minor:    'text-blue-400 bg-blue-950 border-blue-800',
};

function getDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

export default function PageDetail({ page, scan, onBack }: PageDetailProps) {
  const [filter, setFilter] = useState<SeverityFilter>('all');

  const domain = getDomain(scan.url);

  const counts = {
    all:      page.violations.length,
    critical: page.violations.filter(v => v.impact === 'critical').length,
    serious:  page.violations.filter(v => v.impact === 'serious').length,
    moderate: page.violations.filter(v => v.impact === 'moderate').length,
    minor:    page.violations.filter(v => v.impact === 'minor').length,
  };

  const filtered = filter === 'all'
    ? page.violations
    : page.violations.filter(v => v.impact === filter);

  const filters: { id: SeverityFilter; label: string }[] = [
    { id: 'all',      label: `All (${counts.all})` },
    { id: 'critical', label: `Critical (${counts.critical})` },
    { id: 'serious',  label: `Serious (${counts.serious})` },
    { id: 'moderate', label: `Moderate (${counts.moderate})` },
    { id: 'minor',    label: `Minor (${counts.minor})` },
  ];

  return (
    <div className="max-w-200 mx-auto py-8 px-4">
      {/* Back */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors mb-6 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-950 rounded"
      >
        <ChevronLeft size={18} aria-hidden="true" />
        <span>Back to {domain} scan</span>
      </button>

      {/* Page header */}
      <h1 className="text-2xl font-medium text-white break-all mb-1">{page.url}</h1>
      <p className="text-base text-gray-400 mb-6">
        {page.violations.length === 0
          ? 'No violations on this page'
          : `${page.violations.length} violation${page.violations.length === 1 ? '' : 's'} on this page`}
      </p>

      {/* Filter bar */}
      {page.violations.length > 0 && (
        <div
          className="flex flex-wrap gap-2 mb-6"
          role="group"
          aria-label="Filter violations by severity"
        >
          {filters.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`
                inline-flex items-center h-9 px-3 rounded-full text-base border-2 transition-colors
                focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-950
                ${filter === f.id
                  ? 'bg-white text-gray-950 border-white'
                  : 'bg-transparent text-white border-gray-600 hover:border-gray-400'}
              `}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Violation list */}
      {filtered.length > 0 ? (
        <ul className="space-y-4" role="list">
          {filtered.map((violation, i) => (
            <li key={`${violation.id}-${i}`}>
              <ViolationCard violation={violation} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-base text-gray-400 text-center mt-8">No violations for this filter.</p>
      )}
    </div>
  );
}

function ViolationCard({ violation }: { violation: Violation }) {
  return (
    <article className="bg-gray-800 border-2 border-gray-600 rounded-md p-6 space-y-4">
      {/* Header row: severity badge + title */}
      <div className="flex flex-wrap items-start gap-2">
        <span
          className={`inline-flex items-center h-6 px-2.5 rounded-full text-sm font-medium border-2 capitalize shrink-0 ${SEVERITY_STYLE[violation.impact]}`}
          aria-label={`Severity: ${violation.impact}`}
        >
          {violation.impact}
        </span>
        <h2 className="text-base font-medium text-white leading-snug">{violation.help}</h2>
      </div>

      {/* WCAG tags */}
      {violation.wcagTags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="WCAG criteria" role="list">
          {violation.wcagTags.map(tag => (
            <li
              key={tag}
              className="inline-flex items-center h-6 px-2 border border-gray-300 rounded text-gray-300"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}

      {/* Nodes — each is a definition list of Element / Selector / Fix */}
      <div className="space-y-5">
        {violation.nodes.map((node, i) => (
          <dl
            key={i}
            className={`space-y-3 ${i > 0 ? 'border-t border-gray-700 pt-5' : ''}`}
          >
            <div>
              <dt className="text-sm text-gray-400 uppercase tracking-wide mb-1.5">Element</dt>
              <dd>
                <pre className="bg-gray-900 rounded p-3 overflow-x-auto text-base text-green-300 leading-relaxed">
                  <code>{node.html}</code>
                </pre>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400 uppercase tracking-wide mb-1.5">Selector</dt>
              <dd>
                <pre className="bg-gray-900 rounded p-3 overflow-x-auto text-base text-blue-300 leading-relaxed">
                  <code>{node.selector}</code>
                </pre>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400 uppercase tracking-wide mb-1.5">Fix</dt>
              <dd className="text-base text-gray-300 whitespace-pre-wrap leading-relaxed">{node.failureSummary}</dd>
            </div>
          </dl>
        ))}
      </div>

      {/* Learn more */}
      <div className="pt-3 border-t border-gray-700">
        <a
          href={violation.helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Learn more about "${violation.help}" (opens in new window)`}
          className="inline-flex items-center gap-1.5 text-base text-blue-400 hover:text-blue-300 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800 rounded"
        >
          Learn more
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}
