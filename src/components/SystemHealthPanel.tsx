'use client';

import { useState, useEffect, useCallback } from 'react';
import { Server, Database, HardDrive, Cpu, RefreshCw } from 'lucide-react';

interface GatewayHealth {
  status: 'up' | 'down' | 'unknown';
  latencyMs: number | null;
}

interface PostgresHealth {
  status: 'up' | 'down';
  port: number;
  dbSizeMB: number | null;
  connections: number | null;
}

interface DiskHealth {
  totalGB: number;
  usedGB: number;
  freeGB: number;
  percentUsed: number;
}

interface MemoryHealth {
  totalMB: number;
  usedMB: number;
}

interface SystemHealth {
  gateway: GatewayHealth;
  postgres: PostgresHealth;
  disk: DiskHealth;
  memory: MemoryHealth;
  checkedAt: string;
}

type HealthStatus = 'up' | 'down' | 'unknown' | 'warning' | 'loading';

function statusColor(status: HealthStatus): string {
  switch (status) {
    case 'up': return 'bg-mc-accent-green';
    case 'down': return 'bg-mc-accent-red';
    case 'warning': return 'bg-mc-accent-yellow';
    case 'unknown': return 'bg-mc-accent-yellow';
    case 'loading': return 'bg-mc-text-secondary animate-pulse';
  }
}

function statusBorder(status: HealthStatus): string {
  switch (status) {
    case 'up': return 'border-mc-accent-green/30';
    case 'down': return 'border-mc-accent-red/30';
    case 'warning': return 'border-mc-accent-yellow/30';
    case 'unknown': return 'border-mc-accent-yellow/30';
    case 'loading': return 'border-mc-border';
  }
}

function StatusDot({ status }: { status: HealthStatus }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${statusColor(status)}`} />;
}

function HealthCard({
  icon: Icon,
  title,
  status,
  children,
}: {
  icon: typeof Server;
  title: string;
  status: HealthStatus;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-mc-bg-secondary border ${statusBorder(status)} rounded-lg p-4 min-w-0`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-mc-text-secondary" />
          <span className="text-sm font-medium text-mc-text">{title}</span>
        </div>
        <StatusDot status={status} />
      </div>
      <div className="space-y-1 text-xs text-mc-text-secondary">
        {children}
      </div>
    </div>
  );
}

export function SystemHealthPanel() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHealth = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/system-health');
      if (res.ok) {
        setHealth(await res.json());
      }
    } catch {
      // keep stale data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(() => fetchHealth(), 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const gwStatus: HealthStatus = loading ? 'loading' : health?.gateway.status ?? 'unknown';
  const pgStatus: HealthStatus = loading ? 'loading' : health?.postgres.status ?? 'down';
  const diskStatus: HealthStatus = loading
    ? 'loading'
    : health && health.disk.percentUsed > 90
      ? 'warning'
      : health && health.disk.percentUsed > 0
        ? 'up'
        : 'unknown';
  const memStatus: HealthStatus = loading
    ? 'loading'
    : health && health.memory.totalMB > 0
      ? health.memory.usedMB / health.memory.totalMB > 0.9 ? 'warning' : 'up'
      : 'unknown';

  const checkedAt = health?.checkedAt
    ? new Date(health.checkedAt).toLocaleTimeString()
    : null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider">
          System Health
        </h3>
        <div className="flex items-center gap-2 text-xs text-mc-text-secondary">
          {checkedAt && <span>Updated {checkedAt}</span>}
          <button
            onClick={() => fetchHealth(true)}
            disabled={refreshing}
            className="p-1 rounded hover:bg-mc-bg-tertiary transition-colors"
            title="Refresh now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <HealthCard icon={Server} title="Gateway" status={gwStatus}>
          {health ? (
            <>
              <div className="flex justify-between">
                <span>Status</span>
                <span className="text-mc-text font-mono">{health.gateway.status}</span>
              </div>
              {health.gateway.latencyMs !== null && (
                <div className="flex justify-between">
                  <span>Latency</span>
                  <span className="text-mc-text font-mono">{health.gateway.latencyMs}ms</span>
                </div>
              )}
            </>
          ) : (
            <div className="h-8" />
          )}
        </HealthCard>

        <HealthCard icon={Database} title="Postgres" status={pgStatus}>
          {health ? (
            <>
              <div className="flex justify-between">
                <span>Port</span>
                <span className="text-mc-text font-mono">{health.postgres.port}</span>
              </div>
              {health.postgres.dbSizeMB !== null && (
                <div className="flex justify-between">
                  <span>DB Size</span>
                  <span className="text-mc-text font-mono">{health.postgres.dbSizeMB} MB</span>
                </div>
              )}
              {health.postgres.connections !== null && (
                <div className="flex justify-between">
                  <span>Connections</span>
                  <span className="text-mc-text font-mono">{health.postgres.connections}</span>
                </div>
              )}
            </>
          ) : (
            <div className="h-8" />
          )}
        </HealthCard>

        <HealthCard icon={HardDrive} title="Disk" status={diskStatus}>
          {health && health.disk.totalGB > 0 ? (
            <>
              <div className="flex justify-between">
                <span>Used</span>
                <span className="text-mc-text font-mono">
                  {health.disk.usedGB}/{health.disk.totalGB} GB
                </span>
              </div>
              <div className="flex justify-between">
                <span>Free</span>
                <span className="text-mc-text font-mono">{health.disk.freeGB} GB</span>
              </div>
              <div className="mt-1.5">
                <div className="h-1.5 bg-mc-bg-tertiary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      health.disk.percentUsed > 90
                        ? 'bg-mc-accent-red'
                        : health.disk.percentUsed > 75
                          ? 'bg-mc-accent-yellow'
                          : 'bg-mc-accent-green'
                    }`}
                    style={{ width: `${health.disk.percentUsed}%` }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="h-8" />
          )}
        </HealthCard>

        <HealthCard icon={Cpu} title="Memory" status={memStatus}>
          {health && health.memory.totalMB > 0 ? (
            <>
              <div className="flex justify-between">
                <span>Used</span>
                <span className="text-mc-text font-mono">
                  {Math.round(health.memory.usedMB / 1024)}/{Math.round(health.memory.totalMB / 1024)} GB
                </span>
              </div>
              <div className="mt-1.5">
                <div className="h-1.5 bg-mc-bg-tertiary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      health.memory.usedMB / health.memory.totalMB > 0.9
                        ? 'bg-mc-accent-red'
                        : health.memory.usedMB / health.memory.totalMB > 0.75
                          ? 'bg-mc-accent-yellow'
                          : 'bg-mc-accent-green'
                    }`}
                    style={{ width: `${Math.round((health.memory.usedMB / health.memory.totalMB) * 100)}%` }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="h-8" />
          )}
        </HealthCard>
      </div>
    </div>
  );
}
