import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const ERROR_PATTERNS = /\berror\b|\bERROR\b|\bfailed\b|\bFAILED\b|\bexception\b|\bException\b|\bFATAL\b|\bpanic\b/;
const MAX_RESULTS = 100;

interface ErrorEntry {
  timestamp: string;
  source: string;
  level: string;
  message: string;
  raw: string;
  occurrences: number;
}

function sourceFromFilename(filename: string): string {
  const name = filename.replace(/\.(log|jsonl|err\.log|out\.log)$/, '');
  if (name.startsWith('cron_')) return `cron:${name.slice(5)}`;
  return name;
}

function extractTimestamp(line: string): string | null {
  const isoMatch = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  if (isoMatch) return isoMatch[0];

  const dateMatch = line.match(/\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/);
  if (dateMatch) return new Date(dateMatch[0]).toISOString();

  return null;
}

function parseLogLine(line: string, source: string): { timestamp: string; level: string; message: string } | null {
  try {
    const parsed = JSON.parse(line);
    const ts = parsed.ts || parsed.timestamp || parsed.time || parsed.date;
    const msg = parsed.message || parsed.msg || parsed.error || parsed.summary || '';
    const level = parsed.level || parsed.severity || 'error';

    if (!msg || !ERROR_PATTERNS.test(line)) return null;

    let timestamp: string;
    if (typeof ts === 'number') {
      timestamp = new Date(ts > 1e12 ? ts : ts * 1000).toISOString();
    } else if (typeof ts === 'string') {
      timestamp = new Date(ts).toISOString();
    } else {
      timestamp = new Date().toISOString();
    }

    return { timestamp, level: String(level), message: String(msg).slice(0, 500) };
  } catch {
    if (!ERROR_PATTERNS.test(line)) return null;

    const timestamp = extractTimestamp(line) || new Date().toISOString();
    return { timestamp, level: 'error', message: line.trim().slice(0, 500) };
  }
}

export async function GET(request: NextRequest) {
  const hours = parseInt(request.nextUrl.searchParams.get('hours') || '24', 10);
  const openclawHome = process.env.OPENCLAW_HOME || `${process.env.HOME}/.openclaw`;
  const logsDir = path.join(openclawHome, 'logs');

  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const dedupMap = new Map<string, ErrorEntry>();

  try {
    const files = readdirSync(logsDir).filter(
      (f) => f.endsWith('.log') || f.endsWith('.jsonl')
    );

    for (const file of files) {
      const filePath = path.join(logsDir, file);
      try {
        const stat = statSync(filePath);
        if (stat.mtimeMs < cutoff) continue;
        if (stat.size > 10 * 1024 * 1024) continue;

        const source = sourceFromFilename(file);
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        const recentLines = lines.slice(-1000);

        for (const line of recentLines) {
          if (!line.trim()) continue;

          const parsed = parseLogLine(line, source);
          if (!parsed) continue;

          const entryTime = new Date(parsed.timestamp).getTime();
          if (entryTime < cutoff && !isNaN(entryTime)) continue;

          const key = `${source}:${parsed.message.slice(0, 100)}`;

          const existing = dedupMap.get(key);
          if (existing) {
            existing.occurrences++;
            if (parsed.timestamp > existing.timestamp) {
              existing.timestamp = parsed.timestamp;
            }
          } else {
            dedupMap.set(key, {
              timestamp: parsed.timestamp,
              source,
              level: parsed.level,
              message: parsed.message,
              raw: line.trim().slice(0, 1000),
              occurrences: 1,
            });
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    return NextResponse.json({ count: 0, periodHours: hours, errors: [] });
  }

  const errors = Array.from(dedupMap.values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, MAX_RESULTS);

  return NextResponse.json({
    count: errors.length,
    periodHours: hours,
    errors,
  });
}
