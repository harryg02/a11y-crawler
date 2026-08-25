'use client';

import { useState, useEffect, useRef } from 'react';
import { Check, X, Pause } from 'lucide-react';
import Button from './Button';

interface ScanningProps {
  config: any;
  onFinish: () => void;
  onViewResults: (scanId: string | null) => void;
}

export default function Scanning({ config, onFinish, onViewResults }: ScanningProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [finishReason, setFinishReason] = useState<'running' | 'stopping' | 'completed' | 'stopped' | 'error' | 'unreachable' | 'interrupted'>('running');
  // Set when the crawl died with resumable progress. requiresLogin decides
  // whether continuing needs the user to re-establish the session first.
  const [interrupted, setInterrupted] = useState<{ requiresLogin: boolean; pagesDone: number; pagesQueued: number } | null>(null);
  // Bumped to re-subscribe to the log stream after resuming.
  const [runKey, setRunKey] = useState(0);
  const [loggedIn, setLoggedIn] = useState(false); // hides the "I've logged in" button once clicked
  const [latestScanId, setLatestScanId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Remembered so a scan that dies before the stream attaches can still be
  // asked about by id.
  const startedScanId = useRef<string | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    async function run() {
      try {
        // Only the first pass starts a scan; later passes re-attach the stream
        // after a resume, which is kicked off by /api/scan/continue instead.
        if (config !== null && runKey === 0) {
          const res = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
          });
          if (!res.ok && res.status !== 409) {
            // The route turns any throw into a 500 whose body names the cause;
            // showing it beats a blank "Scan Stopped".
            const detail = await res.json().catch(() => null);
            setLogs([`Could not start the scan: ${detail?.error ?? `HTTP ${res.status}`}`]);
            setFinishReason('error');
            return;
          }
          startedScanId.current = (await res.json().catch(() => null))?.scanId ?? null;
        }

        const streamRes = await fetch('/api/scan/stream', { signal: controller.signal });
        if (!streamRes.ok || !streamRes.body) {
          if (streamRes.status === 204) {
            // No active scan — but that is also what we see when the crawler
            // died between starting it and attaching here (spawn failures fire
            // within a tick). Ask what actually became of it rather than
            // reporting a user-style "Stopped" with nothing to go on.
            const id = startedScanId.current;
            const outcome = id
              ? await fetch(`/api/scan/status?scanId=${encodeURIComponent(id)}`)
                  .then(r => r.json()).then(s => s?.outcome).catch(() => null)
              : null;
            if (outcome && outcome.status === 'error') {
              setLogs(outcome.messages.length ? outcome.messages : ['The crawler stopped before producing any output.']);
              setFinishReason('error');
            } else {
              setFinishReason('stopped');
            }
          }
          return;
        }

        const reader = streamRes.body.pipeThrough(new TextDecoderStream()).getReader();
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
              if (stopTimeoutRef.current) { clearTimeout(stopTimeoutRef.current); stopTimeoutRef.current = null; }
              setFinishReason(prev => prev === 'stopping' ? 'stopped' : 'completed');
              fetch('/api/history').then(r => r.json()).then((data: any[]) => {
                setLatestScanId(data[0]?.id ?? null);
              }).catch(() => {});
            } else if (text === '__SCAN_UNREACHABLE__') {
              if (stopTimeoutRef.current) { clearTimeout(stopTimeoutRef.current); stopTimeoutRef.current = null; }
              setFinishReason('unreachable');
            } else if (text === '__SCAN_INTERRUPTED__') {
              // Crashed, killed, or the server restarted — but progress was
              // saved, so this is a pause the user can continue from.
              if (stopTimeoutRef.current) { clearTimeout(stopTimeoutRef.current); stopTimeoutRef.current = null; }
              setFinishReason('interrupted');
              fetch('/api/scan/status')
                .then(r => r.json())
                .then(s => { if (s?.interrupted) setInterrupted(s.interrupted); })
                .catch(() => {});
            } else if (text === '__SCAN_ERROR__') {
              setFinishReason('error');
            } else if (text) {
              setLogs(prev => [...prev, text]);
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setFinishReason('stopped');
      }
    }

    run();
    return () => { controller.abort(); if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current); };
  }, [runKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-launch an interrupted scan from its saved crawl state. The stream replays
  // the run's whole log history, so clear first rather than double-printing it.
  const handleContinue = async () => {
    const res = await fetch('/api/scan/continue', { method: 'POST' });
    if (!res.ok) return;
    setLogs([]);
    setInterrupted(null);
    setIsPaused(false);
    // If the session was lost, the crawler reopens the headed login page and
    // waits for "I've logged in" again.
    setLoggedIn(false);
    setFinishReason('running');
    setRunKey(k => k + 1);
  };

  const isFinished = finishReason !== 'running' && finishReason !== 'stopping';

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

        <h1 className="text-3xl font-medium mb-8 text-gray-900 dark:text-white">
          {isFinished
            ? finishReason === 'completed'    ? 'Scan Complete'
            : finishReason === 'interrupted'  ? 'Scan Paused'
            : finishReason === 'error'        ? 'Scan Failed'
            : finishReason === 'unreachable'  ? 'Cannot Reach Website'
            : 'Scan Stopped'
            : finishReason === 'stopping' ? 'Stopping...'
            : 'Scanning'}
        </h1>

        {/* Spinner, checkmark, or X */}
        {isFinished ? (
          <div className="w-16 h-16 mb-8 rounded-full border-4 border-gray-900 dark:border-white flex items-center justify-center" aria-hidden="true">
            {finishReason === 'error' || finishReason === 'unreachable'
              ? <X size={32} strokeWidth={3} />
              : finishReason === 'interrupted'
              ? <Pause size={32} strokeWidth={3} />
              : <Check size={32} strokeWidth={3} />}
          </div>
        ) : (
          <div className="w-16 h-16 mb-8 border-4 border-gray-300 border-t-gray-900 dark:border-gray-700 dark:border-t-white rounded-full animate-spin" aria-hidden="true" />
        )}

        {/* Login prompt — only shown when site requires login, scan is running, and user hasn't confirmed yet */}
        {!isFinished && config?.startingUrl && !loggedIn && (
          <div className="mb-8 text-center">
            <p className="text-gray-600 dark:text-gray-400 text-base mb-3">
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

        {/* Interrupted: progress is saved, so offer to continue rather than
            reporting a failure. */}
        {finishReason === 'interrupted' && (
          <div className="mb-8 text-center">
            <p className="text-gray-600 dark:text-gray-400 text-base">
              The scan stopped unexpectedly, but its progress was saved
              {interrupted ? ` — ${interrupted.pagesDone} page(s) already scanned, ${interrupted.pagesQueued} still to go` : ''}.
            </p>
            {interrupted?.requiresLogin && (
              <p className="text-gray-600 dark:text-gray-400 text-base mt-2">
                The login session was lost when the scan stopped. Log in again and
                the crawl will carry on from where it left off.
              </p>
            )}
          </div>
        )}

        {/* Log stream */}
        <div
          ref={logRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          tabIndex={0}
          onScroll={handleLogScroll}
          className="w-full h-64 mb-8 bg-gray-100 border-2 border-gray-400 rounded-[5px] p-4 overflow-y-auto text-left font-mono text-sm focus:outline-none focus:border-gray-900 dark:bg-gray-800 dark:border-gray-600 dark:focus:border-white transition-colors"
        >
          {logs.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">Waiting for crawler to start...</p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="text-gray-700 dark:text-gray-300 mb-1">{log}</div>
            ))
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-4">
          {finishReason === 'interrupted' ? (
            <>
              <Button variant="secondary" onClick={onFinish}>
                Scan Another Site
              </Button>
              <Button onClick={handleContinue}>
                {interrupted?.requiresLogin ? 'Log in again to continue' : 'Resume scan'}
              </Button>
            </>
          ) : isFinished ? (
            <>
              <Button variant="secondary" onClick={onFinish}>
                Scan Another Site
              </Button>
              {/* A run that failed or was blocked has no report to open. */}
              {finishReason !== 'unreachable' && finishReason !== 'error' && (
                <Button onClick={() => onViewResults(latestScanId)}>
                  View Results
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  if (isPaused) {
                    fetch('/api/scan/resume', { method: 'POST' });
                    setIsPaused(false);
                  } else {
                    fetch('/api/scan/pause', { method: 'POST' });
                    setIsPaused(true);
                  }
                }}
              >
                {isPaused ? 'Resume' : 'Pause'}
              </Button>
              <Button
                disabled={finishReason === 'stopping'}
                onClick={() => {
                  fetch('/api/scan/stop', { method: 'POST' });
                  setFinishReason('stopping');
                  stopTimeoutRef.current = setTimeout(() => {
                    abortRef.current?.abort();
                    setFinishReason('stopped');
                  }, 45000);
                }}
              >
                Stop
              </Button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
