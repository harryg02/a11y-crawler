import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { ScanRecord, ScanSummary } from '../../../lib/types';
import { reportsDir } from '../../../lib/paths';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dir = reportsDir();

  const summaries: ScanSummary[] = fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .flatMap(f => {
      try {
        const scan = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as ScanRecord;
        return [{
          id: scan.id,
          url: scan.url,
          scope: scan.scope,
          date: scan.date,
          durationSeconds: scan.durationSeconds,
          pageCount: scan.pages.length,
          violationCount: scan.pages.reduce((sum, p) => sum + p.violations.length, 0),
        }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json(summaries);
}
