'use client';

import { useState, useEffect } from 'react';
import { Radar, History as HistoryIcon, Settings as SettingsIcon } from 'lucide-react';
import Tab from './components/Tab';
import CrawlScan from './components/CrawlScan';
import History, { type HistoryView } from './components/History';
import Settings from './components/Settings';

type View = 'crawl' | 'history' | 'settings';
type CrawlState = 'idle' | 'scanning';

export default function Page() {
  const [view, setView] = useState<View>('crawl');
  const [crawlState, setCrawlState] = useState<CrawlState>('idle');
  const [crawlConfig, setCrawlConfig] = useState<any>(null);
  const [historyView, setHistoryView] = useState<HistoryView>({ type: 'list' });

  // Load view from local storage
  useEffect(() => {
    const savedView = localStorage.getItem('a11y-crawler-view');
    if (savedView === 'crawl' || savedView === 'history' || savedView === 'settings') {
      setView(savedView);
    }
  }, []);

  // Sync view to local storage
  useEffect(() => {
    localStorage.setItem('a11y-crawler-view', view);
  }, [view]);

  // Check if scan is running, If the server replies { running: true }, the page forcefully switches you to the Scanning view.
  useEffect(() => {
    fetch('/api/scan/status')
      .then(res => res.json())
      .then(data => {
        if (data.running) {
          setCrawlState('scanning');
          setView('crawl');
        }
      })
      .catch(() => { });
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-white">
      {/* Sidebar */}
      <aside className="shrink-0 p-4 flex flex-col gap-3 border-r-2 border-gray-300 dark:border-gray-700 overflow-y-auto">
        <h1 className="text-2xl font-medium px-2">A11y Crawler</h1>
        <Tab icon={<Radar size={24} />} label="Crawl & Scan" active={view === 'crawl'} onClick={() => setView('crawl')} />
        <Tab icon={<HistoryIcon size={24} />} label="History" active={view === 'history'} onClick={() => { setHistoryView({ type: 'list' }); setView('history'); }} />
        <Tab icon={<SettingsIcon size={24} />} label="Settings" active={view === 'settings'} onClick={() => setView('settings')} />
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-white dark:bg-gray-950 overflow-y-auto">
        {/* Keep CrawlScan mounted but hidden when not active so state persists */}
        <div className={view === 'crawl' ? '' : 'hidden'}>
          <CrawlScan
            crawlState={crawlState}
            setCrawlState={setCrawlState}
            config={crawlConfig}
            setConfig={setCrawlConfig}
            onViewResults={(scanId) => {
              setHistoryView(scanId ? { type: 'scan', scanId } : { type: 'list' });
              setView('history');
            }}
          />
        </div>

        {view === 'history' && <History view={historyView} setView={setHistoryView} />}
        {view === 'settings' && <Settings />}
      </main>
    </div>
  );
}
