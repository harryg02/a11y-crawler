'use client';

import { useState } from 'react';
import { Radar, History as HistoryIcon, Settings as SettingsIcon } from 'lucide-react';
import Tab from './components/Tab';
import CrawlScan from './components/CrawlScan';
import History from './components/History';
import Settings from './components/Settings';

type View = 'crawl' | 'history' | 'settings';

export default function Page() {
  const [view, setView] = useState<View>('crawl');

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      {/* Sidebar — fixed 270px wide */}
      <aside className=" shrink-0 p-4 flex flex-col gap-3 border-r-2 border-gray-700">
        <h1 className="text-2xl font-medium px-2">A11y Crawler</h1>
        <Tab icon={<Radar size={24} />} label="Crawl & Scan" active={view === 'crawl'} onClick={() => setView('crawl')} />
        <Tab icon={<HistoryIcon size={24} />} label="History" active={view === 'history'} onClick={() => setView('history')} />
        <Tab icon={<SettingsIcon size={24} />} label="Settings" active={view === 'settings'} onClick={() => setView('settings')} />
      </aside>

      {/* Main content — takes remaining space */}
      <main className="flex-1 p-8">
        {view === 'crawl' && <CrawlScan />}
        {view === 'history' && <History />}
        {view === 'settings' && <Settings />}
      </main>
    </div>
  );
}