import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const filePath = path.join(process.cwd(), 'reports', `report-${id}.json`);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const scan = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return NextResponse.json(scan);
  } catch {
    return NextResponse.json({ error: 'Failed to read report' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const filePath = path.join(process.cwd(), 'reports', `report-${id}.json`);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  fs.unlinkSync(filePath);
  return NextResponse.json({ ok: true });
}
