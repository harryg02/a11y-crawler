'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronRight, Trash2 } from 'lucide-react';
import { ScanRecord } from '../../lib/types';

interface HistoryListProps {
  scans: ScanRecord[];
  onSelectScan: (id: string) => void;
  onDelete: (id: string) => void;
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

// ── Accessible confirmation dialog ──────────────────────────────────────────

interface ConfirmDeleteDialogProps {
  domain: string;
  date: string;
  onConfirm: () => void;
  onCancel: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

function ConfirmDeleteDialog({ domain, date, onConfirm, onCancel, triggerRef }: ConfirmDeleteDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Move focus to Cancel button when dialog opens
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Return focus to trigger when dialog closes
  const close = useCallback((action: 'confirm' | 'cancel') => {
    if (action === 'confirm') onConfirm();
    else onCancel();
    // focus returns after state update unmounts this component
    setTimeout(() => triggerRef.current?.focus(), 0);
  }, [onConfirm, onCancel, triggerRef]);

  // Trap focus inside the dialog
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close('cancel');
      return;
    }
    if (e.key !== 'Tab') return;

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      aria-hidden="false"
      onClick={() => close('cancel')}
    >
      {/* Dialog panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-desc"
        onKeyDown={handleKeyDown}
        onClick={e => e.stopPropagation()}
        className="bg-gray-900 border-2 border-gray-700 rounded-lg p-6 w-full max-w-sm mx-4 shadow-xl"
      >
        <h2 id="delete-dialog-title" className="text-lg font-medium text-white mb-2">
          Delete scan?
        </h2>
        <p id="delete-dialog-desc" className="text-base text-gray-400 mb-6">
          The scan result for <span className="text-white font-medium">{domain}</span> on <span className="text-white font-medium">{date}</span> will be permanently deleted. This cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => close('cancel')}
            className="h-10 px-4 rounded-md text-base font-medium bg-gray-700 text-white border-2 border-gray-600 hover:border-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => close('confirm')}
            className="h-10 px-4 rounded-md text-base font-medium bg-red-700 text-white border-2 border-red-600 hover:bg-red-600 hover:border-red-500 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Scan row ─────────────────────────────────────────────────────────────────

function ScanRow({ scan, onSelectScan, onDelete }: { scan: ScanRecord; onSelectScan: (id: string) => void; onDelete: (id: string) => void }) {
  const [showDialog, setShowDialog] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const total = getTotalViolations(scan);
  const domain = getDomain(scan.url);

  return (
    <>
      <div className="flex items-center bg-gray-800 border-2 border-gray-600 rounded-md hover:border-gray-400 transition-colors">
        {/* Main row button */}
        <button
          type="button"
          onClick={() => onSelectScan(scan.id)}
          className="flex-1 min-w-0 text-left p-4 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white rounded-l-md"
          aria-label={`${domain}, scanned ${formatDate(scan.date)}, ${scan.pages.length} pages, ${total} violations`}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0 flex items-baseline gap-2">
              <p className="text-lg font-medium text-white shrink-0">{domain}</p>
              <p className="text-base text-gray-400 truncate">{formatDate(scan.date)}</p>
            </div>
            <p className="text-base text-gray-400 shrink-0 text-right">
              {scan.pages.length} pages · {total} violations · {formatDuration(scan.durationSeconds)}
            </p>
            <ChevronRight size={18} className="text-gray-400 shrink-0" aria-hidden="true" />
          </div>
        </button>

        {/* Delete button */}
        <div className="flex self-stretch shrink-0 border-l border-gray-700">
          <button
            ref={deleteButtonRef}
            type="button"
            onClick={() => setShowDialog(true)}
            aria-label={`Delete scan for ${domain}`}
            className="w-11 self-stretch flex items-center justify-center text-gray-400 hover:text-red-400 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white rounded-r"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {showDialog && (
        <ConfirmDeleteDialog
          domain={domain}
          date={formatDate(scan.date)}
          onConfirm={() => { setShowDialog(false); onDelete(scan.id); }}
          onCancel={() => setShowDialog(false)}
          triggerRef={deleteButtonRef}
        />
      )}
    </>
  );
}

// ── List ──────────────────────────────────────────────────────────────────────

export default function HistoryList({ scans, onSelectScan, onDelete }: HistoryListProps) {
  return (
    <div className="max-w-200 mx-auto py-8 px-4">
      <h1 className="text-3xl font-medium mb-6">History</h1>

      {scans.length === 0 ? (
        <p className="text-gray-400 text-center mt-16">
          No scans yet. Run a crawl to see it here.
        </p>
      ) : (
        <ul className="space-y-3" role="list">
          {scans.map(scan => (
            <li key={scan.id}>
              <ScanRow scan={scan} onSelectScan={onSelectScan} onDelete={onDelete} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
