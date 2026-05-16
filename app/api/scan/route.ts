import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export const dynamic = 'force-dynamic';

interface ScanConfig {
  scope: string;
  startingUrl: string;
  crawlBoundary: string;
  maxDepth: number;
  timeout: number;
  forbiddenWords: string[];
  excludedScopes: string[];
}

export async function POST(req: NextRequest) {
  const config: ScanConfig = await req.json();

  const requiresLogin = Boolean(config.startingUrl);

  const crawlerEnv: Record<string, string> = {
    CRAWLER_SCOPE: config.scope,
    CRAWLER_BOUNDARY: config.crawlBoundary || config.scope,
    CRAWLER_START_URL: config.startingUrl || config.scope,
    CRAWLER_MAX_DEPTH: String(config.maxDepth),
    CRAWLER_TIMEOUT: String(config.timeout * 60 * 1000),
    CRAWLER_BLOCKED: JSON.stringify(config.forbiddenWords ?? []),
    CRAWLER_EXCLUDED: JSON.stringify(config.excludedScopes ?? []),
    CRAWLER_WATCH_MODE: 'false',
    CRAWLER_REQUIRES_LOGIN: requiresLogin ? 'true' : 'false',
    CRAWLER_HEADLESS: requiresLogin ? 'false' : 'true',
  };

  const encoder = new TextEncoder();
  const playwrightBin = path.join(process.cwd(), 'node_modules', '.bin', 'playwright');

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      function safeClose() {
        if (!closed) { closed = true; controller.close(); }
      }

      const proc = spawn(
        playwrightBin,
        ['test', 'tests/crawler.spec.ts', '--project=chromium'],
        { env: { ...process.env, ...crawlerEnv }, cwd: process.cwd() },
      );

      function emit(line: string) {
        if (!closed) controller.enqueue(encoder.encode(`data: ${line}\n\n`));
      }

      function pipeOutput(data: Buffer) {
        data.toString().split('\n').forEach(line => { if (line.trim()) emit(line); });
      }

      proc.stdout.on('data', pipeOutput);
      proc.stderr.on('data', pipeOutput);

      proc.on('close', code => {
        emit(code === 0 ? '__SCAN_COMPLETE__' : '__SCAN_ERROR__');
        safeClose();
      });

      req.signal.addEventListener('abort', () => {
        proc.kill('SIGTERM');
        safeClose();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
