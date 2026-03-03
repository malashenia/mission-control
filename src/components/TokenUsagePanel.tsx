'use client';

import { useState, useEffect, useCallback } from 'react';
import { Coins, RefreshCw, Info } from 'lucide-react';

interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  messageCount: number;
}

interface TokenUsageData {
  available: boolean;
  period?: string;
  totalTokens?: number;
  estimatedCostUSD?: number;
  sessionsParsed?: number;
  byModel?: ModelUsage[];
  note?: string;
  reason?: string;
}

type Period = 'today' | 'week' | 'month';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function modelShortName(model: string): string {
  if (model.includes('opus')) return 'Opus 4.6';
  if (model.includes('sonnet')) return 'Sonnet 4.6';
  if (model.includes('haiku')) return 'Haiku 4.5';
  if (model.includes('gpt-4o-mini')) return 'GPT-4o Mini';
  if (model.includes('gpt-4o')) return 'GPT-4o';
  return model;
}

export function TokenUsagePanel() {
  const [data, setData] = useState<TokenUsageData | null>(null);
  const [period, setPeriod] = useState<Period>('today');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUsage = useCallback(async (p: Period, isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch(`/api/token-usage?period=${p}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      setData({ available: false, reason: 'fetch failed' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchUsage(period);
  }, [period, fetchUsage]);

  const maxCost = data?.byModel?.length
    ? Math.max(...data.byModel.map((m) => m.costUSD))
    : 0;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider">
            Token Usage
          </h3>
          <div className="flex rounded-md border border-mc-border overflow-hidden">
            {(['today', 'week', 'month'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                  period === p
                    ? 'bg-mc-accent text-mc-bg'
                    : 'text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary'
                }`}
              >
                {p === 'today' ? 'Today' : p === 'week' ? '7d' : '30d'}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => fetchUsage(period, true)}
          disabled={refreshing}
          className="p-1 rounded hover:bg-mc-bg-tertiary transition-colors text-mc-text-secondary"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
        {loading ? (
          <div className="text-center py-4 text-mc-text-secondary text-sm">
            <Coins className="w-5 h-5 mx-auto mb-2 animate-pulse" />
            Loading usage data...
          </div>
        ) : !data?.available ? (
          <div className="text-center py-4">
            <Info className="w-5 h-5 mx-auto mb-2 text-mc-text-secondary" />
            <p className="text-sm text-mc-text-secondary">Token tracking not available</p>
            <p className="text-xs text-mc-text-secondary mt-1">
              {data?.reason || 'No session data found for this period'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-2xl font-bold text-mc-text font-mono">
                ${data.estimatedCostUSD?.toFixed(2)}
              </span>
              <span className="text-xs text-mc-text-secondary">
                estimated &middot; {formatTokens(data.totalTokens || 0)} tokens &middot; {data.sessionsParsed} sessions
              </span>
            </div>

            {data.byModel && data.byModel.length > 0 && (
              <div className="space-y-2">
                {data.byModel.map((model) => (
                  <div key={model.model} className="flex items-center gap-3">
                    <span className="text-xs text-mc-text w-24 truncate" title={model.model}>
                      {modelShortName(model.model)}
                    </span>
                    <div className="flex-1 h-2 bg-mc-bg-tertiary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-mc-accent rounded-full transition-all"
                        style={{ width: maxCost > 0 ? `${(model.costUSD / maxCost) * 100}%` : '0%' }}
                      />
                    </div>
                    <span className="text-xs text-mc-text font-mono w-14 text-right">
                      ${model.costUSD.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-mc-text-secondary w-16 text-right">
                      {formatTokens(model.inputTokens + model.outputTokens)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {data.note && (
              <p className="text-[10px] text-mc-text-secondary mt-3 opacity-60">{data.note}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
