# 07 — Agent Migration Sensitivity

Agents and agent groups ranked by how fragile they are during migration. "Fragile" means: likely to break silently, hard to diagnose, or connected to many other agents.

---

## FRAGILE — High risk of silent failure

### F1. dream-team-nightly
- **Why fragile:** Reads ALL agent data (scorecards for every agent), runs 5 sequential phases (scorecards → self-assessment → Ralph QA → Todd actions → morning report), uses GPT-4o for multiple LLM calls
- **Depends on:** collectiveBrain.js, openclawBridge.js, every agent's run history in DB, Discord webhook
- **Failure mode:** Silent — if one phase fails, it logs the error but doesn't retry. Morning report may be empty or missing.
- **Migration risk:** If OpenClaw CLI isn't installed or brain context is empty on new machine, the nightly cycle produces garbage output
- **Test after migration:** Manually trigger `dream_team_nightly` handler and verify Discord post appears

### F2. pipeline-director
- **Why fragile:** Dispatches actions to 20+ agents, hardcodes agent names for dispatch targets, maintains 70/30 Jake/HOA split, limits to 20 actions and 5 LLM calls per run
- **Depends on:** pipeline-state-tracker output, cfo_leads.pipeline_stage, cfo_leads.next_action, multiple agent handlers
- **Failure mode:** If dispatch targets don't match agent names in DB, actions queue up but never execute
- **Migration risk:** If seed-all-agents.js isn't run first, dispatch targets don't exist
- **Test after migration:** Run `pipeline_director` handler manually, verify it dispatches at least one action

### F3. collectiveBrain.js
- **Why fragile:** 4-layer system spanning Azure SQL + SQLite, with fallback logic (write to SQLite when Azure down, drain on reconnect)
- **Depends on:** Azure SQL server (empirecapital.database.windows.net), SQLite brain_fallback_* tables, OpenAI API (for distillation)
- **Failure mode:** If Azure unreachable AND fallback tables don't exist yet, brain context is empty — all agents lose their learned patterns
- **Migration risk:** New machine IP not in Azure SQL firewall → all brain queries fail → fallback kicks in but starts empty
- **Test after migration:** Hit `GET /api/brain/status` or query brain tables directly

### F4. tenacity-cadence-engine
- **Why fragile:** Maintains stateful 12-touch cadence sequences per lead across 3 channels (email/linkedin/sms), with Brain v2 timing adjustments
- **Depends on:** cadence_touches table state, cfo_leads.cadence_active, cfo_leads.next_touch_due, brain episodes for timing patterns
- **Failure mode:** If cadence_touches data is lost (DB not copied), leads get duplicate or out-of-sequence touches
- **Migration risk:** Database must be copied intact — cadence state is NOT reconstructable from other data
- **Test after migration:** Query `SELECT COUNT(*) FROM cadence_touches WHERE status='pending'`

### F5. Playwright-dependent agent group (15+ agents)
- **Why fragile:** Shared singleton browser pool with circuit breaker (3 fails → 10min pause), auto-restart every 20 pages, metrics tracking
- **Agents affected:** jake-construction-discovery, jake-contact-enricher, cfo-lead-scout, hoa-discovery, hoa-contact-finder, hoa-contact-enricher, hoa-minutes-monitor, google-reviews-monitor, mgmt-portfolio-scraper, mgmt-contact-puller, mgmt-review-scanner, mgmt-cai-scraper, jake-permit-scanner, bid-result-scraper
- **Failure mode:** "Browser not found" error → circuit breaker opens → all Playwright agents blocked for 10 minutes → Discord alert fires
- **Migration risk:** Playwright browsers not installed → immediate circuit breaker → all scraping stops
- **Test after migration:** `GET /api/health/playwright` should return healthy status

---

## SENSITIVE — Requires careful handling

### S1. Reply classifier → meeting booker chain
- **Why sensitive:** Reply classifier updates lead status (INTERESTED/NOT_NOW/etc.), which triggers meeting booker (status=pending gate). Meeting booker requires MANUAL human confirmation before executing.
- **Risk:** If reply classifier's brain context is empty, it may misclassify replies → wrong status → wrong follow-up action
- **Mitigation:** Human gate on meeting booker prevents accidental sends

### S2. outreach-sender (human confirmation gate)
- **Why sensitive:** Sends real emails to real people via SendGrid. Requires Steve's confirmation via Console or API endpoint before sending.
- **Risk:** If SendGrid token is invalid/expired on new machine, send attempts fail silently (email just doesn't arrive)
- **Mitigation:** Check `SENDGRID_API_KEY` validity before enabling schedules

### S3. Agent UUIDs (MD5 of name)
- **Why sensitive:** UUIDs are deterministic MD5 hashes of agent names. Re-running seed-all-agents.js recreates identical UUIDs. BUT if you rename an agent, all references to old UUID break (runs history, schedule associations, brain observations).
- **Risk:** Low if you don't rename agents. HIGH if you "clean up" names during migration.
- **Rule:** DO NOT rename agents before or during migration

### S4. postProcessor routing
- **Why sensitive:** Routes LLM output to database tables based on agent name patterns (e.g., `*-content-engine` → cfo_content_pieces). If agent names change, output silently goes nowhere.
- **Risk:** Only if agents are renamed or postProcessor.js is modified

### S5. scheduleRunner spend cap
- **Why sensitive:** Daily budget guard: `max_cost_per_run * max_runs_per_hour`. If .env.local values change or are missing, defaults may be too high or too low.
- **Risk:** Too low → scheduled agents skip. Too high → unexpected API costs.
- **Mitigation:** Verify MAX_COST_PER_RUN and MAX_RUNS_PER_HOUR in .env.local

### S6. Brain distillation (Layer 3 → Layer 4)
- **Why sensitive:** Nightly at 2 AM, promotes episodes with score >= 0.8 to Knowledge Base. If brain is empty (new machine, no Azure SQL access), distillation produces nothing → agents lose learned patterns over time.
- **Risk:** Gradual degradation, not immediate failure

---

## RESILIENT — Low migration risk

### R1. Deterministic handlers ($0 agents)
All 37 special handlers are pure Node.js logic with no external dependencies beyond the database. They will work immediately on any machine where:
- clawops.db is present
- npm packages are installed

### R2. Frontend (React 19)
The frontend is purely client-side after build. It connects to server via API proxy. Will work on any machine after `npm install && npm run build`.

### R3. Database schema + migrations
All 34 migrations are idempotent SQL. Running them on a new database creates the full schema. Running them on a copied database is a no-op. Safe either way.

### R4. Agent seed scripts
`seed-all-agents.js` uses INSERT OR IGNORE — safe to re-run on copied or fresh database. Same for `seed-all-schedules.js --clean`.

---

## Migration Order for Sensitive Agents

1. **First:** Copy clawops.db intact (preserves all state)
2. **Second:** Install Playwright (`npx playwright install chromium`)
3. **Third:** Pull Ollama models
4. **Fourth:** Install OpenClaw CLI + restore ~/.openclaw/
5. **Fifth:** Run seed scripts (safe even on copied DB)
6. **Sixth:** Start pm2, verify health endpoints
7. **Seventh:** Manually trigger ONE agent from each cluster:
   - Core: `pipeline-digest` (morning digest, $0)
   - Jake: `jake-crm-sync` ($0, reads leads)
   - HOA: `hoa-discovery` ($0, Playwright test)
   - Mgmt: `mgmt-portfolio-mapper` ($0, no Playwright)
   - RSE: `rse-channel-monitor` ($0, YouTube RSS)
   - Opp: `traction-monitor` ($0, reads DB)
8. **Eighth:** Verify Discord notification arrives
9. **Ninth:** Let one full nightly cycle run (11 PM → 6:30 AM)
10. **Last:** Enable all schedules
