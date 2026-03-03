import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const MODEL_RATES: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  'claude-sonnet-4-6': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-opus-4-6': { inputPerMTok: 15, outputPerMTok: 75 },
  'claude-haiku-4-5': { inputPerMTok: 0.8, outputPerMTok: 4 },
  'gpt-4o-mini': { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  'gpt-4o': { inputPerMTok: 2.5, outputPerMTok: 10 },
};

function getDefaultRate() {
  return { inputPerMTok: 3, outputPerMTok: 15 };
}

interface SessionEntry {
  type: string;
  timestamp?: string;
  provider?: string;
  modelId?: string;
  message?: {
    role?: string;
    content?: Array<{ type: string; text?: string; thinking?: string }>;
  };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  messageCount: number;
}

function getPeriodStart(period: string): Date {
  const now = new Date();
  switch (period) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'month': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    default:
      return new Date(0);
  }
}

function estimateTokensFromContent(content: Array<{ type: string; text?: string; thinking?: string }>): number {
  let chars = 0;
  for (const part of content) {
    if (part.text) chars += part.text.length;
    if (part.thinking) chars += part.thinking.length;
  }
  return Math.round(chars / 4);
}

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get('period') || 'today';
  const openclawHome = process.env.OPENCLAW_HOME || `${process.env.HOME}/.openclaw`;
  const sessionsDir = path.join(openclawHome, 'agents', 'main', 'sessions');

  const periodStart = getPeriodStart(period);
  const periodStartMs = periodStart.getTime();

  const usage: Record<string, ModelUsage> = {};
  let sessionsParsed = 0;

  try {
    const files = readdirSync(sessionsDir).filter((f) => f.endsWith('.jsonl'));

    for (const file of files) {
      const filePath = path.join(sessionsDir, file);
      try {
        const stat = statSync(filePath);
        if (stat.mtimeMs < periodStartMs) continue;

        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(Boolean);

        let currentModel = 'unknown';
        let fileHasData = false;

        for (const line of lines) {
          try {
            const entry: SessionEntry = JSON.parse(line);

            if (entry.provider && entry.modelId) {
              currentModel = entry.modelId;
            }

            if (entry.timestamp) {
              const entryTime = new Date(entry.timestamp).getTime();
              if (entryTime < periodStartMs) continue;
            }

            if (entry.type === 'message' && entry.message?.role === 'assistant' && entry.message.content) {
              fileHasData = true;
              const model = currentModel;

              if (!usage[model]) {
                usage[model] = { model, inputTokens: 0, outputTokens: 0, costUSD: 0, messageCount: 0 };
              }

              if (entry.usage) {
                usage[model].inputTokens += entry.usage.inputTokens || 0;
                usage[model].outputTokens += entry.usage.outputTokens || 0;
              } else {
                const estimated = estimateTokensFromContent(entry.message.content);
                usage[model].outputTokens += estimated;
              }

              usage[model].messageCount += 1;
            }

            if (entry.type === 'message' && entry.message?.role === 'user' && entry.message.content) {
              const model = currentModel;
              if (!usage[model]) {
                usage[model] = { model, inputTokens: 0, outputTokens: 0, costUSD: 0, messageCount: 0 };
              }
              const estimated = estimateTokensFromContent(entry.message.content);
              usage[model].inputTokens += estimated;
            }
          } catch {
            continue;
          }
        }

        if (fileHasData) sessionsParsed++;
      } catch {
        continue;
      }
    }
  } catch {
    return NextResponse.json({ available: false, reason: 'sessions directory not accessible' });
  }

  if (sessionsParsed === 0) {
    return NextResponse.json({ available: false, reason: 'no session data for this period' });
  }

  const byModel = Object.values(usage).map((m) => {
    const rates = MODEL_RATES[m.model] || getDefaultRate();
    m.costUSD = (m.inputTokens / 1_000_000) * rates.inputPerMTok + (m.outputTokens / 1_000_000) * rates.outputPerMTok;
    m.costUSD = Math.round(m.costUSD * 100) / 100;
    return m;
  });

  byModel.sort((a, b) => b.costUSD - a.costUSD);

  const totalTokens = byModel.reduce((sum, m) => sum + m.inputTokens + m.outputTokens, 0);
  const estimatedCostUSD = Math.round(byModel.reduce((sum, m) => sum + m.costUSD, 0) * 100) / 100;

  return NextResponse.json({
    available: true,
    period,
    totalTokens,
    estimatedCostUSD,
    sessionsParsed,
    byModel,
    note: 'Token counts are estimated from message content length (~4 chars/token)',
  });
}
