import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { ScanRecord } from '../../../lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const reportsDir = path.join(process.cwd(), 'reports');

  if (!fs.existsSync(reportsDir)) {
    return NextResponse.json([]);
  }

  const scans: ScanRecord[] = fs
    .readdirSync(reportsDir)
    .filter(f => f.endsWith('.json'))
    .flatMap(f => {
      try {
        return [JSON.parse(fs.readFileSync(path.join(reportsDir, f), 'utf-8')) as ScanRecord];
      } catch {
        return [];
      }
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json(scans);
}
