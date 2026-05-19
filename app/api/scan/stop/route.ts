import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST() {
  fs.writeFileSync(path.join(process.cwd(), '.stop'), '');
  return NextResponse.json({ ok: true });
}
