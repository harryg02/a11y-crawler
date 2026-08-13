import { NextResponse } from 'next/server';
import fs from 'fs';
import { LOGIN_COMPLETE_FILE } from '../../../../lib/paths';

export async function POST() {
  fs.writeFileSync(LOGIN_COMPLETE_FILE(), '');
  return NextResponse.json({ ok: true });
}
