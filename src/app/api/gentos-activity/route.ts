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

// Gateway log line patterns: "2026-03-03T00:00:50.822Z [source] message"
// or with offset:             "2026-03-03T13:43:47.627-05:00 message"
const LOG_LINE_RE = /^(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))\s+(.+)$/;
const TAG_RE = /^\[([^\]]+)\]\s*(.*)$/;

// Noise patterns to skip
const SKIP_PATTERNS = [
  /typing TTL reached/,
  /\[ws\]/,
  /\[canvas\] host mounted/,
  /^\[telegram\] \[default\] starting provider/,
];

function parseGatewayLine(line: string, dateFilter: string): ActivityEntry | null {
  const match = line.match(LOG_LINE_RE);
  if (!match) return null;

  const [, timestamp, rest] = match;

  // Date filter: check if timestamp starts with the target date
  if (!timestamp.startsWith(dateFilter)) return null;

  // Skip noise
  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(rest)) return null;
  }

  // Extract [tag] if present
  const tagMatch = rest.match(TAG_RE);
  const tag = tagMatch ? tagMatch[1] : '';
  const message = tagMatch ? tagMatch[2] : rest;

  // Map to activity type
  if (tag === 'telegram' && message.startsWith('sendMessage ok')) {
    const chatMatch = message.match(/chat=(-?\d+)/);
    const msgMatch = message.match(/message=(\d+)/);
    return {
      ts: timestamp,
      type: 'chat',
      summary: `Message sent${chatMatch ? ` to ${chatMatch[1]}` : ''}`,
      detail: msgMatch ? `Message ID: ${msgMatch[1]}` : undefined,
    };
  }

  if (tag === 'gateway' && message.includes('cron:')) {
    const action = message.replace('cron: ', '').trim();
    return {
      ts: timestamp,
      type: 'cron',
      summary: `Cron ${action}`,
    };
  }

  if (tag === 'health-monitor') {
    return {
      ts: timestamp,
      type: 'heartbeat',
      summary: message.replace(/\[telegram:default\]\s*/, '').trim(),
    };
  }

  if (tag.startsWith('agents/tool')) {
    return {
      ts: timestamp,
      type: 'web',
      summary: message.slice(0, 200),
      detail: `Source: ${tag}`,
    };
  }

  if (tag.startsWith('browser/')) {
    return {
      ts: timestamp,
      type: 'web',
      summary: message.slice(0, 200),
    };
  }

  // Skip unknown tags
  return null;
}

/**
 * Group consecutive chat messages (within 10s) into batches
 * to reduce sidebar clutter.
 */
function groupChatMessages(entries: ActivityEntry[]): ActivityEntry[] {
  const result: ActivityEntry[] = [];
  let chatBatch: ActivityEntry[] = [];

  function flushBatch() {
    if (chatBatch.length === 0) return;
    if (chatBatch.length === 1) {
      result.push(chatBatch[0]);
    } else {
      const first = chatBatch[0];
      const last = chatBatch[chatBatch.length - 1];
      const ids = chatBatch
        .map(e => e.detail?.replace('Message ID: ', ''))
        .filter(Boolean)
        .join(', ');
      result.push({
        ts: first.ts,
        type: 'chat',
        summary: `Sent ${chatBatch.length} messages`,
        detail: `IDs: ${ids} (${new Date(last.ts).toLocaleTimeString()} — ${new Date(first.ts).toLocaleTimeString()})`,
      });
    }
    chatBatch = [];
  }

  // Entries are already sorted desc (newest first)
  for (const entry of entries) {
    if (entry.type !== 'chat') {
      flushBatch();
      result.push(entry);
      continue;
    }

    if (chatBatch.length === 0) {
      chatBatch.push(entry);
      continue;
    }

    const prevTs = new Date(chatBatch[chatBatch.length - 1].ts).getTime();
    const currTs = new Date(entry.ts).getTime();

    // Group if within 10 seconds (entries are desc, so prev is newer)
    if (prevTs - currTs < 10_000) {
      chatBatch.push(entry);
    } else {
      flushBatch();
      chatBatch.push(entry);
    }
  }
  flushBatch();

  return result;
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '100', 10), 500);

  const openclawHome = process.env.OPENCLAW_HOME || `${process.env.HOME}/.openclaw`;
  const entries: ActivityEntry[] = [];

  // Source 1: gateway.log (live events)
  const gatewayLog = path.join(openclawHome, 'logs', 'gateway.log');
  if (existsSync(gatewayLog)) {
    try {
      const content = readFileSync(gatewayLog, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (!line.startsWith(date)) continue; // fast skip non-matching dates
        const entry = parseGatewayLine(line, date);
        if (entry) entries.push(entry);
      }
    } catch {
      // gateway.log read error — continue with other sources
    }
  }

  // Source 2: gentos_activity.jsonl (manually logged / enriched events)
  const activityFile = path.join(openclawHome, 'logs', 'gentos_activity.jsonl');
  if (existsSync(activityFile)) {
    try {
      const content = readFileSync(activityFile, 'utf-8');
      for (const line of content.split('\n').filter(Boolean)) {
        try {
          const entry: ActivityEntry = JSON.parse(line);
          if (!entry.ts || !entry.type) continue;
          if (!entry.ts.startsWith(date)) continue;
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
    } catch {
      // jsonl read error
    }
  }

  // Sort newest first
  entries.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  // Group consecutive chat messages
  const grouped = groupChatMessages(entries);
  const limited = grouped.slice(0, limit);

  return NextResponse.json({ date, entries: limited, total: grouped.length });
}
