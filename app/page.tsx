'use client';

import { useState, useEffect } from 'react';
import { Radar, History as HistoryIcon, Settings as SettingsIcon, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Logo from './components/Logo';
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
  const [collapsed, setCollapsed] = useState(false);

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
    <div className="flex h-full overflow-hidden bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-white">
      {/* Sidebar */}
      <aside className="shrink-0 p-4 flex flex-col gap-3 border-r-2 border-gray-300 dark:border-gray-700 overflow-y-auto">
        <div className={`flex items-center mb-1 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {/* The mark sits inside the <h1> so it travels with the wordmark —
              including into sr-only when the sidebar collapses, which keeps the
              collapsed rail exactly as it was (toggle button only). */}
          <h1 className={`flex items-center gap-2 text-2xl font-medium px-2 ${collapsed ? 'sr-only' : ''}`}>
            <Logo className="w-7 h-7 shrink-0" />
            A11y Crawler
          </h1>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex items-center justify-center w-9 h-9 shrink-0 rounded-[5px] text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          >
            {collapsed ? <PanelLeftOpen size={22} /> : <PanelLeftClose size={22} />}
            <span className="sr-only">{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
          </button>
        </div>
        <nav className="flex flex-col gap-3">
          <Tab icon={<Radar size={24} />} label="Crawl & Scan" active={view === 'crawl'} collapsed={collapsed} onClick={() => setView('crawl')} />
          <Tab icon={<HistoryIcon size={24} />} label="History" active={view === 'history'} collapsed={collapsed} onClick={() => { setHistoryView({ type: 'list' }); setView('history'); }} />
          <Tab icon={<SettingsIcon size={24} />} label="Settings" active={view === 'settings'} collapsed={collapsed} onClick={() => setView('settings')} />
        </nav>
      </aside>

      {/* Main content */}
      {/* The single scroll container for the app, in both axes (overflow-y:auto
          makes the computed overflow-x 'auto' too). Two additions serve the
          scan-detail layout:
            @container — makes this a query container so sticky children can be
              sized with 100cqw, i.e. the width of this scroll *port*. That is
              neither 100vw (wrong: the sidebar) nor 100% (wrong: resolves
              against the max-content-wide content), and it tracks the sidebar
              collapsing with no JS.
            scroll-pt-25 — reserves the sticky BackBar + table header height so
              keyboard focus doesn't land underneath them (WCAG 2.4.11). */}
      <main className="flex-1 bg-white dark:bg-gray-950 overflow-y-auto @container scroll-pt-25">
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
