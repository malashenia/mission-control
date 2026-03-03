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

## Build Verification
Run after every change:
```bash
npm run build && npx tsc --noEmit
```
