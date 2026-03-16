# 01 — System Architecture Overview

**Audit Date:** 2026-03-15
**System:** OpenClaw 2.0 (ClawOps Console)
**Location:** `C:\Users\SPilcher\OpenClaw2.0 for linux - Copy`
**Platform:** Windows 11 Pro, Node.js 24, native (not WSL)

---

## High-Level Architecture

```
                    ┌─────────────────────────────┐
                    │   Windows Task Scheduler     │
                    │   (pm2 resurrect on boot)    │
                    └────────────┬────────────────┘
                                 │
                    ┌────────────▼────────────────┐
                    │        PM2 Fleet             │
                    │  ecosystem.config.cjs        │
                    └──┬──────────┬──────────┬────┘
                       │          │          │
              ┌────────▼──┐ ┌────▼────┐ ┌───▼──────────┐
              │  Server    │ │ Client  │ │   Trader     │
              │  :3001     │ │ :5174   │ │   :3002      │
              │  Express   │ │ Vite    │ │   Express/TS │
              │  48 routes │ │ React19 │ │   Alpaca API │
              │  93 svc    │ │ Zustand │ │   AI Panel   │
              │  SQLite    │ │ TanStack│ │   SQLite     │
              └──────┬─────┘ └─────────┘ └──────────────┘
                     │
        ┌────────────┼───────────────────┐
        │            │                   │
   ┌────▼────┐  ┌────▼─────┐  ┌─────────▼──────┐
   │Schedule  │  │Runs/     │  │Collective Brain│
   │Runner    │  │Handlers  │  │(4 layers)      │
   │60s tick  │  │41 special│  │Azure SQL +     │
   │59 scheds │  │20 LLM    │  │SQLite fallback │
   └──────────┘  └──────────┘  └────────────────┘
        │              │
   ┌────▼──────────────▼──────────────┐
   │        External Services          │
   │  OpenClaw CLI  │  Ollama :11434   │
   │  Gateway :18789│  Playwright      │
   │  OpenAI API    │  Discord/SendGrid│
   │  Azure SQL     │  GitHub/Facebook │
   └──────────────────────────────────┘
```

---

## Three PM2 Services

| # | Name | Port | Runtime | Script | RAM Limit |
|---|------|------|---------|--------|-----------|
| 1 | `clawops-server` | 3001 | Node.js 24 | `server/index.js` | 500M |
| 2 | `clawops-client` | 5174 | Vite (Node.js) | `scripts/start-vite.cjs` | 300M |
| 3 | `openclaw-trader` | 3002 | Node.js + tsx | `services/trader-service/src/server.ts` | 500M |

**Start command:** `pm2 start ecosystem.config.cjs`
**Auto-start:** Windows Task Scheduler runs `pm2 resurrect` on boot

---

## Major Directories

| Directory | Purpose | File Count (approx) |
|-----------|---------|---------------------|
| `server/` | Express backend — routes, services, middleware, db | 200+ |
| `server/routes/` | API endpoint handlers | 48 files |
| `server/services/` | Business logic modules | 93 files |
| `server/db/` | Schema, connection, migrations | 36 files |
| `server/db/migrations/` | SQL migrations (001-034) | 34 files |
| `src/` | React 19 frontend | 100+ |
| `openclaw-skills/` | Agent SOUL.md files (one dir per agent) | 66+ dirs |
| `scripts/` | Seed, trigger, debug, maintenance | ~80 files |
| `founder/` | Founder context injected into every agent | 6 files |
| `org/` | Agent org chart, roles, responsibilities | 3 files |
| `services/trader-service/` | Alpaca trading bot (TypeScript) | 30+ files |
| `data/` | Runtime databases | 2 files |
| `backups/` | Database snapshots | varies |
| `logs/` | PM2 log output | 4+ files |
| `docs/` | Reference documentation | 10+ files |

---

## Database Architecture

### Primary: SQLite (sql.js)
- **File:** `data/clawops.db` (59.7 MB)
- **Driver:** `sql.js` (WebAssembly — no native compilation needed)
- **Connection:** `server/db/connection.js` — loads binary file, persists on every write via `saveDatabase()`
- **Schema:** `server/db/schema.sql` + 34 cumulative migrations
- **Tables:** 40+ (agents, runs, schedules, cfo_leads, cfo_content_pieces, cfo_outreach_sequences, brain_fallback_*, opp_*, rse_*, playwright_*, cadence_touches, audit_log, etc.)

### Secondary: Azure SQL
- **Server:** `empirecapital.database.windows.net`
- **Database:** `empcapmaster2`
- **Used by:** `collectiveBrain.js` — 4 tables in `brain.*` schema (observations, feedback, episodes, knowledge_base)
- **Fallback:** When Azure is down, writes go to SQLite `brain_fallback_*` tables; `drainFallback()` syncs on reconnect

### Tertiary: Trader Brain SQLite
- **File:** `services/trader-service/data/trader-brain.sqlite`
- **Used by:** Trader service — 4-layer recursive learning for trading decisions

### Legacy: HOA Leads SQLite
- **File:** `hoa_leads.sqlite` (root, 1.3 MB) — not actively used but may contain unique data

---

## Route Registration Pattern

**All 48 routes** are registered in `server/index.js` with the two-line pattern:

```javascript
const xRoutes = require('./routes/x');
app.use('/api/x', xRoutes);
```

**Critical:** Missing either line = silent 404. Frontend shows empty state with no error. This is the #1 gotcha for new developers.

---

## Agent Dispatch: Three Execution Paths

### 1. Manual (Console UI or API)
User triggers via `POST /api/runs` → `runs.js` checks for `special_handler` → executes

### 2. Scheduled (scheduleRunner.js)
- Checks every 60 seconds for due schedules (5-field cron)
- 59 active schedules running 1 AM - 11 PM daily
- Prevents duplicate runs within same minute
- Daily spend cap: `max_cost_per_run * max_runs_per_hour`

### 3. Blitz (batch execution)
`POST /api/blitz` → runs multiple agents in parallel

### Handler Selection (runs.js)
```
if SPECIAL_HANDLERS[agent.special_handler] exists:
    → run deterministic Node.js handler ($0)
else if agent.use_ollama:
    → route to ollamaBridge (local Ollama, $0)
else:
    → route to openclawBridge (GPT-4o/mini, ~$0.025/run)
```

**41 special handlers** = scrapers, scorers, state trackers — no LLM cost
**20+ LLM agents** = content writers, outreach drafters, follow-up agents

---

## Collective Brain (4-Layer Learning System)

**Service:** `server/services/collectiveBrain.js`

| Layer | Name | Storage | Purpose |
|-------|------|---------|---------|
| 1 | Observations | Azure SQL + SQLite | Real-time agent signals |
| 2 | Feedback | Azure SQL + SQLite | Human approve/reject |
| 3 | Episodes | Azure SQL + SQLite | Outcome snapshots with scores |
| 4 | Knowledge Base | Azure SQL + SQLite | Nightly distillation (2 AM) |

**Injection:** `buildAgentContext()` injects all 4 layers into every agent prompt before execution.

**Fallback:** SQLite `brain_fallback_*` tables mirror Azure SQL. `drainFallback()` syncs when Azure reconnects.

---

## Founder Mandate Injection

**Files:** `founder/agent_mandate.md` + 5 context files

Every agent run — both OpenClaw CLI and Ollama — appends the founder mandate to the prompt via `openclawBridge.js`. This ensures all agents share Steve's priorities, decision frameworks, and revenue focus.

---

## Post-Processing Pipeline

After every agent run:
1. `postProcessor.js` routes LLM output to correct DB tables (content → `cfo_content_pieces`, outreach → `cfo_outreach_sequences`, leads → `cfo_leads`)
2. `pipelineRunner.js` checks if this run was a pipeline step and advances to next step
3. `discordNotifier.js` posts run summary to Discord webhook
4. `collectiveBrain.observe()` records Layer 1 observation
5. Ralph QA auto-reviews content/outreach if flagged

---

## Frontend (React 19 + Vite)

- **Framework:** React 19 + React Router v6
- **State:** Zustand v5 (global) + TanStack Query v5 (server)
- **Styling:** Tailwind CSS v4
- **Dev server:** Vite on port 5174, proxies `/api` and `/socket.io` to server :3001
- **Build:** `npm run build` → `dist/` (production)
- **Key pages:** Dashboard, Agents, Runs, Leads (HOA + Jake), Content Queue, Revenue Signals (10-tab), Opportunities, Training

---

## Control Flow Summary

```
Windows Task Scheduler → pm2 resurrect
    → clawops-server starts → initDatabase() → scheduleRunner.start()
        → every 60s: check 59 schedules
            → if due: dispatch to runs.js
                → SPECIAL_HANDLER? → Node.js service ($0)
                → LLM? → openclawBridge/ollamaBridge
                    → founder mandate injected
                    → brain context injected
                    → agent executes
                → postProcessor routes output
                → brain records observation
                → Discord notifies
```

This is the core control loop. Everything else branches from it.
