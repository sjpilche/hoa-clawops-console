# Executive Agent Registration Checklist
*Step-by-step guide for registering Todd, Scout, Charlie, Quill, and Ralph on any fresh machine.*

This checklist works on Mac Mini, Linux, or Windows. Notes for platform differences are at the bottom.

---

## Prerequisites

Verify these are installed before starting. If any are missing, install them first.

```bash
# Check Node.js version (must be 20+, ideally 24)
node --version

# Check npm
npm --version

# Check OpenClaw CLI
openclaw --version
# Expected: OpenClaw CLI v2026.x.x or similar
# If missing: follow OpenClaw installation instructions at openclaw.dev

# Check git
git --version

# Check Ollama (optional — used for free-path LLM calls)
ollama --version
ollama list
# Should show llama3.2:3b or similar. If missing: ollama pull llama3.2:3b
```

**Required environment variables** (must be in `.env.local` at project root):
```
OPENAI_API_KEY=sk-...           # Required for GPT-4o agent runs
DISCORD_WEBHOOK_URL=https://...  # Required for Todd briefings and alerts
DISCORD_ENABLED=true
# Optional but recommended:
GITHUB_TOKEN=ghp_...            # For blog publishing via github_publisher
SENDGRID_API_KEY=SG...          # For outreach sends (not needed for drafting only)
CALENDLY_URL=https://calendly.com/your-link/30min
```

---

## Pre-Registration Steps

### Step 1: Clone and install dependencies
```bash
git clone [repo-url] "OpenClaw2.0 for linux - Copy"
cd "OpenClaw2.0 for linux - Copy"
npm install
```

### Step 2: Initialize the database
```bash
# The DB auto-creates on first server start, but run this to apply all migrations:
node scripts/run-migrations.js
# Or start the server once to trigger DB initialization:
npm run dev
# Wait for "Server running on port 3001" then Ctrl+C
```

### Step 3: Verify the DB is healthy
```bash
node -e "
const { get } = require('./server/db/connection');
const count = get('SELECT COUNT(*) as c FROM agents');
console.log('Agents in DB:', count.c);
const runCount = get('SELECT COUNT(*) as c FROM runs');
console.log('Runs in DB:', runCount.c);
"
# Should print without errors. Agent count may be 0 if not seeded yet.
```

### Step 4: Verify OpenClaw Gateway is running
```bash
# Check if gateway is listening
netstat -an | grep 18789
# Should show a LISTEN entry. If not:
openclaw gateway start

# Verify with doctor (note: "stopped" is a known false negative — use netstat)
openclaw doctor
```

### Step 5: Verify openclaw-skills directories exist
```bash
ls openclaw-skills/todd/
# Should show: SOUL.md  README.md  CONTRACT.md  SAMPLE_TASKS.md

ls openclaw-skills/scout/
ls openclaw-skills/charlie/
ls openclaw-skills/quill/
ls openclaw-skills/ralph/
ls openclaw-skills/_executive/
# All should show their respective files
```

---

## Registration Commands

Run these in order. Each command registers the agent with OpenClaw CLI and links it to its workspace directory (where SOUL.md lives).

```bash
# Todd — Chief of Staff
openclaw agents add "todd" --workspace "openclaw-skills/todd" --non-interactive

# Scout — Research & Intel
openclaw agents add "scout" --workspace "openclaw-skills/scout" --non-interactive

# Charlie — Engineering & Builder
openclaw agents add "charlie" --workspace "openclaw-skills/charlie" --non-interactive

# Quill — Content & Communications
openclaw agents add "quill" --workspace "openclaw-skills/quill" --non-interactive

# Ralph — QA Supervisor
openclaw agents add "ralph" --workspace "openclaw-skills/ralph" --non-interactive
```

**If you get "workspace not found" error:** Make sure you're running the command from the project root, not from inside the openclaw-skills directory.

**If you get "agent already exists" error:** The agent is already registered. Skip to verification.

### Verify OpenClaw registration
```bash
openclaw agents list
# Should show all 5 executive agents in the list
# Look for: todd, scout, charlie, quill, ralph
```

---

## Post-Registration: Seed to DB

The OpenClaw CLI registration above registers agents with the OpenClaw runtime. You also need to seed them into the ClawOps SQLite DB so they appear in the Console UI.

### Add executive agents to seed-all-agents.js

Open `scripts/seed-all-agents.js` and add these 5 objects to the agents array:

```javascript
// ── Executive Agent Fleet ─────────────────────────────────────
{
  name: 'todd',
  description: 'Chief of Staff — routes tasks, monitors fleet, 7AM briefing',
  group: 'executive',
  config: {
    openclaw_id: 'todd',
    special_handler: null
  }
},
{
  name: 'scout',
  description: 'Research & Intel — GC discovery, contact enrichment, lead scoring, signal monitoring',
  group: 'executive',
  config: {
    openclaw_id: 'scout',
    special_handler: null
  }
},
{
  name: 'charlie',
  description: 'Engineering & Builder — automations, services, migrations, scaffolds',
  group: 'executive',
  config: {
    openclaw_id: 'charlie',
    special_handler: null
  }
},
{
  name: 'quill',
  description: 'Content & Communications — cold emails, blog posts, LinkedIn, follow-ups, case studies',
  group: 'executive',
  config: {
    openclaw_id: 'quill',
    special_handler: null
  }
},
{
  name: 'ralph',
  description: 'QA Supervisor — reviews all output before it leaves the system (PASS / REJECT)',
  group: 'executive',
  config: {
    openclaw_id: 'ralph',
    special_handler: null
  }
},
```

### Run the seed script
```bash
# Kill any running server first to avoid DB overwrite race condition
# Mac/Linux:
pkill -f "node.*server" || true
# Windows:
# powershell -Command "Get-Process node | Stop-Process -Force"

# Run seed
node scripts/seed-all-agents.js

# Restart server
npm run dev
```

### Verify agents appear in UI
Open http://localhost:5174 → login → Agents view.
You should see all 5 executive agents listed under the "executive" group.

---

## Schedule Setup

### Todd — 7AM Daily Briefing (Recommended)

Todd's morning briefing is the most important scheduled run. Add it to the schedules table via the Console UI or directly in the DB:

```bash
node -e "
const { run, get } = require('./server/db/connection');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Get Todd's agent ID (MD5 hash of name)
const toddId = crypto.createHash('md5').update('todd').digest('hex');

// Insert 7AM daily briefing schedule
run(\`
  INSERT OR IGNORE INTO schedules (
    id, agent_id, cron_expression, message, enabled, created_at
  ) VALUES (
    ?, ?, '0 7 * * 1-5', '{ \"task\": \"morning_briefing\" }', 1, datetime('now')
  )
\`, [uuidv4(), toddId]);

console.log('Todd 7AM briefing schedule created. Agent ID:', toddId);
"
```

### Other Executive Agents — No Default Schedules

Scout, Charlie, Quill, and Ralph are primarily trigger-driven (routed by Todd or manual). If you want Scout to auto-run discovery on a schedule, add it via the Console UI under Schedules.

Suggested optional schedules (add manually when ready):
- **Scout Discovery:** Monday + Thursday 6AM — `0 6 * * 1,4`
- **Scout Signal Monitor:** Daily 11AM — `0 11 * * 1-5`
- **Quill Content Batch:** Monday 9AM (already covered by jake-content-engine if that agent is active)

---

## Post-Registration Verification

Run these checks to confirm everything is wired correctly.

### Check 1: OpenClaw can run each executive agent
```bash
# Test Todd with a minimal message
openclaw agent --local --json --agent "todd" --message "{ \"task\": \"morning_briefing\" }"
# Should return JSON with payloads[0].text containing a briefing or an error from the LLM
# A response (even an error) confirms the agent is registered and the workspace is loaded

# Quick check for all 5:
for agent in todd scout charlie quill ralph; do
  echo "Testing $agent..."
  openclaw agent --local --json --agent "$agent" --message "ping" 2>&1 | head -1
done
```

### Check 2: Agents visible in ClawOps Console UI
1. Start server: `npm run dev`
2. Open http://localhost:5174
3. Login: `admin@clawops.local` / `changeme123`
4. Navigate to Agents
5. Confirm all 5 executive agents appear in the list with status 'idle'

### Check 3: Todd manual run via Console
1. In the Console UI, find Todd in the Agents list
2. Click "Run Agent"
3. Message: `{ "task": "morning_briefing" }`
4. Confirm run, wait for completion
5. Check: run appears in Runs history with status='completed'
6. Check: Discord receives a briefing embed (if DISCORD_ENABLED=true and webhook is set)

### Check 4: Verify SOUL.md is loaded
```bash
# OpenClaw loads SOUL.md as the system prompt from the workspace
cat openclaw-skills/todd/SOUL.md | head -5
# Should show: # Todd — Chief of Staff
# This file is the agent's identity — if it's missing, the agent runs without personality
```

---

## Troubleshooting

### Mac-specific Notes
- Path separator is `/` (same as Linux) — no issues
- If Playwright fails: `npx playwright install chromium`
- If `openclaw` not found: check `~/.openclaw/bin` is in PATH — add to `~/.zshrc` or `~/.bash_profile`
- SQLite file permissions: if DB is read-only, `chmod 644 server/db/clawops.db`
- Port 3001 in use: `lsof -ti:3001 | xargs kill -9`

### Windows-specific Notes
- Use `powershell -Command "Get-Process node | Stop-Process -Force"` to kill stale node
- Path separator in OpenClaw commands: use forward slashes `/` even on Windows
  - Correct: `openclaw agents add "todd" --workspace "openclaw-skills/todd"`
  - Wrong: `openclaw agents add "todd" --workspace "openclaw-skills\\todd"`
- `netstat -ano | findstr ':18789'` to verify gateway
- If `openclaw` not found: check it's in `%APPDATA%\openclaw\bin` and PATH is set

### Common Issues

| Symptom | Fix |
|---|---|
| "Unknown agent id" on run | `openclaw agents add "agent-name" --workspace "openclaw-skills/agent-name" --non-interactive` |
| Agent not showing in Console UI | `node scripts/seed-all-agents.js` (server must be stopped first) |
| 404 on API route | Add both lines to `server/index.js`: `const xRoutes` + `app.use('/api/x', xRoutes)` |
| Silent 500 on run | Check handler uses `result_data` not `output` in SQL |
| Briefing not posting to Discord | Verify `DISCORD_WEBHOOK_URL` and `DISCORD_ENABLED=true` in `.env.local` |
| Schedule not firing | Check `schedule.enabled=1` in DB; check scheduleRunner.js is running (npm run dev starts it) |
| SOUL.md not loading | Confirm file is at `openclaw-skills/{agent-name}/SOUL.md` (exact path, exact filename) |
| OpenClaw gateway false negative | Ignore `openclaw doctor` "stopped" — run `netstat -an \| grep 18789` to verify |
| Seed overwrites existing agents | Always kill server before running `node scripts/seed-all-agents.js` |
