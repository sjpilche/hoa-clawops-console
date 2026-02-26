# ClawOps Console — AI agent ops platform for construction company marketing automation.

## Stack
Node.js 24 · Express · Vite/React 19 · SQLite3 · OpenClaw CLI v2026.2.19-2 · GPT-4o

## Commands
```bash
npm run dev                          # Start server (3001) + Vite (5174) + Trader (3002)
npm run dev:client                   # Frontend only
node scripts/seed-all-agents.js      # Sync all 35 agents to DB
openclaw agents list                 # Verify OpenClaw registration
powershell -Command "Get-Process node | Stop-Process -Force"  # Kill stale node
```

## Key Files
- Agent personalities: `openclaw-skills/{name}/SOUL.md` (auto-loaded by OpenClaw)
- Bridge: `server/services/openclawBridge.js` — spawns `openclaw agent --local --json`
- Scheduler: `server/services/scheduleRunner.js` — fires every 60s, aligned to minute
- Post-processor: `server/services/postProcessor.js` — routes LLM output to DB tables
- Route registration: `server/index.js` — ALL routes must be registered here

## Architecture Rules

**New agent:**
```bash
openclaw agents add "{name}" --workspace "openclaw-skills/{name}" --non-interactive
```
Then add to `scripts/seed-all-agents.js` with `group: 'jake-marketing'|'hoa-marketing'|etc`.

**New API route** — two lines required in `server/index.js`:
```javascript
const xRoutes = require('./routes/x');   // top of file
app.use('/api/x', xRoutes);             // inside startServer()
```
Missing either line → silent 404.

**Special handlers** (deterministic, $0/run): registered in `runs.js` SPECIAL_HANDLERS object.
When modifying special handlers or the runs pipeline: @server/routes/runs.js

**Runs table uses `result_data`, NOT `output`** — `output` column doesn't exist, throws silent 500.

**Bridge spawns as single string** — NOT array args:
```javascript
spawn(`openclaw agent --local --json --agent "name" --message "${escaped}"`, { shell: true })
```

**Agent UUIDs** — MD5 hash of agent name. Same name = same UUID always. Idempotent seeding.

## Agent Fleet (35)
- **Jake Marketing (14):** `jake-*` (7) + `cfo-*` (7) — unified brand, same DB tables
- **HOA Marketing (8):** `hoa-content-writer` through `hoa-facebook-poster`
- **HOA Pipeline (4):** discovery → contact-finder → contact-enricher → outreach-drafter
- **HOA Intel (2):** `hoa-minutes-monitor`, `google-reviews-monitor`
- **Mgmt Research (5):** `mgmt-portfolio-scraper` through `mgmt-cai-scraper`
- **Core (2):** `main` (chat router), `daily-debrief` (6 PM)

When modifying agent pipeline or DB schema: @server/db/schema.sql @server/db/migrations/

## Troubleshooting
| Symptom | Fix |
|---------|-----|
| Agent not in UI | `node scripts/seed-all-agents.js` |
| "Unknown agent id" | `openclaw agents add "{name}" --workspace "openclaw-skills/{name}"` |
| 404 on API route | Add both lines to `server/index.js` |
| Silent 500 on run | Check you're using `result_data` not `output` in SQL |
| Schedule not firing | Check `schedule.enabled=1` in DB |
| Port 3001 blocked | Kill stale node (see Commands above) |

## Login
Console: http://localhost:5174 → `admin@clawops.local` / `changeme123`
