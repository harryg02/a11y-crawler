'use client';

import { useState } from 'react';
import { Radar, History as HistoryIcon, Settings as SettingsIcon } from 'lucide-react';
import Tab from './components/Tab';
import CrawlScan from './components/CrawlScan';
import History from './components/History';
import Settings from './components/Settings';

type View = 'crawl' | 'history' | 'settings';
type CrawlState = 'idle' | 'scanning';

export default function Page() {
  const [view, setView] = useState<View>('crawl');
  const [crawlState, setCrawlState] = useState<CrawlState>('idle');
  const [crawlConfig, setCrawlConfig] = useState<any>(null);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-white">
      {/* Sidebar */}
      <aside className="shrink-0 p-4 flex flex-col gap-3 border-r-2 border-gray-300 dark:border-gray-700 overflow-y-auto">
        <h1 className="text-2xl font-medium px-2">A11y Crawler</h1>
        <Tab icon={<Radar size={24} />} label="Crawl & Scan" active={view === 'crawl'} onClick={() => setView('crawl')} />
        <Tab icon={<HistoryIcon size={24} />} label="History" active={view === 'history'} onClick={() => setView('history')} />
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
            onViewHistory={() => setView('history')}
          />
        </div>

        {view === 'history' && <History />}
        {view === 'settings' && <Settings />}
      </main>
    </div>
  );
}