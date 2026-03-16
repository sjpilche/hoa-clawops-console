# 10 — Top Risks Summary

---

## Top 15 Migration Risks (Ranked by Severity)

| # | Risk | Severity | What Breaks | Likelihood |
|---|------|----------|-------------|------------|
| 1 | **Forgot to copy clawops.db** | CRITICAL | ALL data — 7,484+ leads, run history, brain fallback, cadence state, schedules | Low (obvious) |
| 2 | **~/.openclaw/ not copied** | CRITICAL | OpenClaw CLI defaults to 2-agent mode. ALL LLM agents restricted. Silent failure. | HIGH (easy to miss) |
| 3 | **ecosystem.config.cjs ROOT not updated** | CRITICAL | PM2 can't start ANY of the 3 services | Medium |
| 4 | **OpenClaw CLI not installed** | CRITICAL | All 27 LLM agents can't execute | Medium |
| 5 | **Playwright not installed** | HIGH | 15+ scraper agents fail immediately, circuit breaker locks out all scraping | Medium |
| 6 | **Ollama not running or models not pulled** | HIGH | RSE scorer, opportunity scanner, software factory, code builder all fail or fall back to paid GPT-4o | Medium |
| 7 | **Azure SQL firewall blocks new IP** | HIGH | Collective brain degraded — SQLite fallback starts empty, agents lose learned patterns | HIGH (easy to forget) |
| 8 | **OPENCLAW_PATH wrong in .env.local** | HIGH | openclawBridge can't find CLI binary — all LLM agents fail | Medium |
| 9 | **Agent names changed during migration** | HIGH | UUID mismatch, schedule breaks, postProcessor routing fails, brain observations orphaned | Low (if following instructions) |
| 10 | **.env.local API keys expired/rotated** | MEDIUM | Various agents fail depending on which key expired (OpenAI, SendGrid, Discord, etc.) | Medium |
| 11 | **seed scripts not run** | MEDIUM | Agent/schedule records missing from DB — scheduleRunner has nothing to run | Low (documented) |
| 12 | **yt-dlp not installed** | MEDIUM | RSE transcript extraction fails — RSE pipeline stops at step 2 | Low |
| 13 | **trader-brain.sqlite not copied** | MEDIUM | Trading brain loses all learned patterns, starts fresh | Medium |
| 14 | **Wrong Node.js version** | LOW | npm install may fail, some features may break | Low |
| 15 | **PM2 auto-start not configured** | LOW | System doesn't come up after reboot — manual start needed | Low |

---

## Top 15 Backup Targets (Ranked by Data Loss Impact)

| # | What | Location | Size | Impact If Lost |
|---|------|----------|------|---------------|
| 1 | **clawops.db** | `data/clawops.db` | 59.7 MB | ALL operational data — leads, runs, schedules, brain fallback, cadence state, enrichment, QA scores |
| 2 | **~/.openclaw/ directory** | `C:\Users\SPilcher\.openclaw\` | small | Autonomy config — without it, system restricted to 2 agents |
| 3 | **.env.local** | root | 10 KB | All API keys, tokens, credentials — 15+ services go dark |
| 4 | **Azure SQL brain data** | empirecapital.database.windows.net | varies | Collective learning from all agent runs — weeks of pattern accumulation |
| 5 | **trader-brain.sqlite** | `services/trader-service/data/` | 4 KB+ | Trading brain learned patterns |
| 6 | **.env.trader** | `services/trader-service/` | 5 KB | Trader service credentials (Alpaca, Grok, Ollama config) |
| 7 | **openclaw-skills/*/SOUL.md** | `openclaw-skills/` | varies | Agent personalities/instructions (in git, but verify committed) |
| 8 | **seed-all-agents.js** | `scripts/` | 8 KB | Canonical agent fleet definition (in git) |
| 9 | **seed-all-schedules.js** | `scripts/` | varies | All 59 schedule definitions (in git) |
| 10 | **founder/agent_mandate.md** | `founder/` | small | Founder context injected into all agents (in git) |
| 11 | **hoa_leads.sqlite** | root | 1.3 MB | Legacy HOA data — may contain unique records |
| 12 | **backups/ directory** | root | varies | Historical DB snapshots for disaster recovery |
| 13 | **ecosystem.config.cjs** | root | 4 KB | PM2 fleet configuration (in git, but edits may not be committed) |
| 14 | **server/db/migrations/** | `server/db/migrations/` | varies | Schema evolution history (in git) |
| 15 | **Claude memory** | `~/.claude/projects/.../memory/` | small | Conversation context for future Claude sessions |

---

## Top 10 Things Most Likely to Break on First Boot

| # | What Will Break | Why | How to Fix | Time to Fix |
|---|----------------|-----|-----------|-------------|
| 1 | **PM2 fails to start** | ROOT path wrong in ecosystem.config.cjs | Edit line 19 to new path | 2 min |
| 2 | **All LLM agents fail** | OpenClaw CLI not installed or ~/.openclaw/ missing | `npm install -g openclaw` + copy config | 10 min |
| 3 | **All scraper agents fail** | Playwright browsers not installed | `npx playwright install chromium` | 5 min |
| 4 | **Brain context empty** | Azure SQL firewall blocks new IP | Add IP in Azure portal | 5 min |
| 5 | **Ollama agents fall back to GPT-4o** | Ollama not running or models not pulled | `ollama serve` + `ollama pull llama3.2:3b` | 15 min |
| 6 | **Discord notifications missing** | Webhook URL invalid or Discord channel deleted | Verify webhook in Discord server settings | 5 min |
| 7 | **Email sends fail** | SendGrid API key expired or from-email not verified | Verify in SendGrid dashboard | 10 min |
| 8 | **Dashboard shows no data** | clawops.db not copied to data/ directory | Copy database file | 2 min |
| 9 | **RSE pipeline stops at transcripts** | yt-dlp not installed | `pip install yt-dlp` | 3 min |
| 10 | **System doesn't restart after reboot** | PM2 startup not configured | `pm2 startup` + `pm2 save` | 5 min |

---

## Final Answers

### A. Most Dangerous False Assumption

**"I can just copy the repo folder and it will work."**

The system depends on at least 6 things that live OUTSIDE the repo:
1. `~/.openclaw/` config (autonomy settings — without it, system restricted to 2 agents)
2. Global npm packages (`openclaw` CLI, `pm2`)
3. Ollama models (llama3.2:3b, deepseek-coder-v2:16b — ~11 GB)
4. Playwright browser binaries (~200 MB)
5. Azure SQL brain data (4 tables of accumulated learning)
6. PM2 process state + auto-start configuration

Missing any one of these causes **silent failures** — agents appear to run but produce no output, or skip execution entirely with no visible error.

### B. Single Safest Next Step

Run these two commands on the current machine RIGHT NOW:

```bash
node scripts/backup-database.js
xcopy /E /I "%USERPROFILE%\.openclaw" "backups\openclaw-config"
```

This protects the two most irreplaceable pieces of state:
1. The SQLite database (all operational data)
2. The OpenClaw autonomy configuration (manual fix that took significant effort)

### C. Is This System Transferable Now?

**Conditionally yes.** The repo is well-structured, the code is portable (sql.js, no native deps), and the documentation is adequate (CLAUDE.md + MEMORY.md + this audit).

**But migration will fail without:**
1. Copying the SQLite databases (clawops.db + trader-brain.sqlite)
2. Recreating `~/.openclaw/` config with autonomy settings
3. Installing OpenClaw CLI v2026.3.12 globally
4. Pulling Ollama models
5. Updating the hardcoded ROOT path in ecosystem.config.cjs
6. Adding new machine IP to Azure SQL firewall
7. Installing Playwright browsers

**Recommendation:** Follow the 08_transfer_strategy.md phases in order. Estimated active time: ~2.5 hours. Keep old machine running for 24 hours after migration as rollback insurance.
