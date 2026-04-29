'use client';

import { useState } from 'react';
import HistoryList from './HistoryList';
import ScanDetail from './ScanDetail';
import PageDetail from './PageDetail';
import { mockScans } from './mockHistoryData';

type HistoryView =
  | { type: 'list' }
  | { type: 'scan'; scanId: string }
  | { type: 'page'; scanId: string; pageId: string };

export default function History() {
  const [view, setView] = useState<HistoryView>({ type: 'list' });

  if (view.type === 'list') {
    return (
      <HistoryList
        scans={mockScans}
        onSelectScan={(id) => setView({ type: 'scan', scanId: id })}
      />
    );
  }

  const scan = mockScans.find(s => s.id === view.scanId);
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
