import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getActiveScan, getInterruptedScan, getScanOutcome } from '../../../../lib/scanManager';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // ?scanId= asks about one specific run, so a client whose scan died before it
  // could attach to the stream can still find out why.
  const scanId = new URL(req.url).searchParams.get('scanId');
  const outcome = scanId ? getScanOutcome(scanId) : null;
  const active = getActiveScan();
  // Surfaced alongside the active scan so a reload can offer to resume a run
  // that died while the page was closed.
  const interrupted = getInterruptedScan();
  if (active) {
    return NextResponse.json({
      running: active.status === 'running' || active.status === 'stopping' || active.status === 'paused',
      status: active.status,
      scanId: active.id,
      interrupted: null,
      outcome,
    });
  }
  return NextResponse.json({
    running: false,
    status: interrupted ? 'interrupted' : 'idle',
    outcome,
    interrupted: interrupted && {
      scanId: interrupted.scanId,
      requiresLogin: interrupted.requiresLogin,
      pagesDone: interrupted.pagesDone,
      pagesQueued: interrupted.pagesQueued,
    },
  });
}
