'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertOctagon, ChevronDown, ChevronRight, RefreshCw, Filter } from 'lucide-react';

interface ErrorEntry {
  timestamp: string;
  source: string;
  level: string;
  message: string;
  raw: string;
  occurrences: number;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function ErrorRow({ entry }: { entry: ErrorEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-start gap-2 px-3 py-2 hover:bg-mc-bg-tertiary/50 cursor-pointer transition-colors border-b border-mc-border/30"
      >
        <div className="mt-0.5 flex-shrink-0">
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-mc-text-secondary" />
          ) : (
            <ChevronRight className="w-3 h-3 text-mc-text-secondary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] text-mc-text-secondary font-mono">{formatTime(entry.timestamp)}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-mc-accent-red/10 text-mc-accent-red font-medium">
              {entry.source}
            </span>
            {entry.occurrences > 1 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-mc-accent-yellow/20 text-mc-accent-yellow font-mono">
                x{entry.occurrences}
              </span>
            )}
          </div>
          <p className="text-xs text-mc-text truncate">{entry.message}</p>
        </div>
      </div>
      {expanded && (
        <div className="px-3 py-2 bg-mc-bg/80 border-b border-mc-border/30">
          <pre className="text-[10px] text-mc-text-secondary font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
            {entry.raw}
          </pre>
        </div>
      )}
    </>
  );
}

export function ErrorLogPanel() {
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  const fetchErrors = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/errors?hours=24');
      if (res.ok) {
        const data = await res.json();
        setErrors(data.errors || []);
        setCount(data.count || 0);
      }
    } catch {
      // keep stale
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchErrors();
    const interval = setInterval(() => fetchErrors(), 60000);
    return () => clearInterval(interval);
  }, [fetchErrors]);

  const sources = Array.from(new Set(errors.map((e) => e.source))).sort();
  const filtered = sourceFilter === 'all' ? errors : errors.filter((e) => e.source === sourceFilter);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider">
            Error Log
          </h3>
          {count > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-mc-accent-red text-white min-w-[20px] text-center">
              {count}
            </span>
          )}
          <span className="text-xs text-mc-text-secondary">24h</span>
        </div>
        <div className="flex items-center gap-2">
          {sources.length > 1 && (
            <div className="flex items-center gap-1">
              <Filter className="w-3 h-3 text-mc-text-secondary" />
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="text-[10px] bg-mc-bg border border-mc-border rounded px-1.5 py-0.5 text-mc-text-secondary"
              >
                <option value="all">All sources</option>
                {sources.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={() => fetchErrors(true)}
            disabled={refreshing}
            className="p-1 rounded hover:bg-mc-bg-tertiary transition-colors text-mc-text-secondary"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-mc-text-secondary text-sm">
            <AlertOctagon className="w-5 h-5 mx-auto mb-2 animate-pulse" />
            Scanning logs...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-mc-text-secondary text-sm">
            No errors in the last 24 hours
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {filtered.map((entry, i) => (
              <ErrorRow key={`${entry.source}-${entry.timestamp}-${i}`} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
