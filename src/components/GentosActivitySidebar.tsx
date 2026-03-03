'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight as ChevronRightIcon, RefreshCw, Activity } from 'lucide-react';

interface ActivityEntry {
  ts: string;
  type: string;
  summary: string;
  detail?: string;
}

const TYPE_ICONS: Record<string, string> = {
  cron: '\u{1F550}',
  heartbeat: '\u{1F493}',
  research: '\u{1F50D}',
  asana: '\u{1F4CC}',
  memory: '\u{270F}\u{FE0F}',
  web: '\u{1F310}',
  chat: '\u{1F4AC}',
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' });
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function ActivityItem({ entry }: { entry: ActivityEntry }) {
  const [expanded, setExpanded] = useState(false);
  const icon = TYPE_ICONS[entry.type] || '\u{2699}\u{FE0F}';

  return (
    <div
      className="px-3 py-2 hover:bg-mc-bg-tertiary/50 cursor-pointer transition-colors border-b border-mc-border/20"
      onClick={() => entry.detail && setExpanded(!expanded)}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm flex-shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] text-mc-text-secondary font-mono">{formatTime(entry.ts)}</span>
            <span className="text-[10px] px-1 py-0.5 rounded bg-mc-bg-tertiary text-mc-text-secondary capitalize">
              {entry.type}
            </span>
          </div>
          <p className="text-xs text-mc-text leading-relaxed">{entry.summary}</p>
          {expanded && entry.detail && (
            <pre className="mt-1 text-[10px] text-mc-text-secondary font-mono whitespace-pre-wrap break-all max-h-20 overflow-y-auto">
              {entry.detail}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export function GentosActivitySidebar() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchActivity = useCallback(async (d: string, isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch(`/api/gentos-activity?date=${d}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setTotal(data.total || 0);
      }
    } catch {
      // keep stale
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchActivity(date);
    const interval = setInterval(() => fetchActivity(date), 30000);
    return () => clearInterval(interval);
  }, [date, fetchActivity]);

  const isToday = date === new Date().toISOString().slice(0, 10);

  return (
    <div className="w-[300px] flex-shrink-0 bg-mc-bg-secondary border-l border-mc-border hidden lg:flex flex-col h-screen sticky top-0">
      <div className="px-3 py-3 border-b border-mc-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-mc-accent" />
            <span className="text-sm font-medium text-mc-text">Gentos Activity</span>
          </div>
          <button
            onClick={() => fetchActivity(date, true)}
            disabled={refreshing}
            className="p-1 rounded hover:bg-mc-bg-tertiary transition-colors text-mc-text-secondary"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={() => setDate(shiftDate(date, -1))}
            className="p-1 rounded hover:bg-mc-bg-tertiary text-mc-text-secondary"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-mc-text-secondary">{formatDate(date)}</span>
          <button
            onClick={() => !isToday && setDate(shiftDate(date, 1))}
            disabled={isToday}
            className="p-1 rounded hover:bg-mc-bg-tertiary text-mc-text-secondary disabled:opacity-30"
          >
            <ChevronRightIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        {total > 0 && (
          <div className="text-[10px] text-mc-text-secondary text-center mt-1">
            {total} event{total !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center text-mc-text-secondary text-sm">
            <Activity className="w-5 h-5 mx-auto mb-2 animate-pulse" />
            Loading...
          </div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-center text-mc-text-secondary text-xs">
            No activity logged{isToday ? ' yet today' : ` on ${formatDate(date)}`}
          </div>
        ) : (
          entries.map((entry, i) => (
            <ActivityItem key={`${entry.ts}-${i}`} entry={entry} />
          ))
        )}
      </div>
    </div>
  );
}
