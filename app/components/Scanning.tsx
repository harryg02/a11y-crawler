'use client';

import { useState, useEffect } from 'react';
import Button from './Button';

interface ScanningProps {
  config: any;
  onFinish: () => void;
}


export default function Scanning({ config, onFinish }: ScanningProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isPaused, setIsPaused] = useState(false);

  // mock log stream — replace with real backend later
  useEffect(() => {
    if (isPaused) return;
    const fakeLogs = [
      'Browser launched',
      'Navigating to https://example.com',
      'Login detected — waiting for credentials',
      'Login complete, starting crawl',
      'Scanning /home',
      'Found 3 violations on /home',
      'Discovering links...',
      'Queued 12 new pages',
      'Scanning /about',
      'No violations on /about',
    ];
    let i = logs.length;
    const interval = setInterval(() => {
      if (i < fakeLogs.length) {
        setLogs(prev => [...prev, fakeLogs[i]]);
        i++;
      }
    }, 800);
    return () => clearInterval(interval);
  }, [isPaused, logs.length]);

  return (
    <div className="min-h-screen flex items-center">
      <div className="max-w-150 w-full mx-auto py-8 flex flex-col items-center text-center">

        <h1 className="text-3xl font-medium mb-8">Scanning</h1>

        {/* Spinner placeholder — build component next */}
        <div className="w-16 h-16 mb-8 border-4 border-gray-700 border-t-white rounded-full animate-spin" aria-label="Scanning in progress" />

        {/* LogStream placeholder — build component later */}
        <div className="w-full h-64 mb-8 bg-gray-800 border-2 border-gray-600 rounded-[5px] p-4 overflow-y-auto text-left font-mono text-sm">
          {logs.length === 0 ? (
            <p className="text-gray-400">Waiting for crawler to start...</p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="text-gray-300 mb-1">{log}</div>
            ))
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-4">
          <Button
            variant="secondary"
            onClick={() => setIsPaused(!isPaused)}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            onClick={() => onFinish()}
          >
            Finish Now
          </Button>
        </div>

      </div>
    </div>
  );
}