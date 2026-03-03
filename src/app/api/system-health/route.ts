import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

// Singleton pool — reused across requests, not created per-request
let pgPool: Pool | null = null;

function getPool(): Pool {
  if (!pgPool) {
    pgPool = new Pool({
      host: process.env.POSTGRES_HOST || '127.0.0.1',
      port: parseInt(process.env.POSTGRES_PORT || '5434', 10),
      database: process.env.POSTGRES_DB || 'openclaw',
      user: process.env.POSTGRES_USER || 'openclaw',
      password: process.env.POSTGRES_PASSWORD || '',
      connectionTimeoutMillis: 3000,
      max: 2,
      idleTimeoutMillis: 30000,
    });
    pgPool.on('error', (err) => {
      console.error('[SystemHealth] Postgres pool error:', err.message);
      pgPool = null;
    });
  }
  return pgPool;
}

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

interface SystemHealthResponse {
  gateway: GatewayHealth;
  postgres: PostgresHealth;
  disk: DiskHealth;
  memory: MemoryHealth;
  checkedAt: string;
}

async function checkGateway(): Promise<GatewayHealth> {
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';
  const httpUrl = gatewayUrl.replace(/^ws/, 'http');

  const endpoints = ['/health', '/api/status', '/'];
  for (const endpoint of endpoints) {
    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${httpUrl}${endpoint}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok || res.status < 500) {
        return { status: 'up', latencyMs: Date.now() - start };
      }
    } catch {
      continue;
    }
  }

  try {
    execSync('pgrep -f "openclaw.*gateway"', { timeout: 2000 });
    return { status: 'up', latencyMs: null };
  } catch {
    return { status: 'down', latencyMs: null };
  }
}

async function checkPostgres(): Promise<PostgresHealth> {
  const port = parseInt(process.env.POSTGRES_PORT || '5434', 10);
  const pool = getPool();

  try {
    const client = await pool.connect();
    try {
      const sizeResult = await client.query(
        "SELECT pg_database_size(current_database()) as size"
      );
      const dbSizeMB = Math.round(Number(sizeResult.rows[0].size) / 1024 / 1024);

      const connResult = await client.query(
        "SELECT count(*) as count FROM pg_stat_activity WHERE datname = current_database()"
      );
      const connections = Number(connResult.rows[0].count);

      return { status: 'up', port, dbSizeMB, connections };
    } finally {
      client.release();
    }
  } catch {
    return { status: 'down', port, dbSizeMB: null, connections: null };
  }
}

function checkDisk(): DiskHealth {
  try {
    const output = execSync('df -k /', { timeout: 2000 }).toString();
    const lines = output.trim().split('\n');
    if (lines.length < 2) return { totalGB: 0, usedGB: 0, freeGB: 0, percentUsed: 0 };

    const parts = lines[1].split(/\s+/);
    const totalKB = Number(parts[1]);
    const usedKB = Number(parts[2]);
    const freeKB = Number(parts[3]);

    const totalGB = Math.round(totalKB / 1024 / 1024);
    const usedGB = Math.round(usedKB / 1024 / 1024);
    const freeGB = Math.round(freeKB / 1024 / 1024);
    const percentUsed = totalKB > 0 ? Math.round((usedKB / totalKB) * 100) : 0;

    return { totalGB, usedGB, freeGB, percentUsed };
  } catch {
    return { totalGB: 0, usedGB: 0, freeGB: 0, percentUsed: 0 };
  }
}

function checkMemory(): MemoryHealth {
  try {
    const output = execSync(
      "sysctl -n hw.memsize && vm_stat | head -5",
      { timeout: 2000 }
    ).toString();
    const lines = output.trim().split('\n');
    const totalBytes = Number(lines[0]);
    const totalMB = Math.round(totalBytes / 1024 / 1024);

    let usedPages = 0;
    for (const line of lines.slice(1)) {
      const match = line.match(/:\s+(\d+)/);
      if (match) {
        if (line.includes('wired') || line.includes('active') || line.includes('speculative')) {
          usedPages += Number(match[1]);
        }
      }
    }
    const usedMB = Math.round((usedPages * 16384) / 1024 / 1024);

    return { totalMB, usedMB };
  } catch {
    return { totalMB: 0, usedMB: 0 };
  }
}

export async function GET() {
  const [gateway, postgres] = await Promise.all([
    checkGateway(),
    checkPostgres(),
  ]);

  const disk = checkDisk();
  const memory = checkMemory();

  const response: SystemHealthResponse = {
    gateway,
    postgres,
    disk,
    memory,
    checkedAt: new Date().toISOString(),
  };

  return NextResponse.json(response);
}
