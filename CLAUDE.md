# CLAUDE.md — Mission Control

## Purpose
Mission Control (Autensa) — AI Agent Orchestration Dashboard for monitoring and managing OpenClaw infrastructure: gateway health, cron jobs, token usage, error logs, PIL memory.

## Stack
- Next.js 14 App Router, TypeScript 5, Tailwind CSS
- SQLite (better-sqlite3) for dashboard state
- OpenClaw Gateway via WebSocket
- Postgres 17 (pgvector) for Mem0/PIL monitoring

## Port
**localhost:4000** (hardcoded in package.json scripts)

## CRITICAL: Postgres
**Port = 5434** (NOT 5432). Always. Everywhere. No exceptions.
- Host: 127.0.0.1
- DB: openclaw
- User: openclaw

## Environment
- `.env.local` — all secrets (gitignored via `.env*.local`)
- Gateway: ws://127.0.0.1:18789
- Gateway token: from `~/.openclaw/openclaw.json` → `gateway.auth.token`

## Commands
```bash
npm run dev       # dev server on :4000
npm run build     # production build
npm start         # production server on :4000
npm run lint      # ESLint
npm run db:seed   # seed SQLite
npm run db:reset  # reset SQLite
```

## Custom Panels (src/components/)
- `SystemHealthPanel` — Gateway + Postgres + Disk + Memory (auto-refresh 30s)
- `CronJobsPanel` — 93 jobs from ~/.openclaw/cron/jobs.json + runs/*.jsonl (auto-refresh 60s)
- `TokenUsagePanel` — Estimated cost from session JSONL files (today/7d/30d)
- `ErrorLogPanel` — Last 24h errors from ~/.openclaw/logs/ (auto-refresh 60s)
- `GentosActivitySidebar` — Right sidebar 300px, reads gentos_activity.jsonl (auto-refresh 30s)

## API Routes (src/app/api/)
- `/api/system-health` — pg + gateway + disk + memory checks
- `/api/cron-jobs` — reads jobs.json + run history
- `/api/token-usage?period=today|week|month` — session token estimation
- `/api/errors?hours=24` — log scanner with dedup
- `/api/gentos-activity?date=YYYY-MM-DD` — activity feed

## Auth
Middleware checks `MC_API_TOKEN` (Bearer header) for external API calls. Browser UI passes through (same-origin).

## Gotchas
- `node_modules.nosync` symlink breaks webpack — always use real `node_modules/` dir
- `pg` and `playwright` must be in webpack externals (next.config.mjs)
- TypeScript: use `Array.from(new Set(...))` instead of spread `[...new Set(...)]`

## Build Verification
Run after every change:
```bash
npm run build && npx tsc --noEmit
```
