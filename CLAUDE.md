# ClawOps Console — AI Agent Operations Platform

AI-powered agent orchestration and marketing automation for construction companies. 35 agents (Jake, CFO, HOA, Mgmt research), auto-scheduled runs, live content queuing, OpenClaw bridge to GPT-4o.

## Tech Stack
Node.js 24, Express, Vite/React 19, SQLite3, OpenClaw CLI v2026.2.19-2, OpenAI GPT-4o

## Commands
npm run dev                     # Start all three: server (3001), Vite (5174), Trader (3002)
npm run dev:client             # Vite frontend only (5174)
node scripts/seed-all-agents.js        # Register all 35 agents in Console DB
node scripts/seed-jake-agents.js       # Register 7 Jake agents
openclaw agents list           # Verify agent registration with OpenClaw

## Key Files & Patterns
**Agent Workspace Structure:** openclaw-skills/{agent-name}/SOUL.md (personality + instructions, auto-loaded by OpenClaw)
**API Routes:** server/routes/*.js (agents, runs, schedules, chat, content-queue, costs)
**OpenClaw Bridge:** server/services/openclawBridge.js (spawns: openclaw agent --local --json --agent {name} --message "{msg}")
**Schedule Runner:** server/services/scheduleRunner.js (checks every 60s, auto-fires enabled schedules, marks runs completed/failed)
**Console UI:** src/pages/AgentsPage.jsx (agent dashboard, domain grouping by prefix)

## Architecture Rules — DO NOT BREAK
1. **New agent**: Create openclaw-skills/{name}/ with SOUL.md + boilerplate files, then register:
   ```bash
   openclaw agents add "{name}" --workspace "openclaw-skills/{name}" --non-interactive
   ```
2. **New API route**: Add server/routes/x.js, then register BOTH lines in server/index.js:
   ```javascript
   const xRoutes = require('./routes/x');  // top, with other requires
   app.use('/api/x', xRoutes);              // in startServer(), with other app.use calls
   ```
3. **Special handlers** (deterministic, $0): runs.js SPECIAL_HANDLERS registry (13 handlers: hoa_discovery, cfo_lead_scout, github_publisher, etc.)
4. **Agent scheduling**: seed script auto-creates 3 schedules per agent. Schedules stored in DB, fire via scheduleRunner every 60s (aligned to minute boundary).
5. **Runs table**: Uses result_data column, NOT output (output doesn't exist — will throw silent 500 error)
6. **Agent UUIDs**: Deterministic MD5 hash of agent name — idempotent seeding, same name = same UUID always

## Critical Gotchas (Will Break Your Session)
1. **Runs use result_data, NOT output** — All special handlers: `run('UPDATE runs SET status=..., result_data=?, ...', [JSON.stringify({outputText}), runId])`
2. **New routes need registration in server/index.js** — Just creating file gives silent 404
3. **OpenClaw agents must be CLI-registered** — Can't just create folder; must run `openclaw agents add`
4. **Stale node blocks port 3001** — `powershell -Command "Get-Process node | Stop-Process -Force"` before npm run dev
5. **Auth rate limiter is IN-MEMORY** — Restarts clear it. Dev limit: 50 attempts, 30s lockout after breach
6. **Bridge spawns as single string with quoted args** — NOT array spread. Example: `spawn('openclaw agent --local --json --agent "jake-content-engine" --message "{\\"pillar\\":\\"stop_the_bullshit\\"}"', { shell: true })`

## Current Agent Fleet (35 total)
**Jake Marketing (7):** jake-content-engine, jake-outreach-agent, jake-lead-scout, jake-social-scheduler, jake-analytics-monitor, jake-offer-proof-builder, jake-pilot-deliverer

**CFO Marketing (7):** cfo-content-engine, cfo-outreach-agent, cfo-lead-scout, cfo-social-scheduler, cfo-analytics-monitor, cfo-offer-proof-builder, cfo-pilot-deliverer

**HOA Marketing (8):** hoa-content-writer, hoa-cms-publisher, hoa-social-media, hoa-social-engagement, hoa-networker, hoa-email-campaigns, hoa-website-publisher, hoa-facebook-poster

**HOA Pipeline (4):** hoa-discovery, hoa-contact-finder, hoa-contact-enricher, hoa-outreach-drafter

**HOA Intel (2):** hoa-minutes-monitor, google-reviews-monitor

**Mgmt Research (5):** mgmt-portfolio-scraper, mgmt-contact-puller, mgmt-portfolio-mapper, mgmt-review-scanner, mgmt-cai-scraper

**Core (2):** main (natural language chat router), daily-debrief (6 PM war room report)

## When Things Break
| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| Agent not found in Console UI | Not seeded in DB | `node scripts/seed-all-agents.js` |
| "Unknown agent id" error | Not registered with OpenClaw CLI | `openclaw agents add "{name}" --workspace "openclaw-skills/{name}"` |
| API route returns 404 | Not registered in server/index.js | Add require + app.use in server/index.js |
| Run shows "Agent failed" | Check bridge output in server logs | Verify SOUL.md exists in workspace dir |
| Schedule not firing | Agent not registered OR schedule.enabled=0 | Verify both in Console DB |
| Silent 500 error on run | Using `output` column instead of `result_data` | Update SQL to use result_data |

## Login Credentials
**Console:** http://localhost:5174 → admin@clawops.local / changeme123
**API:** http://localhost:3001/api (requires Bearer token)
**Trader:** http://localhost:3002 (paper trading, Alpaca integration)

## Important Context
- OpenClaw gateway runs on port 18789 (verify: `netstat -ano | findstr :18789`)
- SOUL.md auto-loaded from skill workspace by OpenClaw — personality + instructions live there
- runs.js now refactored to ~360 lines: markRunCompleted(), markRunFailed(), buildResultData() helpers
- ChatPage supports natural language (non-slash messages routed to "main" agent)
- Postiz integration ready (28 platforms: Facebook, LinkedIn, Twitter, Instagram, TikTok, etc.)
