import { NextRequest } from 'next/server';
import { getActiveScan, getScanLogs, scanEvents } from '../../../../lib/scanManager';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const active = getActiveScan();
  if (!active) {
    return new Response(null, { status: 204 });
  }

  const encoder = new TextEncoder();
  const logs = getScanLogs(active.id);

  const stream = new ReadableStream({
    start(controller) {
      // 1. Send all historical logs first
      for (const log of logs) {
        controller.enqueue(encoder.encode(`data: ${log.message}\n\n`));
      }

      // 2. Subscribe to live new logs
      const onLog = (data: { scanId: string, message: string }) => {
        if (data.scanId === active.id) {
          try {
            controller.enqueue(encoder.encode(`data: ${data.message}\n\n`));
          } catch {}
        }
      };

      scanEvents.on('log', onLog);

      req.signal.addEventListener('abort', () => {
        scanEvents.off('log', onLog);
        try { controller.close(); } catch {}
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
