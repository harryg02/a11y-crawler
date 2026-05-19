'use client';

import { useState, useEffect } from 'react';
import HistoryList from './HistoryList';
import ScanDetail from './ScanDetail';
import PageDetail from './PageDetail';
import { ScanRecord, ScanSummary } from '../../lib/types';

export type HistoryView =
  | { type: 'list' }
  | { type: 'scan'; scanId: string }
  | { type: 'page'; scanId: string; pageId: string };

export default function History({ view, setView }: { view: HistoryView; setView: (v: HistoryView) => void }) {
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [activeScan, setActiveScan] = useState<ScanRecord | null>(null);
  const [scanLoading, setScanLoading] = useState(false);

  // Load summaries once on mount
  useEffect(() => {
    fetch('/api/history')
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data: ScanSummary[]) => setScans(data))
      .catch(() => setScans([]))
      .finally(() => setListLoading(false));
  }, []);

  // Load full scan when navigating to a scan or page view
  useEffect(() => {
    if (view.type === 'list') { setActiveScan(null); return; }
    const id = view.scanId;
    if (activeScan?.id === id) return;
    setScanLoading(true);
    fetch(`/api/history/${id}`)
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data: ScanRecord) => setActiveScan(data))
      .catch(() => setActiveScan(null))
      .finally(() => setScanLoading(false));
  }, [view]);

  function handleDelete(id: string) {
    fetch(`/api/history/${id}`, { method: 'DELETE' })
      .then(() => {
        setScans(prev => prev.filter(s => s.id !== id));
        if (view.type !== 'list' && view.scanId === id) setView({ type: 'list' });
      })
      .catch(() => {});
  }

  if (view.type === 'list') {
    if (listLoading) return (
      <div className="max-w-220 mx-auto p-8">
        <h1 className="text-3xl font-medium mb-6 text-gray-900 dark:text-white">History</h1>
        <p className="text-gray-600 dark:text-gray-400 text-center mt-16">Loading...</p>
      </div>
    );
    return (
      <HistoryList
        scans={scans}
        onSelectScan={(id) => setView({ type: 'scan', scanId: id })}
        onDelete={handleDelete}
      />
    );
  }

  if (scanLoading || !activeScan) return (
    <div className="max-w-220 mx-auto p-8">
      <p className="text-gray-600 dark:text-gray-400 text-center mt-16">Loading...</p>
    </div>
  );

  if (view.type === 'scan') {
    return (
      <ScanDetail
        scan={activeScan}
        onBack={() => setView({ type: 'list' })}
        onSelectPage={(pageId) => setView({ type: 'page', scanId: view.scanId, pageId })}
      />
    );
  }

  const page = activeScan.pages.find(p => p.id === view.pageId);
  if (!page) return null;

  return (
    <PageDetail
      page={page}
      scan={activeScan}
      onBack={() => setView({ type: 'scan', scanId: view.scanId })}
    />
  );
}
