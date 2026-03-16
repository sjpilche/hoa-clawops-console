# 04 — Portability Risks

Every risk that could cause a failure when moving this system to a new machine.

---

## HIGH Severity

### H1. Hardcoded Windows path in ecosystem.config.cjs
- **File:** `ecosystem.config.cjs` line 19
- **Value:** `const ROOT = 'C:\\Users\\SPilcher\\OpenClaw2.0 for linux - Copy';`
- **Also:** line 84 uses `ROOT + '\\services\\trader-service'`
- **Impact:** PM2 will fail to start ALL 3 services on any machine where this path doesn't exist
- **Fix required:** Update ROOT to new machine's path before starting PM2

### H2. OPENCLAW_PATH in .env.local
- **File:** `.env.local`
- **Value:** `OPENCLAW_PATH=C:\Users\SPilcher\AppData\Roaming\npm`
- **Impact:** OpenClaw CLI won't be found; all LLM agent runs will fail silently
- **Fix required:** Set to new machine's global npm path (or ensure `openclaw` is in PATH)

### H3. OpenClaw CLI v2026.3.12 global installation
- **Dependency:** `openclaw` must be installed globally via `npm install -g openclaw`
- **Impact:** Without it, `openclawBridge.js` cannot spawn agent processes — all LLM agents fail
- **Version-sensitive:** v2026.3.12 has specific schema keys (`tools.sandbox.tools.{allow,deny}`)
- **Fix required:** Install exact version on new machine

### H4. ~/.openclaw/ directory configuration
- **Location:** `C:\Users\SPilcher\.openclaw\`
- **Contains:** `openclaw.json` (gateway config, tool permissions, autonomy settings)
- **Impact:** Without this config, agents will be restricted to 2 agents (default v2026.3.12 behavior)
- **History:** Was manually restored from 2-agent default to 59-agent config (see memory/openclaw_autonomy_fix.md)
- **Fix required:** Copy entire `~/.openclaw/` directory to new machine's user home

### H5. SQLite database files must be copied intact
- **Primary:** `data/clawops.db` (59.7 MB) — ALL agent state, leads, schedules, run history, brain fallback
- **Trader:** `services/trader-service/data/trader-brain.sqlite` — trading brain
- **Legacy:** `hoa_leads.sqlite` (root, 1.3 MB)
- **Impact:** Without clawops.db, you lose all leads (7,484+), run history, brain observations, cadence state, enrichment attempts
- **Fix required:** Binary copy of all .db/.sqlite files before migration

### H6. Playwright/Chromium browser binaries
- **Dependency:** `playwright` npm package + Chromium browser binary
- **Used by:** 15+ agents (discovery, enrichment, intel — see agent inventory)
- **Impact:** All Playwright-dependent agents will fail with "browser not found"
- **Fix required:** `npx playwright install chromium` on new machine

### H7. Ollama models not included in repo
- **Required models:** `llama3.2:3b` (default), `deepseek-coder-v2:16b` (code gen)
- **Used by:** RSE signal scorer, opportunity scanner, software factory, rse-code-builder
- **Impact:** Agents fall back to GPT-4o (costs money) or fail entirely
- **Fix required:** `ollama pull llama3.2:3b && ollama pull deepseek-coder-v2:16b`

### H8. Azure SQL firewall rules
- **Server:** `empirecapital.database.windows.net`
- **Impact:** New machine's IP must be whitelisted in Azure SQL firewall
- **Without it:** Collective brain operates in degraded SQLite-only mode (functional but no cross-machine learning sync)
- **Fix required:** Add new machine's public IP to Azure SQL firewall rules

### H9. .env.local contains machine-specific secrets
- **179 lines** of API keys, tokens, credentials
- **Machine-specific values:** OPENCLAW_PATH, OPENCLAW_GATEWAY_URL (ws://127.0.0.1:18789), gateway token
- **Impact:** Must be manually reviewed and updated for new machine
- **Security note:** Some tokens may be rotated/expired by migration time

---

## MEDIUM Severity

### M1. Windows .bat startup files
- **Files:** START-CLAWOPS.bat, STOP-CLAWOPS.bat, RESTART-FRESH.bat, etc.
- **Impact:** Won't run on Linux/macOS — but they're just wrappers around pm2 commands
- **Fix required:** Create shell script equivalents if migrating to Linux

### M2. PM2 auto-start via Windows Task Scheduler
- **Current:** `\OpenClaw Gateway` task in Windows Task Scheduler
- **Impact:** System won't auto-start on new machine boot
- **Fix required:** Set up equivalent auto-start (systemd on Linux, launchd on macOS, or new Task Scheduler entry on Windows)

### M3. OpenClaw Gateway WebSocket (port 18789)
- **Config:** `OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789`
- **Impact:** Multi-turn agent sessions and gateway features won't work without gateway running
- **Fix required:** Start gateway on new machine, verify port binding

### M4. yt-dlp CLI for RSE transcript extraction
- **Used by:** `rse-transcript-extractor` agent
- **Impact:** RSE pipeline stops at transcript extraction step
- **Fix required:** Install yt-dlp (`pip install yt-dlp` or download binary)

### M5. Node.js 24 + tsx for trader service
- **Trader service** uses TypeScript with `--import tsx` flag
- **Impact:** Trader service won't start without tsx installed
- **Fix required:** `npm install` (tsx is in devDependencies) + Node.js 24

### M6. Azure SQL network connectivity
- **Used by:** collectiveBrain.js, hoaLeads routes, brain routes
- **Impact:** Brain Layer 1-4 queries fail → SQLite fallback kicks in
- **Note:** System designed to handle this gracefully, but degraded

### M7. Discord webhook URL
- **Current URL:** Points to specific Discord channel
- **Impact:** If channel is deleted or webhook regenerated, all notifications fail silently
- **Fix required:** Verify webhook is still valid, update if needed

### M8. GitHub personal access token scope
- **Used by:** hoa-cms-publisher (blog publishing)
- **Impact:** Token may be expired or scoped to current machine
- **Fix required:** Verify token, regenerate if needed

### M9. Facebook/LinkedIn/Twitter access tokens
- **Facebook:** 2 apps (HOA + Jake) with access tokens
- **LinkedIn:** OAuth access token (may expire)
- **Twitter:** API keys + access tokens
- **Impact:** Social posting agents fail silently
- **Fix required:** Verify all tokens are still valid

### M10. Stale Windows Task Scheduler entries
- **Known issue:** `\OpenClaw Gateway Watchdog` task points to wrong port (8000 instead of 18789)
- **Impact:** Confusion on new machine if old tasks are migrated
- **Fix required:** Delete stale watchdog task, keep `\OpenClaw Gateway` task

---

## LOW Severity

### L1. sql.js WebAssembly driver
- **Cross-platform:** Works on Windows, Linux, macOS without native compilation
- **Impact:** None expected — this was chosen specifically for portability
- **Note:** Slower than better-sqlite3 but zero native dependencies

### L2. Relative database path
- **Value:** `DB_PATH=./data/clawops.db`
- **Impact:** Resolves relative to server working directory — works as long as pm2 cwd is correct
- **Note:** ecosystem.config.cjs sets `cwd: ROOT`, so this depends on H1 being fixed

### L3. Log file paths
- **Location:** `./logs/` (relative)
- **Impact:** Logs start fresh on new machine — no functional impact
- **Note:** Historical logs lost unless backed up

### L4. Redis (optional)
- **docker-compose.yml** defines Redis on port 6379
- **Impact:** Optional service — system works without it (session state falls back to in-memory)

### L5. Polymarket/DC Site Intel URLs
- **Config:** `DC_SITE_INTEL_URL=http://localhost:8096`
- **Impact:** These are optional/experimental services — not critical path

### L6. Default login credentials
- **Value:** `admin@clawops.local` / `changeme123`
- **Impact:** Works on any machine — but should be changed in production
