# 08 — Transfer Strategy

Step-by-step migration plan. Designed to minimize risk for a 66-agent, 59-schedule system.

---

## Pre-Migration (On Current Machine)

### Phase 0: Backup Everything

**Do these BEFORE touching anything on the new machine.**

```bash
# 1. Database backup (timestamped)
node scripts/backup-database.js

# 2. Copy primary database
cp data/clawops.db "backups/clawops-pre-migration-$(date +%Y%m%d).db"

# 3. Copy trader brain
cp services/trader-service/data/trader-brain.sqlite "backups/trader-brain-pre-migration.sqlite"

# 4. Copy .env files
cp .env.local "backups/.env.local.pre-migration"
cp services/trader-service/.env.trader "backups/.env.trader.pre-migration"

# 5. Copy ~/.openclaw/ directory
xcopy /E /I "%USERPROFILE%\.openclaw" "backups\openclaw-config"

# 6. Record global npm packages
npm list -g --depth=0 > "backups/npm-globals.txt"

# 7. Record Ollama models
ollama list > "backups/ollama-models.txt"

# 8. Export PM2 state
pm2 save
cp "%USERPROFILE%\.pm2\dump.pm2" "backups/pm2-dump.json"

# 9. Record Windows Task Scheduler entries
schtasks /query /xml > "backups/task-scheduler-export.xml"

# 10. Git status snapshot
git status > "backups/git-status-pre-migration.txt"
git log --oneline -20 > "backups/git-log-pre-migration.txt"
```

### Phase 0.5: Azure SQL Backup (Optional but Recommended)

Export the 4 brain tables from Azure SQL:
```sql
-- Connect to empirecapital.database.windows.net / empcapmaster2
SELECT * FROM brain.shared_observations;
SELECT * FROM brain.shared_feedback;
SELECT * FROM brain.shared_episodes;
SELECT * FROM brain.shared_knowledge_base;
```

Or use Azure portal → Export database.

---

## Migration (New Machine Setup)

### Phase 1: Install Runtimes

| Step | Command | Verify |
|------|---------|--------|
| Node.js 24 | Download from nodejs.org or `nvm install 24` | `node --version` → v24.x |
| Python 3 | Download from python.org | `python --version` → 3.10+ |
| Git | Download from git-scm.com | `git --version` |

### Phase 2: Install Global CLIs

| Step | Command | Verify |
|------|---------|--------|
| pm2 | `npm install -g pm2` | `pm2 --version` |
| OpenClaw | `npm install -g openclaw` | `openclaw --version` → v2026.3.12 |
| Ollama | Download from ollama.com | `ollama --version` |
| yt-dlp | `pip install yt-dlp` | `yt-dlp --version` |

### Phase 3: Copy Repository

**Option A: Git clone (recommended if repo is on GitHub)**
```bash
git clone <repo-url> "OpenClaw2.0"
cd "OpenClaw2.0"
```

**Option B: File copy (if not on remote)**
Copy entire directory EXCLUDING:
- `node_modules/`
- `dist/`
- `logs/`
- `.env.local` (copy separately, needs editing)

```bash
# Example rsync (Linux/macOS) or robocopy (Windows)
robocopy "source" "dest" /E /XD node_modules dist logs .git
```

Then copy `.git/` separately if you want git history.

### Phase 4: Restore Data Files

```bash
# Copy databases to correct locations
cp backups/clawops-pre-migration-*.db data/clawops.db
cp backups/trader-brain-pre-migration.sqlite services/trader-service/data/trader-brain.sqlite

# Copy legacy DB if it exists
cp backups/hoa_leads.sqlite ./hoa_leads.sqlite
```

### Phase 5: Configure Environment

**5a. Edit ecosystem.config.cjs**
```javascript
// Line 19: Update ROOT to new machine's path
const ROOT = '/home/steve/OpenClaw2.0';  // or wherever you put it
```

**5b. Copy and edit .env.local**
```bash
cp backups/.env.local.pre-migration .env.local
```

**Edit these values:**
```
OPENCLAW_PATH=<new machine's global npm path>
# Example Linux: /usr/local/bin
# Example Windows: C:\Users\NewUser\AppData\Roaming\npm
```

Verify all other values are still valid (API keys, tokens, etc.)

**5c. Copy and edit .env.trader**
```bash
cp backups/.env.trader.pre-migration services/trader-service/.env.trader
```

**5d. Restore ~/.openclaw/ config**
```bash
# Copy the backed-up openclaw config to new user home
cp -r backups/openclaw-config ~/.openclaw/
```

**CRITICAL:** Verify `~/.openclaw/openclaw.json` contains the autonomy restoration settings (see 06_hidden_state_checklist.md item #1).

### Phase 6: Install Dependencies

```bash
# Main project
npm install

# Playwright browsers
npx playwright install chromium

# Pull Ollama models (this takes time)
ollama pull llama3.2:3b
ollama pull deepseek-coder-v2:16b
```

### Phase 7: Azure SQL Firewall

Add new machine's public IP to Azure SQL Server firewall rules:
- Azure Portal → SQL Servers → empirecapital → Networking → Add client IP

### Phase 8: Seed Database (Safe on Copied DB)

```bash
# These are idempotent — safe even if DB already has the data
node scripts/seed-all-agents.js
node scripts/seed-all-schedules.js --clean
node scripts/seed-pipelines.js
```

### Phase 9: First Boot

```bash
# Start all services
pm2 start ecosystem.config.cjs

# Verify all 3 services are running
pm2 status

# Check logs for errors
pm2 logs --lines 50
```

### Phase 10: Smoke Tests

```bash
# Health checks
curl http://localhost:3001/api/health
curl http://localhost:3001/api/health/playwright

# Agent count
curl http://localhost:3001/api/agents | jq '.length'
# Expected: 64 (66 defined, but count varies)

# Schedule count
curl http://localhost:3001/api/schedules | jq '.length'
# Expected: 59

# Trigger one cheap agent manually
curl -X POST http://localhost:3001/api/runs \
  -H "Content-Type: application/json" \
  -d '{"agent_name": "pipeline-digest"}'

# Login to dashboard
# Open http://localhost:5174
# Login: admin@clawops.local / changeme123
```

### Phase 11: Validate Core Flows

1. **Discord:** Check that the pipeline-digest run posted to Discord
2. **Brain:** `GET /api/brain/status` — verify Azure SQL connection
3. **Playwright:** Trigger `hoa-discovery` with a small test market
4. **Ollama:** Trigger `rse-signal-scorer` with a test transcript
5. **OpenClaw CLI:** Trigger a chat message to `main` agent

### Phase 12: Enable Schedules

After smoke tests pass:
```bash
# PM2 auto-start setup
pm2 save
pm2 startup  # Follow instructions for your OS
```

Let the system run overnight. Check Discord the next morning for the dream-team-nightly report.

---

## Post-Migration Checklist

- [ ] All 3 PM2 services running (pm2 status shows online)
- [ ] Dashboard accessible at http://localhost:5174
- [ ] Agent count matches (64+ agents in DB)
- [ ] Schedule count matches (59 schedules)
- [ ] At least one agent run completes successfully
- [ ] Discord notification received
- [ ] Brain status shows Azure SQL connected (or graceful fallback)
- [ ] Playwright health check passes
- [ ] Ollama responding on :11434
- [ ] OpenClaw CLI responds to `openclaw --version`
- [ ] Gateway responds on :18789 (if used)
- [ ] First nightly cycle completes (check next morning)

---

## Rollback Plan

If new machine fails:
1. Old machine is untouched (we only copied, never modified)
2. Start pm2 on old machine: `pm2 start ecosystem.config.cjs`
3. Everything resumes from where it left off

**Critical:** Do NOT stop the old machine's schedules until new machine is validated for at least 24 hours.

---

## Timeline Estimate

| Phase | Duration | Notes |
|-------|----------|-------|
| Phase 0: Backup | 15 min | Mostly file copies |
| Phase 1-2: Install runtimes | 30 min | Downloads |
| Phase 3: Copy repo | 10 min | File copy |
| Phase 4-5: Restore + configure | 20 min | Manual editing |
| Phase 6: Install deps | 30 min | npm install + Ollama model pulls |
| Phase 7: Azure firewall | 5 min | Azure portal |
| Phase 8: Seed | 2 min | Fast scripts |
| Phase 9-11: Boot + validate | 30 min | Testing |
| Phase 12: Monitor overnight | 12 hours | Passive |
| **Total active time** | **~2.5 hours** | |
