'use client';

import { useState, useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import Button from './Button';

interface ScanningProps {
  config: any;
  onFinish: () => void;
  onViewResults: () => void;
}

export default function Scanning({ config, onFinish, onViewResults }: ScanningProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [finishReason, setFinishReason] = useState<'running' | 'completed' | 'stopped'>('running');
  const [loggedIn, setLoggedIn] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const isPausedRef = useRef(false);

  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    async function run() {
      try {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) { setFinishReason('stopped'); return; }

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += value;
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data: ')) continue;
            const text = line.slice(6);
            if (text === '__SCAN_COMPLETE__') {
              setFinishReason('completed');
            } else if (text === '__SCAN_ERROR__') {
              setFinishReason('stopped');
            } else if (text && !isPausedRef.current) {
              setLogs(prev => [...prev, text]);
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setFinishReason('stopped');
      }
    }

    run();
    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isFinished = finishReason !== 'running';

  // Auto-scroll log box to bottom, unless user has scrolled up
  const logRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  useEffect(() => {
    const el = logRef.current;
    if (!el || userScrolledUp.current) return;
    el.scrollTop = el.scrollHeight;
  }, [logs]);

  const handleLogScroll = () => {
    const el = logRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    userScrolledUp.current = !atBottom;
  };

  return (
    <div className="min-h-screen flex items-center">
      <div className="max-w-150 w-full mx-auto py-8 flex flex-col items-center text-center">

        <h1 className="text-3xl font-medium mb-8">
          {isFinished ? (finishReason === 'completed' ? 'Scan Complete' : 'Scan Stopped') : 'Scanning'}
        </h1>

        {/* Spinner or checkmark */}
        {isFinished ? (
          <div className="w-16 h-16 mb-8 rounded-full border-4 border-white flex items-center justify-center" aria-label="Scan complete">
            <Check size={32} strokeWidth={3} />
          </div>
        ) : (
          <div className="w-16 h-16 mb-8 border-4 border-gray-700 border-t-white rounded-full animate-spin" aria-label="Scanning in progress" />
        )}

        {/* Login prompt — only shown when site requires login, scan is running, and user hasn't confirmed yet */}
        {!isFinished && config.startingUrl && !loggedIn && (
          <div className="mb-8 text-center">
            <p className="text-gray-400 text-base mb-3">
              Log in at the browser window, then click when ready:
            </p>
            <Button onClick={() => {
              fetch('/api/scan/login-complete', { method: 'POST' });
              setLoggedIn(true);
            }}>
              I&apos;ve logged in
            </Button>
          </div>
        )}

        {/* Log stream */}
        <div
          ref={logRef}
          role="log"
          aria-label="Crawl log output"
          aria-live="polite"
          aria-relevant="additions"
          tabIndex={0}
          onScroll={handleLogScroll}
          className="w-full h-64 mb-8 bg-gray-800 border-2 border-gray-600 rounded-[5px] p-4 overflow-y-auto text-left font-mono text-sm focus:outline-none focus:border-white transition-colors"
        >
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
          {isFinished ? (
            <>
              <Button variant="secondary" onClick={onFinish}>
                Scan Another Site
              </Button>
              <Button onClick={onViewResults}>
                View Results
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => setIsPaused(!isPaused)}
              >
                {isPaused ? 'Resume' : 'Pause'}
              </Button>
              <Button onClick={() => { abortRef.current?.abort(); setFinishReason('stopped'); }}>
                Stop
              </Button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
