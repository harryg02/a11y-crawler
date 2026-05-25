import { NextResponse } from 'next/server';
import { resumeScan } from '../../../../lib/scanManager';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    resumeScan();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
