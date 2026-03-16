# 06 — Hidden State Checklist

Files, folders, databases, and state that live OUTSIDE the repo but are required for the system to function. These are the things that will be missed if you only copy the repo.

---

## CRITICAL — System won't function without these

### 1. ~/.openclaw/ directory
- **Location:** `C:\Users\SPilcher\.openclaw\`
- **Contains:**
  - `openclaw.json` — Agent permissions, tool sandbox settings, gateway config
  - `openclaw.json.pre-fix` — Backup from before autonomy restoration
  - Agent metadata cache
  - Gateway configuration (`gateway.mode: "local"`)
- **Why it matters:** Without this, OpenClaw CLI defaults to 2-agent mode (v2026.3.12 default). The manual fix that restored 59-agent autonomy lives ONLY in this config file.
- **Backup command:** `xcopy /E /I "%USERPROFILE%\.openclaw" "backup\.openclaw"`
- **Key settings that must be preserved:**
  - `tools.sandbox.tools.allow` includes: browser, cron, gateway
  - `tools.sandbox.tools.deny` does NOT include: browser, cron, gateway
  - `compaction: safeguard`
  - `maxConcurrent: 4`, `subagents.maxConcurrent: 8`
  - `tools.elevated.allowFrom.webchat: ["*"]` (array, not boolean)

### 2. Global npm packages
- **Location:** `C:\Users\SPilcher\AppData\Roaming\npm\`
- **Required packages:**
  - `openclaw` (v2026.3.12)
  - `pm2` (latest)
- **Why it matters:** `openclawBridge.js` spawns `openclaw agent` as a CLI command. Without the global install, all LLM agents fail.
- **Check command:** `npm list -g --depth=0`
- **Backup approach:** Record versions, reinstall on new machine

### 3. Ollama model cache
- **Location:** `C:\Users\SPilcher\.ollama\models\` (or wherever Ollama stores blobs)
- **Required models:**
  - `llama3.2:3b` (~2 GB)
  - `deepseek-coder-v2:16b` (~9 GB)
- **Why it matters:** Without these models, Ollama-dependent agents (RSE scorer, opportunity scanner, software factory) fail
- **Backup approach:** Don't copy — re-pull on new machine (`ollama pull <model>`)

### 4. PM2 process dump
- **Location:** `C:\Users\SPilcher\.pm2\dump.pm2`
- **Why it matters:** `pm2 resurrect` uses this to restart all services on boot
- **Backup approach:** Don't copy — recreate with `pm2 start ecosystem.config.cjs && pm2 save`

### 5. Azure SQL brain data
- **Server:** `empirecapital.database.windows.net`
- **Database:** `empcapmaster2`
- **Schema:** `brain.*` (4 tables)
  - `brain.shared_observations`
  - `brain.shared_feedback`
  - `brain.shared_episodes`
  - `brain.shared_knowledge_base`
- **Why it matters:** This is the collective learning accumulated across all agent runs. SQLite fallback has partial copy, but Azure is the source of truth.
- **Backup approach:** Export via `sqlcmd` or Azure portal export before migration
- **Note:** New machine IP must be added to Azure SQL firewall

---

## HIGH — System degrades without these

### 6. Playwright browser cache
- **Location:** `%LOCALAPPDATA%\ms-playwright\` or `~/.cache/ms-playwright/`
- **Contains:** Chromium browser binaries (~200 MB)
- **Why it matters:** 15+ agents use Playwright for scraping
- **Backup approach:** Don't copy — reinstall with `npx playwright install chromium`

### 7. Windows Task Scheduler entries
- **Task:** `\OpenClaw Gateway` — starts OpenClaw gateway on boot
- **Stale task:** `\OpenClaw Gateway Watchdog` — points to wrong port (8000), should be deleted
- **Why it matters:** Without auto-start, system doesn't come up after reboot
- **Backup approach:** Export tasks with `schtasks /query /xml` before migration
- **On new machine:** Create equivalent (or use systemd/cron on Linux)

### 8. yt-dlp installation
- **Location:** Wherever Python installed it (pip)
- **Why it matters:** RSE transcript extractor can't pull YouTube transcripts
- **Backup approach:** Don't copy — reinstall with `pip install yt-dlp`

---

## MEDIUM — Operational but may have stale references

### 9. Render.com deployments
- **Apps:**
  - `hoaprojectfunding-api.onrender.com` — HOA webhook receiver
  - `hoa-clawops-console.onrender.com` — Production dashboard (if used)
- **Why it matters:** Webhook URLs in .env.local point to these. If they go down, webhook delivery fails.
- **Action:** Verify these are still running after migration

### 10. Discord bot registration
- **Portal:** discord.com/developers/applications
- **Token:** `DISCORD_BOT_TOKEN` in .env.local
- **Why it matters:** Bot token is tied to the Discord application, not the machine
- **Action:** Verify bot is still in target server

### 11. Facebook app registrations
- **Apps:** 2 (HOA + Jake)
- **Portal:** developers.facebook.com
- **Why it matters:** Access tokens may expire, app review status tied to account
- **Action:** Check token expiry, refresh if needed

### 12. LinkedIn OAuth token
- **Value:** `LINKEDIN_ACCESS_TOKEN` in .env.local
- **Why it matters:** LinkedIn tokens expire (60 days for access tokens)
- **Action:** Check expiry, re-auth if needed

### 13. GitHub personal access token
- **Value:** `GITHUB_TOKEN` in .env.local
- **Repo:** `sjpilche/hoaprojectfunding.com`
- **Why it matters:** Token may have IP restrictions or expiry
- **Action:** Verify scope includes repo write access

---

## LOW — Nice to have for continuity

### 14. Backup directory history
- **Location:** `backups/` in repo
- **Contains:** Timestamped DB snapshots, old .env.local files
- **Note:** Old .env.local files in `backups/pre-security-hardening-*/` contain different (older) credentials — security risk if exposed

### 15. Log history
- **Location:** `logs/` in repo + `services/trader-service/logs/`
- **Contains:** PM2 output/error logs with rotation
- **Why it matters:** Historical debugging only — not needed for function

### 16. .claude/ memory directory
- **Location:** `C:\Users\SPilcher\.claude\projects\c--Users-SPilcher-OpenClaw2-0-for-linux---Copy\memory\`
- **Contains:** Claude Code conversation memory (MEMORY.md, topic files)
- **Why it matters:** Helps Claude Code remember project context in future conversations
- **Action:** Copy if continuing to use Claude Code on new machine

### 17. Docker volumes (if Redis was used)
- **Location:** `./data/redis` (defined in docker-compose.yml)
- **Why it matters:** Only if Redis was actively used for sessions

---

## Verification Script (run on current machine before migration)

```bash
# Check all hidden state locations
echo "=== ~/.openclaw/ ==="
ls -la ~/.openclaw/ 2>/dev/null || echo "NOT FOUND"

echo "=== Global npm packages ==="
npm list -g --depth=0

echo "=== Ollama models ==="
ollama list 2>/dev/null || echo "Ollama not running"

echo "=== PM2 status ==="
pm2 status 2>/dev/null || echo "PM2 not running"

echo "=== Playwright browsers ==="
npx playwright --version 2>/dev/null
ls ~/.cache/ms-playwright/ 2>/dev/null || echo "Check %LOCALAPPDATA%\ms-playwright"

echo "=== Database sizes ==="
ls -lh data/clawops.db services/trader-service/data/trader-brain.sqlite hoa_leads.sqlite 2>/dev/null

echo "=== Task Scheduler (Windows) ==="
schtasks /query /tn "OpenClaw Gateway" 2>/dev/null || echo "No Task Scheduler entry"
```
