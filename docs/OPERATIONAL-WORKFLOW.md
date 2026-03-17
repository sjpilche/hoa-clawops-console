# ClawOps Operational Workflow

> How the system actually runs, end-to-end. Updated 2026-03-16.

---

## System Overview

ClawOps is a 95-agent autonomous marketing & operations platform. Three services run continuously:

| Service | Port | Purpose |
|---------|------|---------|
| **clawops-server** | 3001 | Express API, schedule runner, agent execution, WebSocket |
| **clawops-client** | 5174 | React dashboard (Vite dev server) |
| **openclaw-trader** | 3002 | AI paper trading service (Alpaca) |

**Supporting services:** Ollama (11434), Redis (6379), OpenClaw Gateway (18789)

---

## 1. The Heartbeat: Schedule Runner

**File:** `server/services/scheduleRunner.js`

The schedule runner is the core engine. It ticks every 60 seconds and:

1. Checks all enabled schedules against current time (5-field cron)
2. Skips if already ran this minute (dedup guard)
3. Checks daily budget cap (default $100/day ceiling)
4. Executes due schedules immediately (no confirmation gate for scheduled runs)
5. Detects schedule drift (alerts Discord if >120 min behind)
6. Runs nightly brain distillation at 2:00 AM
7. Runs Brain Council summary at 2:30 AM

**Key rule:** Scheduled runs are auto-approved. Manual runs require confirmation.

---

## 2. Three Execution Tiers

Every agent run goes through one of three execution paths:

### Tier 1: Special Handlers ($0, deterministic)
40+ handlers registered in `runs.js`. No LLM involved. Examples:
- `hoa_discovery` -- Google Maps scraping
- `jake_contact_enricher` -- Playwright email scraping
- `outreach_sender` -- SendGrid batch dispatch
- `daily_debrief` -- War room report from DB queries
- `pipeline_state_tracker` -- Recompute lead stages

### Tier 2: Ollama (free local LLM)
Agents with `use_ollama: true` in config. Default model: `llama3.2:3b`.
Used for: drafts, summaries, classification. NOT for web search or high-stakes tasks.

### Tier 3: OpenClaw CLI (GPT-4o)
Default for all other agents. Command:
```
openclaw agent --local --json --agent <id> --message "<msg>"
```
Cost: ~$0.01-0.05/run depending on token count.

**Routing decision:**
```
Has special_handler? --> Tier 1
Has use_ollama: true? --> Tier 2
Otherwise            --> Tier 3 (OpenClaw/GPT-4o)
```

---

## 3. Run Lifecycle

```
                    +-----------+
                    |  Created  |
                    +-----+-----+
                          |
              +-----------+-----------+
              |                       |
        [Scheduled]              [Manual]
              |                       |
              v                       v
         Auto-approved          status=pending
              |                       |
              |                  User confirms
              |                  POST /runs/:id/confirm
              |                       |
              +-----------+-----------+
                          |
                    +-----v-----+
                    |  Running  |
                    +-----+-----+
                          |
              +-----------+-----------+
              |                       |
         [Success]               [Failure]
              |                       |
              v                       v
         completed                 failed
              |                  (timeout, error,
              |                   cost cap hit)
              v
        Post-Process
        (route output to DB tables,
         Brain observation,
         Discord alert)
```

---

## 4. Daily Schedule (What Runs When)

### Nightly Ops (11 PM - 4:30 AM)

| Time | Agent | What it does |
|------|-------|-------------|
| 11:00 PM | dream-team-nightly | 6-phase learning cycle (see below) |
| 11:00 PM | traction-monitor | Check prototype metrics, 14-day kill gate |
| 11:00 PM | jake-crm-sync | Push replied leads to Google Sheets |
| 1:00 AM | pipeline-state-tracker | Recompute all lead stages, flag stalled |
| 1:30 AM | signal-performance-rollup | 30-day source conversion rates |
| 2:00 AM | rse-expert-librarian | Extract patterns from high-score content |
| 2:00 AM | daily-debrief | Nightly war room report |
| 3:00 AM | opportunity-scanner | Reddit/HN/ProductHunt signal ingest |
| 3:00 AM | database-backup | SQLite backup with 7-day retention |
| 3:00 AM (Sun) | rse-feedback-loop | Update source trust scores |
| 4:00 AM | opportunity-scorer | Score opportunity clusters via GPT-4o |
| 4:30 AM | software-factory | Build prototypes from score >=75 ideas |

### RSE Pipeline (5:00 - 8:00 AM)

| Time | Agent | What it does |
|------|-------|-------------|
| 5:00 AM | rse-channel-monitor | Check YouTube RSS feeds for new videos |
| 5:30 AM | rse-transcript-extractor | Download captions via yt-dlp |
| 6:00 AM | rse-signal-scorer | Score transcripts for actionable signals |
| 7:00 AM | rse-build-spec-generator | Generate build specs from signals |
| 7:30 AM | rse-code-builder | Evaluate signals into opportunities |
| 8:00 AM | rse-campaign-builder | Create campaigns from top ideas |

### Discovery & Enrichment (6:00 - 9:30 AM)

| Time | Days | Agent | What it does |
|------|------|-------|-------------|
| 6:00 AM | Mon | urgency-scorer | Score all leads 0-100 |
| 6:00 AM | Mon,Thu | jake-construction-discovery | Google Maps GC scraper (50-150/run) |
| 6:00 AM | Tue | bid-result-scraper | FL/TX procurement portals |
| 6:00 AM | Tue,Fri | owen-pm-discovery | Property mgmt company scraper |
| 6:00 AM | Wed | jake-permit-scanner | County permits $250K+ |
| 6:00 AM | Wed,Fri | jake-pain-signal-monitor | Liens, judgments, BBB signals |
| 7:00 AM | Mon | jake-lead-scout | LLM 60-market rotation |
| 7:00 AM | Mon,Thu | hoa-discovery | Google Maps HOA 19 geo-targets |
| 7:00 AM | Tue,Thu | jake-hiring-signal-agent | CFO/Controller job postings |
| 9:00 AM | Weekdays | hoa-contact-enricher | HOA email/phone enrichment |
| 9:00 AM | Weekdays | owen-contact-enricher | PM contact enrichment |
| 9:00 AM | Mon,Wed,Fri | tenacity-cadence-engine | Adaptive multi-touch follow-ups |
| 9:30 AM | Weekdays | jake-contact-enricher | Playwright email scraper |
| 9:30 AM | Weekdays | ralph-qa | Review outreach drafts before 10 AM |

### Content & Social (8:00 - 11:00 AM)

| Time | Days | Agent | What it does |
|------|------|-------|-------------|
| 8:00 AM | Mon | hoa-content-writer | Blog post for hoaprojectfunding.com |
| 8:00 AM | Mon | jake-content-engine | LinkedIn/blog/email content |
| 8:30 AM | Mon | hoa-cms-publisher | Push blog to GitHub/Netlify |
| 9:00 AM | Tue | hoa-social-media | Blog to Facebook/LinkedIn |
| 9:00 AM | Tue | jake-social-scheduler | Queue Jake content |
| 10:00 AM | Daily | hoa-facebook-poster | Post to HOA Facebook page |
| 11:00 AM | Tue,Thu | jake-twitter-poster | Jake tweet threads |
| 11:00 AM | Wed | linkedin-direct-poster | Jake LinkedIn posts |

### Outreach & Sending (10:00 AM - 2:00 PM)

| Time | Days | Agent | What it does |
|------|------|-------|-------------|
| 10:00 AM | Weekdays | **outreach-sender** | SendGrid batch (100/day cap) -- PREVIEW ONLY |
| 10:00 AM | Tue,Thu | jake-outreach-agent | Personalized cold emails |
| 2:00 PM | Tue,Thu | hoa-outreach-drafter | Personalized HOA outreach |
| 2:00 PM | Thu | content-repurposer | 1 post to 5 derivatives |

### Evening Wrap (5:00 - 6:30 PM)

| Time | Days | Agent | What it does |
|------|------|-------|-------------|
| 5:00 PM | Fri | weekly-portfolio-review | Agent scorecards to Discord |
| 6:00 PM | Weekdays | daily-debrief | End-of-day war room |
| 6:30 AM | Daily | dream-team-nightly | Todd morning report |
| 6:30 AM | Weekdays | pipeline-director | Dispatch next actions |

---

## 5. The Dream Team Nightly Cycle

Six phases, 11:00 PM to 6:30 AM next day:

### Phase 1: Data Collection (11:00 PM)
Snapshot each agent's daily performance: runs, leads, emails, replies, failures.

### Phase 2: Scorecard Grading (11:15 PM) ~$0.015
GPT-4o-mini scores each Dream Team agent (Todd, Scout, Charlie, Ralph, Quill) on 4 weighted dimensions. Grades: A(90+) through F(<40).

### Phase 3: Self-Assessment (11:30 PM) ~$0.015
Each agent proposes 0-2 learned patterns based on their scorecard. Must be concrete and data-backed.

### Phase 4: Ralph QA Gate (11:45 PM) ~$0.006
Two-layer review:
1. Anti-drift blocklist (auto-rejects "lower quality", "skip QA", "bypass" patterns)
2. LLM review of remaining proposals

### Phase 5: Todd Overnight Actions (12:00 AM) $0
- Activate approved patterns (max 10 per agent)
- Auto-suspend patterns that dropped scores 15+ points
- Weekly confidence decay (Sundays)
- Auto-disable agents with 2+ consecutive F grades
- Flag D-grade agents for Steve review

### Phase 6: Morning Report (6:30 AM) ~$0.006
Comprehensive Discord report: scorecards, revenue pipeline, patterns learned/rejected, auto-disabled agents.

---

## 6. Lead Lifecycle (One Lead, End to End)

```
DISCOVERY
  jake-construction-discovery finds "Suncoast Builders" in Tampa Bay
  --> INSERT cfo_leads (status=new, source=google_maps, enrichment_status=pending)
  --> Brain Layer 1: observation recorded
       |
ENRICHMENT
  jake-contact-enricher scrapes website + LinkedIn
  --> UPDATE cfo_leads (contact_email, phone, enrichment_status=complete)
  --> Brain Layer 1: enrichment_result observation
       |
SCORING
  urgency-scorer rates lead 0-100 based on signals
  --> UPDATE cfo_leads (urgency_score=78)
  --> pipeline-state-tracker sets stage=Enriched
       |
DOSSIER
  lead-dossier-generator assembles Markdown profile
  --> UPDATE cfo_leads (dossier, stage=Dossiered)
       |
OUTREACH DRAFTING
  jake-outreach-agent drafts 3 email variants (A/B/C)
  Brain injects: similar winning episodes, knowledge base examples
  --> INSERT cfo_outreach_sequences (status=draft, 3 variants)
  --> Ralph QA reviews quality
       |
HUMAN CONFIRMATION GATE
  outreach-sender creates PREVIEW (not sent!)
  Console shows: "5 emails ready for approval"
  Steve clicks "Approve & Send"
  --> POST /api/cfo-marketing/outreach/send-confirmed
       |
EMAIL SENT
  SendGrid delivers email
  --> UPDATE sequence (status=sent, sent_at)
  --> Revenue tracker: recordEvent(lead, 'contacted')
       |
TRACKING
  SendGrid webhooks report: delivered, opened, clicked
  --> UPDATE engagement scores
       |
REPLY RECEIVED
  SendGrid Inbound Parse catches reply
  --> Classify: INTERESTED / NOT_NOW / WRONG_PERSON / UNSUBSCRIBE
  --> Brain Layer 2: feedback signal
  --> Brain Layer 3: episode with outcome
  --> Discord alert (color-coded)
       |
  [If INTERESTED]
  --> Auto-queue meeting-booker run (status=pending)
  --> Steve confirms --> calendar link sent
  --> Revenue tracker: stage=Meeting
       |
FOLLOW-UP (if no reply)
  tenacity-cadence-engine queues Touch 2 after wait period
  --> jake-follow-up-agent drafts follow-up
  --> Same confirmation gate before send
  --> Up to 12 touches, adaptive timing based on Brain episodes
```

---

## 7. Collective Brain (How Agents Learn)

Four layers of shared intelligence:

### Layer 1: Shared Scratchpad
Agents write observations after every run. Downstream agents read them.
Example: "Suncoast Builders, 48 employees, QuickBooks, Tampa Bay"

### Layer 2: Feedback Signals
Human approvals/rejections on runs. Stored as before/after pairs.
Injected into prompts: "Last 5 rejections on this agent: [examples]"

### Layer 3: Episodic Memory
Outcome patterns: agent + market + ERP + action --> outcome + score.
Retrieved via similarity matching for next outreach to same market/ERP.

### Layer 4: Knowledge Base
Distilled best outputs. Quality-scored. Use_count tracked.
Example: "Top 3 outreach emails for QuickBooks companies"

**Storage:** Azure SQL (primary) with SQLite fallback. Async drain syncs when Azure reconnects.

---

## 8. LLM Routing

```
Request comes in
    |
    v
Is agent.config.special_handler set?
    YES --> Execute handler directly ($0, deterministic)
    NO  --> Continue
    |
    v
Is agent.config.use_ollama = true?
    YES --> Ollama (llama3.2:3b, $0, local)
    NO  --> Continue
    |
    v
OpenClaw CLI --> GPT-4o (~$0.01-0.05/run)
    |
    v
Before LLM call, inject:
  1. Writer briefing (content agents only)
  2. Brain context (Layers 1-4, capped at 2000 chars)
  3. Founder mandate (from founder/agent_mandate.md)
  4. Base message
  Total capped at 6000 chars (Windows CLI limit safety)
```

---

## 9. Human Gates (What Requires Your Approval)

| Action | Gate | How to Approve |
|--------|------|----------------|
| **Send outreach emails** | Preview-only at 10 AM | Console "Approve & Send" or `POST /api/cfo-marketing/outreach/send-confirmed` |
| **Send meeting request** | Pending run | Console "Confirm" or `POST /api/runs/:id/confirm` |
| **Manual agent run** | Pending run | Console "Confirm" or `POST /api/runs/:id/confirm` |
| **External comms** | Hard stop | Steve only |
| **Spend >$50** | Hard stop | Steve only |
| **Strategy/legal** | Hard stop | Steve only |

**What runs autonomously (no approval needed):**
- All scheduled agent runs
- Lead discovery and enrichment
- Content drafting (stored as draft)
- Brain observations and learning
- Score calculations
- Pipeline stage tracking
- Discord notifications

---

## 10. Post-Processing: Where Output Goes

After an LLM agent completes, `postProcessor.js` routes output:

| Agent Type | Output Destination | Extra Actions |
|------------|-------------------|---------------|
| Content engines | `cfo_content_pieces` | Ralph QA, Brain obs, auto-queue social (LinkedIn +1d, Twitter +2d, Facebook +3d) |
| Outreach agents | `cfo_outreach_sequences` | Content guard, angle detection, Ralph QA |
| Lead scouts | `cfo_leads` | Validation, dedup, enrichment status |
| Social schedulers | `cfo_content_pieces` (channel=social) | Queue only |
| Analytics monitors | Discord embed | No DB write |

---

## 11. External Integrations

| Service | Used For | Cost |
|---------|----------|------|
| **OpenAI GPT-4o** | Primary LLM for agents | ~$0.01-0.05/run |
| **Ollama** | Free local LLM (drafts, classification) | $0 |
| **SendGrid** | Outreach emails + inbound reply parsing | ~$0.0001/email |
| **Discord** | Notifications, alerts, morning reports | $0 |
| **Playwright** | Web scraping (Google Maps, contacts, permits) | $0 |
| **YouTube RSS + yt-dlp** | RSE transcript extraction | $0 |
| **Brave Search** | Content discovery | ~$0.02/search |
| **Google Maps API** | HOA/GC/PM company discovery | ~$0.005/search |
| **Twitter API v2** | Post tweet threads | $0 |
| **LinkedIn API** | Post articles | $0 |
| **Facebook Graph API** | Page posts | $0 |
| **Alpaca** | Paper trading (trader service) | $0 |
| **Azure SQL** | Collective Brain primary storage | ~$15-50/mo |
| **ChromaDB** | Vector store for RAG | $0 (local) |

---

## 12. Cost Structure

| Category | Daily Estimate | Monthly Estimate |
|----------|---------------|-----------------|
| Special handlers (40+ agents) | $0 | $0 |
| Ollama runs | $0 | $0 |
| OpenClaw/GPT-4o runs (~10-20/day) | $0.20-1.00 | $6-30 |
| Dream Team nightly | ~$0.06 | ~$1.80 |
| RSE pipeline | ~$0.05-0.10 | ~$1.50-3.00 |
| SendGrid emails | ~$0.01 | ~$0.30 |
| **Total estimated** | **$0.30-1.20** | **$9-35** |

Daily cost cap: $5.00 (configurable in settings). Budget ceiling: $100/day.

---

## 13. Key File Locations

| What | Where |
|------|-------|
| Server entry point | `server/index.js` |
| Schedule runner | `server/services/scheduleRunner.js` |
| Run execution & special handlers | `server/routes/runs.js` |
| Post-processor | `server/services/postProcessor.js` |
| Approval engine | `server/services/approvalEngine.js` |
| Dream Team nightly | `server/services/dreamTeamNightly.js` |
| Collective Brain | `server/services/collectiveBrain.js` |
| Chroma Brain (vector) | `server/services/chromaBrain.js` |
| OpenClaw bridge | `server/services/openclawBridge.js` |
| LLM client | `server/services/llmClient.js` |
| Ollama bridge | `server/services/ollamaBridge.js` |
| Pipeline runner | `server/services/pipelineRunner.js` |
| Cadence engine | `server/services/tenacityCadenceEngine.js` |
| CFO marketing routes | `server/routes/cfoMarketing.js` |
| Agent SOUL files | `openclaw-skills/{agent-name}/SOUL.md` |
| Org chart | `org/agent_org_chart.md` |
| Database schema | `server/db/schema.sql` |
| Migrations | `server/db/migrations/` |

---

## 14. Quick Commands

```bash
# Start everything
pm2 start ecosystem.config.cjs

# Check status
pm2 status
curl http://localhost:3001/api/health

# View logs
pm2 logs clawops-server --lines 50

# Re-seed agents (idempotent)
node scripts/seed-all-agents.js

# Re-seed schedules
node scripts/seed-all-schedules.js --clean

# Run a specific agent manually (via API)
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@clawops.local","password":"changeme123"}' \
  | node -e "process.stdin.on('data',d=>process.stdout.write(JSON.parse(d).token.token))")

curl -X POST http://localhost:3001/api/agents/{AGENT_ID}/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Run now"}'

# Force-run a schedule immediately
curl -X POST http://localhost:3001/api/schedules/{SCHEDULE_ID}/run \
  -H "Authorization: Bearer $TOKEN"

# Approve pending outreach
curl -X POST http://localhost:3001/api/cfo-marketing/outreach/send-confirmed \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"confirmed":true}'

# Login to dashboard
open http://localhost:5174
# admin@clawops.local / changeme123
```
