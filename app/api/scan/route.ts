import { NextRequest, NextResponse } from 'next/server';
import { startScan, getActiveScan } from '../../../lib/scanManager';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const config = await req.json();

    const existing = getActiveScan();
    if (existing && existing.status !== 'error' && existing.status !== 'completed' && existing.status !== 'stopped' && existing.status !== 'unreachable') {
      return NextResponse.json({ error: 'A scan is already running' }, { status: 409 });
    }

    const scanId = startScan(config);

    return NextResponse.json({ success: true, scanId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
