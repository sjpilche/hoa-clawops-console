# Pipeline Orchestration

ClawOps has three layers of orchestration that work together to move leads through the funnel automatically.

---

## Layer 1 — Schedule Runner (Heartbeat)

`server/services/scheduleRunner.js`

The core engine. Fires every **60 seconds**, reads all enabled schedules from the DB, and executes any that are due.

**What it does per tick:**
1. Reads `SELECT * FROM schedules WHERE enabled=1`
2. For each schedule: checks if `next_run_at <= now`
3. Fires the run: creates a run record → calls SPECIAL_HANDLER or OpenClaw CLI directly
4. **No confirmation gate** — scheduled runs execute without human approval
5. **Daily spend cap check** — skips run if daily budget exceeded
6. **Brain context injection** — prepends 4-layer brain context to every LLM agent message
7. Updates `last_run_at` and `next_run_at` on the schedule

**Key difference from manual runs:** Scheduled runs execute immediately. Manual runs from the UI create a `pending` run that waits for user confirmation.

---

## Layer 2 — Pipeline Runner (Agent Chains)

`server/services/pipelineRunner.js`

Chains multiple agents into sequential workflows. When one agent completes, the next one fires automatically.

**Predefined pipelines:**

| Pipeline | Steps |
|----------|-------|
| `jake-full-pipeline` | discovery → enricher → lead-scout → outreach |
| `hoa-content-pipeline` | content-writer → cms-publisher → facebook-poster |
| `hoa-lead-pipeline` | discovery → contact-finder → enricher → outreach-drafter |
| `mgmt-research-pipeline` | portfolio-scraper → contact-puller → mapper → review-scanner |
| `jake-signal-pipeline` | permit-scanner → hiring-signal → bid-scraper → lead-scout |
| `jake-close-pipeline` | reply-classifier → meeting-booker → crm-sync |

**How it triggers:** `scheduleRunner.js` calls `onRunCompleted()` after each run finishes. If that run is part of a pipeline, the next step fires automatically. `tickDelayedSteps()` runs every minute to handle any delayed steps.

Seed pipelines: `node scripts/seed-pipelines.js` (after server is running).

---

## Layer 3 — Pipeline Director (Intelligent Dispatch)

`server/services/pipelineDirector.js`
Handler: `pipeline_director` in runs.js
Schedule: 6:30 AM M-F

The director is the highest-level orchestrator. It doesn't execute work itself — it decides what work needs to happen and dispatches the right runs.

**Cycle:**
1. Calls `pipelineStateTracker.computeAllStates()` — recomputes stage for every lead
2. Identifies stalled leads → Discord alert if any
3. For each lead in an actionable state, queues the appropriate next action
4. Respects daily budget cap — max 20 actions, max 5 LLM runs per cycle
5. 70/30 split: Jake leads get priority, HOA gets remaining capacity

**Actions it can dispatch:**
- `enrich` → jake-contact-enricher (if email missing)
- `dossier` → lead-dossier-generator (if no dossier yet)
- `outreach` → jake-outreach-agent (if enriched, no outreach sent)
- `follow_up` → routes through cadence engine if `cadence_active=1`
- `book_call` → jake-meeting-booker (if replied INTERESTED)

---

## Pipeline State Tracker

`server/services/pipelineStateTracker.js`
Handler: `pipeline_state_tracker` in runs.js
Schedule: Daily 1 AM

Recomputes `pipeline_stage` for every active lead based on current data state.

**Stage definitions (Jake):**

| Stage | Condition |
|-------|-----------|
| `discovered` | Lead exists, no email |
| `enriched` | Has email, no outreach |
| `outreach_sent` | Has sent outreach sequence |
| `follow_up_due` | Sent 5+ days ago, no reply |
| `replied` | Has a reply classified |
| `meeting_booked` | sequence_position=3 draft exists |
| `stalled` | In same stage 14+ days |

When stalled leads are found, a Discord embed fires with the count and list.

---

## Post-Processor

`server/services/postProcessor.js`

Called after every LLM agent run completes (both manual and scheduled). Routes the agent's text output to the right DB table.

**Routing logic:**
- Contains outreach email content → `cfo_outreach_sequences`
- Contains blog/article content → `cfo_content_pieces` (type=blog)
- Contains social post content → `cfo_content_pieces` (type=social)
- Contains lead data (JSON) → `cfo_leads`
- Contains metrics/analytics → Discord embed

This is how LLM agents (which just output text) get their results stored in structured tables without knowing anything about the DB schema.

---

## Confirmation Gate (Manual Runs)

When a user triggers a run manually from the UI:

```
1. Frontend: POST /api/agents/:id/run  { message }
2. Server: creates run with status='pending'
3. UI: shows confirmation dialog
4. User clicks Confirm: POST /api/runs/:id/confirm
5. Server: routes to SPECIAL_HANDLER or OpenClaw CLI
6. Socket.io: streams run:log events to UI in real time
7. On complete: run:completed event + Discord notification
```

Manual runs **do not** bypass the confirmation gate unless run via a script directly.

---

## Daily Budget Cap

`scheduleRunner.js` checks spend before each scheduled run:

```javascript
// Skip if we've spent more than (max_cost_per_run × max_runs_per_hour) today
const todaySpend = SUM(cost_usd) FROM runs WHERE DATE(created_at) = today
if (todaySpend >= dailyBudget) skip()
```

Configure via settings:
- `max_cost_per_run` — default $5.00
- `max_runs_per_hour` — default 20

---

## Full Schedule (Current)

```
Mon 6:00 AM   jake-construction-discovery    Google Maps GC scraper ($0)
Mon 6:00 AM   urgency-scorer                 Score all leads 0-100 ($0)
Mon 7:00 AM   jake-lead-scout                LLM national scout, 60-market rotation
Mon 8:00 AM   hoa-content-writer             Blog post
Mon 8:00 AM   jake-contact-enricher          Email waterfall ($0)
Mon 8:30 AM   hoa-cms-publisher              GitHub → Netlify deploy ($0)
Mon 9:00 AM   jake-content-engine            LinkedIn article
Mon/Wed/Fri   tenacity-cadence               12-touch cadence cycle ($0)
Daily 1 AM    pipeline-state-tracker         Recompute all lead stages ($0)
Daily 2 AM    brain-distillation             Layer 3 → Layer 4 KB ($0)
Daily 6:30 AM pipeline-director              Dispatch next actions ($0)
Daily 7 AM    morning-digest                 Discord stats (M-F, $0)
Daily 10 AM   hoa-facebook-poster            Facebook post ($0)
Daily 10 AM   jake-analytics-monitor         Pipeline dashboard
Daily 6 PM    daily-debrief                  War room report (M-F)
Wed/Fri 9 AM  jake-follow-up-agent           Follow-ups for no-reply leads
```
