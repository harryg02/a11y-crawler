'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronsLeft, ChevronsRight, ExternalLink } from 'lucide-react';
import { PageRecord, ScanRecord, Violation } from '../../lib/types';

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
              <ViolationCard violation={violation} defaultExpanded={filtered.length === 1} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-base text-gray-400 text-center mt-8">No violations for this filter.</p>
      )}
    </div>
  );
}

function ViolationCard({ violation, defaultExpanded = false }: { violation: Violation; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [nodeIndex, setNodeIndex] = useState(0);
  const total = violation.nodes.length;
  const node = violation.nodes[nodeIndex];

  return (
    <article className="bg-gray-800 border-2 border-gray-600 rounded-md overflow-hidden">
      {/* Collapsed header — always visible, click to toggle */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-750 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
      >
        <span
          className={`inline-flex items-center h-6 px-2.5 rounded-full text-sm font-medium border-2 capitalize shrink-0 ${SEVERITY_STYLE[violation.impact]}`}
        >
          {violation.impact}
        </span>
        <span className="flex-1 text-base font-medium text-white leading-snug">{violation.help}</span>
        <span className="text-base text-gray-400 shrink-0">{total}</span>
        {expanded
          ? <ChevronDown size={18} className="text-gray-400 shrink-0" aria-hidden="true" />
          : <ChevronRight size={18} className="text-gray-400 shrink-0" aria-hidden="true" />
        }
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-gray-700 px-4 py-4 space-y-4">

          {/* Node paginator */}
          {total > 1 && (
            <div className="flex items-center gap-1.5" role="group" aria-label="Navigate elements">
              <button
                type="button"
                onClick={() => setNodeIndex(0)}
                disabled={nodeIndex === 0}
                aria-label="First element"
                className="w-11 h-11 flex items-center justify-center rounded-md bg-gray-700 border-2 border-gray-600 text-white hover:bg-gray-600 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800 transition-colors"
              >
                <ChevronsLeft size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setNodeIndex(i => Math.max(0, i - 1))}
                disabled={nodeIndex === 0}
                aria-label="Previous element"
                className="w-11 h-11 flex items-center justify-center rounded-md bg-gray-700 border-2 border-gray-600 text-white hover:bg-gray-600 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800 transition-colors"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <span className="px-3 text-base text-white min-w-20 text-center tabular-nums" aria-live="polite" aria-atomic="true">
                {nodeIndex + 1} of {total}
              </span>
              <button
                type="button"
                onClick={() => setNodeIndex(i => Math.min(total - 1, i + 1))}
                disabled={nodeIndex === total - 1}
                aria-label="Next element"
                className="w-11 h-11 flex items-center justify-center rounded-md bg-gray-700 border-2 border-gray-600 text-white hover:bg-gray-600 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800 transition-colors"
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setNodeIndex(total - 1)}
                disabled={nodeIndex === total - 1}
                aria-label="Last element"
                className="w-11 h-11 flex items-center justify-center rounded-md bg-gray-700 border-2 border-gray-600 text-white hover:bg-gray-600 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800 transition-colors"
              >
                <ChevronsRight size={18} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* WCAG tags */}
          {violation.wcagTags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="WCAG criteria" role="list">
              {violation.wcagTags.map(tag => (
                <li key={tag} className="inline-flex items-center h-6 px-2 border border-gray-500 rounded text-sm text-gray-300">
                  {tag}
                </li>
              ))}
            </ul>
          )}

          {/* Current node */}
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-gray-400 uppercase tracking-wide mb-1.5">Element</dt>
              <dd>
                <pre className="bg-gray-900 rounded p-3 whitespace-pre-wrap break-all text-base text-green-300 leading-relaxed">
                  <code>{node.html}</code>
                </pre>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400 uppercase tracking-wide mb-1.5">Selector</dt>
              <dd>
                <pre className="bg-gray-900 rounded p-3 whitespace-pre-wrap break-all text-base text-blue-300 leading-relaxed">
                  <code>{node.selector}</code>
                </pre>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400 uppercase tracking-wide mb-1.5">Fix</dt>
              <dd className="text-base text-gray-300 whitespace-pre-wrap leading-relaxed">{node.failureSummary}</dd>
            </div>
          </dl>

          {/* Learn more */}
          <div className="pt-2 border-t border-gray-700">
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
        </div>
      )}
    </article>
  );
}
