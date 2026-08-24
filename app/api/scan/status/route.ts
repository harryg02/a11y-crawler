import { NextResponse } from 'next/server';
import { getActiveScan, getInterruptedScan } from '../../../../lib/scanManager';

export const dynamic = 'force-dynamic';

export async function GET() {
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
    });
  }
  return NextResponse.json({
    running: false,
    status: interrupted ? 'interrupted' : 'idle',
    interrupted: interrupted && {
      scanId: interrupted.scanId,
      requiresLogin: interrupted.requiresLogin,
      pagesDone: interrupted.pagesDone,
      pagesQueued: interrupted.pagesQueued,
    },
  });
}
