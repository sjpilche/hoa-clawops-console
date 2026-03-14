# Troubleshooting

Quick reference for common issues. See also [STATUS.md](../STATUS.md) for known workarounds.

---

## Server & Startup

### Port 3001 already in use
```bash
powershell -Command "Get-Process node | Stop-Process -Force"
npm run dev
```

### Agent shows as "idle" but never fires on schedule
1. Check `schedule.enabled=1` in DB
2. Confirm `scheduleRunner.js` is running (look for `[ScheduleRunner] tick` in server logs)
3. Verify cron expression is valid and time has passed

### Server starts but UI shows nothing / blank page
- Check Vite is running on port 5174
- Open browser DevTools → Network → look for failed `/api/agents` call
- Confirm `npm run dev` started both server and Vite (not just one)

### "Cannot reach the server"
Express server isn't running. Run `npm run dev` to start both server and Vite together.

### "Session expired" after refresh
JWT token expired or JWT_SECRET changed. Log in again.

### WebSocket connection failed
Check that Socket.io is running on port 3001. Restart the server.

---

## Agents

### "Unknown agent id" error
The agent isn't registered with OpenClaw CLI:
```bash
openclaw agents add "{name}" --workspace "openclaw-skills/{name}" --non-interactive
```

### Agent not appearing in UI
Seed all agents to DB:
```bash
node scripts/seed-all-agents.js
```

### 404 on a new API route
Two lines are required in `server/index.js` — both must be present:
```javascript
const xRoutes = require('./routes/x');    // top of file
app.use('/api/x', xRoutes);              // inside startServer()
```
Missing either → silent 404.

### Silent 500 on agent run
Check you're using `result_data` not `output` in SQL queries. The `output` column does not exist in the `runs` table.

### Agent run times out
Default timeout is 300s (`MAX_DURATION_PER_RUN` env var). For long-running scrapes:
```bash
MAX_DURATION_PER_RUN=600 npm run dev
```

---

## OpenClaw

### `openclaw doctor` shows "stopped"
This is a **false negative**. Verify the gateway is actually running:
```bash
netstat -ano | findstr ':18789'
```
If not listening, start it:
```bash
openclaw gateway start
```

### OpenClaw bridge spawn fails
The bridge spawns as a **single string command** with `shell:true` — NOT as an array:
```javascript
spawn(`openclaw agent --local --json --agent "name" --message "${escaped}"`, { shell: true })
```

---

## Database

### DB appears empty after server restart
Verify `data/clawops.db` exists and has content:
```bash
ls data/
```
If missing, the schema will be recreated on next `npm run dev` but data will be gone.

### "no such column" errors
A migration didn't run. Restart the server — migrations run automatically on startup.

### Seeding overwrites existing data
Seed scripts use INSERT OR IGNORE (idempotent), but kill the server first to avoid write conflicts:
```bash
powershell -Command "Get-Process node | Stop-Process -Force"
node scripts/seed-all-agents.js
npm run dev
```

### "Rate limit exceeded"
Wait 1 minute (general) or adjust limits in `.env.local`.

---

## Playwright / Web Scraping

### `page.close()` hangs indefinitely
Fixed with `Promise.race([page.close(), new Promise(r => setTimeout(r, 3000))])`. Apply the same pattern in any custom scripts.

### Google Maps returns 0 results
- Browser state may be degraded — the pool auto-restarts every 20 pages
- Check circuit breaker status: `GET /api/health/playwright`
- Reduce `limit` parameter to force a fresh start

### Circuit breaker opened (Playwright)
3 failures in 5 minutes → 10 minute pause. Discord alert fires automatically. After the pause, the circuit closes automatically.

### Email enrichment hit rate is low
~24% is the baseline for Google Maps leads. The enricher now runs a 5-step waterfall:
1. Direct domain guess (HTTP HEAD + text verify)
2. Parallel scrape of homepage + /contact + /about
3. Bing/DuckDuckGo search for company domain
4. Scrape search-found website
5. **LLM-assisted extraction** (Step 5, $0 via Ollama) — fires when all CSS/regex steps find nothing

Step 5 reads JSON-LD, `mailto:` links, and contact sections that regex misses.
To re-run enrichment on previously failed leads:
```bash
node scripts/reset-enrichment.js maps
node scripts/trigger-enricher.js 20 failed maps
```
Watch logs for `[DomExtractor] LLM found:` lines to confirm Step 5 is firing.

### False email match (wrong company)
Page text is verified against company name before accepting. If you see false matches, the domain may belong to a parent company sharing content.

---

## Ollama / LLM Client

### Ollama call fails silently
All server-side LLM calls now route through `server/services/llmClient.js`. It retries up to 2 times with backoff. Check logs for:
```
[LLM] Retry 1/2 for ollama/llama3.2:3b (waiting 100ms)
```
If retries exhaust, the error propagates to the caller. Underlying error type is logged (`network_error`, `timeout`, `server_error`).

### Which services use llmClient
`ollamaBridge`, `softwareFactory`, `domExtractor`, `signalIngest`, `opportunityScorer`, `idleTrainer`, `trainingReflector`, `trainingQA`, `chatService`. All call `llmClient.chat()` or `llmClient.chatJSON()`.

### Ollama not available / model not loaded
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Load the default model
ollama pull llama3.2:3b
ollama pull deepseek-coder-v2:16b
```
`isModelAvailable(model)` in llmClient returns `false` if Ollama is unreachable — callers should fall back gracefully.

### LLM client error types
| Type | Retryable | Meaning |
|------|-----------|---------|
| `network_error` | Yes | Can't connect to Ollama/OpenAI |
| `rate_limit` | Yes | 429 from API |
| `server_error` | Yes | 5xx from API |
| `timeout` | Yes | Request exceeded timeoutMs |
| `auth_error` | No | Invalid API key |
| `context_length` | No | Prompt too long for model |
| `content_filter` | No | Safety filter blocked output |

---

## Email / SendGrid

### Emails bouncing in bulk
Export the SendGrid suppression list (CSV) and run:
```bash
node scripts/remove-bounced-emails.js --delete
```
This hard-deletes bounced addresses from `cfo_leads` and related tables.

### SendGrid API key not working
Verify in `.env.local`:
```
SENDGRID_API_KEY=SG.xxxx
SENDGRID_FROM_EMAIL=hello@yourdomain.com
```

---

## Discord

### Discord notifications not sending
Check `.env.local`:
```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_ENABLED=true
```
Test: `POST /api/discord/test`

---

## Collective Brain

### Brain writes failing silently
Azure SQL may be unreachable. Writes queue in SQLite fallback tables. On next successful Azure connection, `drainFallback()` syncs automatically.

### Brain context not appearing in agent runs
Brain context is injected by `scheduleRunner.js` for **scheduled runs only**. Manual runs from the UI do not get brain context automatically.

### Distillation not promoting episodes
Distillation promotes episodes where `outcome_score >= 0.8` AND `outcome_type IN ('replied','booked','converted')`. Lower-scored episodes stay in Layer 3.

---

## Authentication

### "Too many login attempts"
Rate limiter is in-memory — resets on server restart. Dev limit: 50 attempts, 30s lockout.

### JWT token expired
Tokens expire after 24h. Log out and log in again.

---

## Common Error Messages

| Error | Cause | Fix |
|-------|-------|-----|
| `no such column: updated_at` | Table missing that column | Remove `updated_at=datetime('now')` from the UPDATE |
| `AGENT_NOT_REGISTERED` | Agent missing `openclaw_id` in config | Add `openclaw_id` to agent config JSON |
| `HANDLER_ERROR` | Special handler threw | Check server logs for the actual error |
| `Agent timed out after 300s` | Run exceeded MAX_DURATION_PER_RUN | Increase timeout or reduce batch size |
| `MODULE_NOT_FOUND: better-sqlite3` | Wrong DB driver | Use `sql.js` — see `server/db/connection.js` |
| `Run is completed, not pending` | Tried to confirm already-run run | Check run status before confirming |
| `RUN_NOT_FOUND` | Invalid run ID | Verify UUID is correct |
