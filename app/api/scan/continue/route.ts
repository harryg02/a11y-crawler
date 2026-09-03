import { NextResponse } from 'next/server';
import { continueScan } from '../../../../lib/scanManager';

export const dynamic = 'force-dynamic';

/**
 * Resume a scan that died unexpectedly, re-using its saved crawl state.
 * Distinct from /api/scan/resume, which un-pauses a scan that is still running.
 */
export async function POST() {
  try {
    const resumed = continueScan();
    if (!resumed) {
      return NextResponse.json({ error: 'No interrupted scan to resume' }, { status: 404 });
    }
    return NextResponse.json({ success: true, scanId: resumed.scanId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
