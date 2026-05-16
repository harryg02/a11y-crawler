'use client';

import { useState, useEffect } from 'react';
import HistoryList from './HistoryList';
import ScanDetail from './ScanDetail';
import PageDetail from './PageDetail';
import { ScanRecord } from '../../lib/types';

type HistoryView =
  | { type: 'list' }
  | { type: 'scan'; scanId: string }
  | { type: 'page'; scanId: string; pageId: string };

export default function History({ initialScanId }: { initialScanId?: string | null }) {
  const [view, setView] = useState<HistoryView>(
    initialScanId ? { type: 'scan', scanId: initialScanId } : { type: 'list' }
  );
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/history')
      .then(res => res.json())
      .then((data: ScanRecord[]) => setScans(data))
      .catch(() => setScans([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-220 mx-auto p-8">
        <h1 className="text-3xl font-medium mb-6 text-gray-900 dark:text-white">History</h1>
        <p className="text-gray-600 dark:text-gray-400 text-center mt-16">Loading...</p>
      </div>
    );
  }

  function handleDelete(id: string) {
    fetch(`/api/history/${id}`, { method: 'DELETE' })
      .then(() => setScans(prev => prev.filter(s => s.id !== id)))
      .catch(() => {});
  }

  if (view.type === 'list') {
    return (
      <HistoryList
        scans={scans}
        onSelectScan={(id) => setView({ type: 'scan', scanId: id })}
        onDelete={handleDelete}
      />
    );
  }

  const scan = scans.find(s => s.id === view.scanId);
  if (!scan) return null;

  if (view.type === 'scan') {
    return (
      <ScanDetail
        scan={scan}
        onBack={() => setView({ type: 'list' })}
        onSelectPage={(pageId) => setView({ type: 'page', scanId: view.scanId, pageId })}
      />
    );
  }

  const page = scan.pages.find(p => p.id === view.pageId);
  if (!page) return null;

  return (
    <PageDetail
      page={page}
      scan={scan}
      onBack={() => setView({ type: 'scan', scanId: view.scanId })}
    />
  );
}
