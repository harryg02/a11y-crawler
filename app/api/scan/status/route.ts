import { NextResponse } from 'next/server';
import { getActiveScan } from '../../../../lib/scanManager';

export const dynamic = 'force-dynamic';

export async function GET() {
  const active = getActiveScan();
  if (active) {
    return NextResponse.json({
      running: active.status === 'running' || active.status === 'stopping' || active.status === 'paused',
      status: active.status,
      scanId: active.id
    });
  }
  return NextResponse.json({ running: false, status: 'idle' });
}
