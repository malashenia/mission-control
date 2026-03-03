import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

interface ActivityEntry {
  ts: string;
  type: string;
  summary: string;
  detail?: string;
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '100', 10), 500);

  const openclawHome = process.env.OPENCLAW_HOME || `${process.env.HOME}/.openclaw`;
  const activityFile = path.join(openclawHome, 'logs', 'gentos_activity.jsonl');

  if (!existsSync(activityFile)) {
    return NextResponse.json({ date, entries: [], total: 0 });
  }

  try {
    const content = readFileSync(activityFile, 'utf-8');
    const lines = content.split('\n').filter(Boolean);

    const entries: ActivityEntry[] = [];
    for (const line of lines) {
      try {
        const entry: ActivityEntry = JSON.parse(line);
        if (!entry.ts || !entry.type) continue;

        const entryDate = entry.ts.slice(0, 10);
        if (entryDate !== date) continue;

        entries.push({
          ts: entry.ts,
          type: entry.type,
          summary: (entry.summary || '').slice(0, 300),
          detail: entry.detail ? entry.detail.slice(0, 1000) : undefined,
        });
      } catch {
        continue;
      }
    }

    entries.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    const limited = entries.slice(0, limit);

    return NextResponse.json({ date, entries: limited, total: entries.length });
  } catch {
    return NextResponse.json({ date, entries: [], total: 0 });
  }
}
