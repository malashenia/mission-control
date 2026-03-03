import { NextResponse } from 'next/server';
import { readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

interface CronJobSchedule {
  kind: string;
  expr?: string;
  tz?: string;
  intervalMs?: number;
  staggerMs?: number;
}

interface CronJobState {
  lastRunAtMs?: number;
  lastStatus?: string;
  lastDurationMs?: number;
  consecutiveErrors?: number;
  nextRunAtMs?: number;
  lastRunStatus?: string;
}

interface CronJobRaw {
  id: string;
  name: string;
  enabled: boolean;
  schedule: CronJobSchedule;
  state?: CronJobState;
  payload?: {
    kind?: string;
    message?: string;
    timeoutSeconds?: number;
  };
  delivery?: {
    mode?: string;
    target?: string;
  };
}

interface RunEntry {
  ts: number;
  action: string;
  status?: string;
  durationMs?: number;
  summary?: string;
  runAtMs?: number;
}

interface CronJobResponse {
  id: string;
  name: string;
  schedule: string;
  timezone: string;
  enabled: boolean;
  lastRun: {
    startedAt: string | null;
    status: string;
    durationMs: number | null;
  } | null;
  nextRunAt: string | null;
  consecutiveErrors: number;
  recentRuns: Array<{
    startedAt: string;
    status: string;
    durationMs: number | null;
    summary: string | null;
  }>;
}

function formatSchedule(schedule: CronJobSchedule): string {
  if (schedule.kind === 'cron' && schedule.expr) {
    return `cron: ${schedule.expr}`;
  }
  if (schedule.kind === 'interval' && schedule.intervalMs) {
    const mins = Math.round(schedule.intervalMs / 60000);
    if (mins >= 60) return `every ${Math.round(mins / 60)}h`;
    return `every ${mins}m`;
  }
  return schedule.kind;
}

function readRunHistory(jobId: string, runsDir: string, limit: number): RunEntry[] {
  const runFile = path.join(runsDir, `${jobId}.jsonl`);
  if (!existsSync(runFile)) return [];

  try {
    const content = readFileSync(runFile, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const entries: RunEntry[] = [];

    for (const line of lines.slice(-limit * 2)) {
      try {
        const entry = JSON.parse(line) as RunEntry;
        if (entry.action === 'finished') {
          entries.push(entry);
        }
      } catch {
        continue;
      }
    }

    return entries.slice(-limit).reverse();
  } catch {
    return [];
  }
}

export async function GET() {
  const openclawHome = process.env.OPENCLAW_HOME || `${process.env.HOME}/.openclaw`;
  const jobsFile = path.join(openclawHome, 'cron', 'jobs.json');

  if (!existsSync(jobsFile)) {
    return NextResponse.json({ error: 'jobs.json not found', jobs: [] });
  }

  try {
    const raw = JSON.parse(readFileSync(jobsFile, 'utf-8'));
    const jobsList: CronJobRaw[] = Array.isArray(raw) ? raw : (raw.jobs || []);
    const runsDir = path.join(openclawHome, 'cron', 'runs');

    const jobs: CronJobResponse[] = jobsList.map((job) => {
      const runs = readRunHistory(job.id, runsDir, 5);

      const lastRun = job.state?.lastRunAtMs
        ? {
            startedAt: new Date(job.state.lastRunAtMs).toISOString(),
            status: job.state.lastStatus || job.state.lastRunStatus || 'unknown',
            durationMs: job.state.lastDurationMs ?? null,
          }
        : null;

      const nextRunAt = job.state?.nextRunAtMs
        ? new Date(job.state.nextRunAtMs).toISOString()
        : null;

      return {
        id: job.id,
        name: job.name,
        schedule: formatSchedule(job.schedule),
        timezone: job.schedule.tz || 'UTC',
        enabled: job.enabled,
        lastRun,
        nextRunAt,
        consecutiveErrors: job.state?.consecutiveErrors ?? 0,
        recentRuns: runs.map((r) => ({
          startedAt: new Date(r.runAtMs || r.ts).toISOString(),
          status: r.status || 'unknown',
          durationMs: r.durationMs ?? null,
          summary: r.summary ? r.summary.slice(0, 200) : null,
        })),
      };
    });

    jobs.sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      const aNext = a.nextRunAt ? new Date(a.nextRunAt).getTime() : Infinity;
      const bNext = b.nextRunAt ? new Date(b.nextRunAt).getTime() : Infinity;
      return aNext - bNext;
    });

    return NextResponse.json({ jobs, total: jobs.length });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to read cron jobs: ${err instanceof Error ? err.message : String(err)}`, jobs: [] },
      { status: 500 }
    );
  }
}
