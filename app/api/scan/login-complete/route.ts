import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST() {
  const signalFile = path.join(process.cwd(), '.login-complete');
  fs.writeFileSync(signalFile, '');
  return NextResponse.json({ ok: true });
}
