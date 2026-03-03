'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock, ChevronDown, ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react';

interface RecentRun {
  startedAt: string;
  status: string;
  durationMs: number | null;
  summary: string | null;
}

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  timezone: string;
  enabled: boolean;
  lastRun: {
    startedAt: string;
    status: string;
    durationMs: number | null;
  } | null;
  nextRunAt: string | null;
  consecutiveErrors: number;
  recentRuns: RecentRun[];
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

function formatRelativeTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const absDiff = Math.abs(diff);
  const mins = Math.floor(absDiff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (diff > 0) {
    if (mins < 1) return 'now';
    if (mins < 60) return `in ${mins}m`;
    if (hours < 24) return `in ${hours}h ${mins % 60}m`;
    return `in ${days}d`;
  }
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const isOk = status === 'ok' || status === 'success';
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
        isOk
          ? 'bg-mc-accent-green/20 text-mc-accent-green'
          : 'bg-mc-accent-red/20 text-mc-accent-red'
      }`}
    >
      {isOk ? 'OK' : 'ERR'}
    </span>
  );
}

function CronJobRow({ job }: { job: CronJob }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className={`cursor-pointer hover:bg-mc-bg-tertiary/50 transition-colors ${
          !job.enabled ? 'opacity-50' : ''
        }`}
      >
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            {expanded ? (
              <ChevronDown className="w-3 h-3 text-mc-text-secondary flex-shrink-0" />
            ) : (
              <ChevronRight className="w-3 h-3 text-mc-text-secondary flex-shrink-0" />
            )}
            <span className="text-xs text-mc-text truncate max-w-[200px]" title={job.name}>
              {job.name}
            </span>
            {job.consecutiveErrors > 0 && (
              <AlertTriangle className="w-3 h-3 text-mc-accent-yellow flex-shrink-0" />
            )}
          </div>
        </td>
        <td className="px-3 py-2 text-xs text-mc-text-secondary font-mono">
          {job.schedule}
        </td>
        <td className="px-3 py-2 text-xs">
          {job.lastRun ? <StatusBadge status={job.lastRun.status} /> : <span className="text-mc-text-secondary">-</span>}
        </td>
        <td className="px-3 py-2 text-xs text-mc-text-secondary font-mono">
          {job.lastRun ? formatDuration(job.lastRun.durationMs) : '-'}
        </td>
        <td className="px-3 py-2 text-xs text-mc-text-secondary">
          {job.lastRun ? formatRelativeTime(job.lastRun.startedAt) : '-'}
        </td>
        <td className="px-3 py-2 text-xs text-mc-text-secondary">
          {job.nextRunAt ? formatRelativeTime(job.nextRunAt) : '-'}
        </td>
      </tr>
      {expanded && job.recentRuns.length > 0 && (
        <tr>
          <td colSpan={6} className="px-3 py-2 bg-mc-bg/50">
            <div className="pl-5 space-y-1">
              {job.recentRuns.map((run, i) => (
                <div key={i} className="flex items-center gap-3 text-[11px] text-mc-text-secondary">
                  <StatusBadge status={run.status} />
                  <span className="font-mono">{new Date(run.startedAt).toLocaleString()}</span>
                  <span className="font-mono">{formatDuration(run.durationMs)}</span>
                  {run.summary && (
                    <span className="truncate max-w-[300px]" title={run.summary}>
                      {run.summary}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function CronJobsPanel() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchJobs = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/cron-jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
        setTotal(data.total || 0);
      }
    } catch {
      // keep stale data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(() => fetchJobs(), 60000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const enabledCount = jobs.filter((j) => j.enabled).length;
  const errorCount = jobs.filter((j) => j.consecutiveErrors > 0).length;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider">
            Cron Jobs
          </h3>
          <span className="text-xs text-mc-text-secondary">
            {enabledCount}/{total} active
            {errorCount > 0 && (
              <span className="text-mc-accent-yellow ml-1">({errorCount} errors)</span>
            )}
          </span>
        </div>
        <button
          onClick={() => fetchJobs(true)}
          disabled={refreshing}
          className="p-1 rounded hover:bg-mc-bg-tertiary transition-colors text-mc-text-secondary"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-mc-text-secondary text-sm">
            <Clock className="w-5 h-5 mx-auto mb-2 animate-pulse" />
            Loading cron jobs...
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-6 text-center text-mc-text-secondary text-sm">
            No cron jobs found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-mc-border">
                  <th className="px-3 py-2 text-[10px] text-mc-text-secondary font-medium uppercase">Name</th>
                  <th className="px-3 py-2 text-[10px] text-mc-text-secondary font-medium uppercase">Schedule</th>
                  <th className="px-3 py-2 text-[10px] text-mc-text-secondary font-medium uppercase">Status</th>
                  <th className="px-3 py-2 text-[10px] text-mc-text-secondary font-medium uppercase">Duration</th>
                  <th className="px-3 py-2 text-[10px] text-mc-text-secondary font-medium uppercase">Last Run</th>
                  <th className="px-3 py-2 text-[10px] text-mc-text-secondary font-medium uppercase">Next Run</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mc-border/50">
                {jobs.map((job) => (
                  <CronJobRow key={job.id} job={job} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
