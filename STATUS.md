# ClawOps Console — System Status

**Last Updated:** March 14, 2026 (post-audit)
**Version:** 2.3
**Overall Status:** OPERATIONAL

---

## System Health

| Component | Status | Notes |
|-----------|--------|-------|
| Backend API | Operational | Express on port 3001 |
| Frontend UI | Operational | Vite on port 5174 |
| Database | Operational | SQLite (`data/clawops.db`) |
| Authentication | Secured | JWT + bcrypt + rate limiting |
| OpenClaw Bridge | Connected | GPT-4o mode active |
| Schedule Runner | Active | Fires every 60s, drift detection active |
| Collective Brain | Active | All 4 layers live, nightly distillation at 2 AM |
| Discord Notifications | Live | Rate-limited (30/hour), every run + morning digest |
| Playwright Reliability Layer | Active | Circuit breaker, browser pool, auto-restart |
| Unified LLM Client | Active | llmClient.js — retry, error classification, 9 services |
| DOM Extractor | Active | LLM-assisted contact extraction (Step 5 fallback, $0) |
| Ralph QA Gate | Active | Auto-reviews all outreach drafts, 5-dimension scoring |
| Content Guard | Active | Competitor mention + false claim + spam filter |
| Output Validator | Active | Schema validation on all LLM agent output |
| Agent Health Scorecard | Active | Per-agent health score, 7-day metrics |
| Daily Cost Cap | Active | $5/day default, configurable in Settings |
| Database Backup | Active | 7-day retention, `database_backup` handler |

---

## Agent Fleet (50+ Agents)

**Status Legend:**
- **Active** — Has service file + special handler OR OpenClaw execution path. Producing output.
- **LLM Active** — Runs via OpenClaw/Ollama bridge. Has SOUL.md. Costs ~$0.01/run.
- **Scaffolded** — Handler exists but service file not yet created. Returns placeholder message.
- **SOUL Only** — Has SOUL.md personality file but no handler or service. Cannot execute.
- **Dormant** — Has SOUL.md, may have partial service. No recent runs. Revenue impact unclear.

### Jake Marketing — Core Brand (7 LLM agents)
| Agent | Schedule | Status | Notes |
|-------|----------|--------|-------|
| jake-content-engine | Mon 9 AM | LLM Active | Content drafts auto-QA'd by Ralph |
| jake-outreach-agent | On-demand | LLM Active | Outreach drafts auto-QA'd, angle_type tracked |
| jake-lead-scout | Mon 7 AM | LLM Active | Output schema validated, lead validation on insert |
| jake-social-scheduler | On-demand | SOUL Only | Has SOUL.md, no service file or handler |
| jake-analytics-monitor | Daily 10 AM | SOUL Only | Has SOUL.md, no service file or handler |
| jake-offer-proof-builder | On-demand | SOUL Only | Has SOUL.md, no service file or handler |
| jake-pilot-deliverer | On-demand | SOUL Only | Has SOUL.md, no service file or handler |

### Jake Marketing — CFO Brand (7 LLM agents)
Same capabilities as Jake core, `source_agent='cfo'` in DB. `cfo-lead-scout` and `cfo-outreach-agent` are Active. Others are SOUL Only.

### Jake Pipeline — Discovery & Enrichment (2 special handlers, $0/run)
| Agent | Schedule | Status | Notes |
|-------|----------|--------|-------|
| jake-construction-discovery | Mon 6 AM | Active | 50-150 companies/market, Brain observations |
| jake-contact-enricher | Mon 8 AM | Active | 24% email hit rate, Brain Layer 1 writes |

### Jake Pipeline — Follow-up Loop (3 agents)
| Agent | Schedule | Status | Notes |
|-------|----------|--------|-------|
| jake-follow-up-agent | Wed/Fri 9 AM | LLM Active | Output schema validated |
| jake-reply-classifier | On-demand | Active | $0, regex classification, Brain feedback + episodes |
| jake-meeting-booker | On-demand | LLM Active | Output schema validated |

### Jake Pipeline — Signal Sources (3 agents)
| Agent | Schedule | Status | Notes |
|-------|----------|--------|-------|
| jake-permit-scanner | — | Scaffolded | Handler exists, returns "service file not yet created" |
| jake-hiring-signal-agent | On-demand | SOUL Only | Has SOUL.md, no handler found |
| bid-result-scraper | — | Scaffolded | Handler exists, returns "service file not yet created" |

### Jake Pipeline — Close Loops (3 agents)
| Agent | Schedule | Status | Notes |
|-------|----------|--------|-------|
| jake-crm-sync | Daily | Active | Google Sheets or CSV fallback |
| content-repurposer | On-demand | SOUL Only | Has SOUL.md, no handler or service |
| jake-case-study-builder | On-demand | SOUL Only | Has SOUL.md, no handler or service |

### Jake Intel (3 agents)
| Agent | Status | Notes |
|-------|--------|-------|
| competitor-intel | SOUL Only | Has SOUL.md, no handler. Listed in org chart but cannot execute |
| jake-pain-signal-monitor | SOUL Only | Has SOUL.md, no handler. Role defined in agent_roles.md |
| linkedin-direct-poster | SOUL Only | Has SOUL.md, no handler |

### Jake Social (2 agents)
| Agent | Status | Notes |
|-------|--------|-------|
| jake-twitter-poster | SOUL Only | Has SOUL.md, no handler |
| sms-follow-up | SOUL Only | Has SOUL.md, no handler, no service |

### HOA Marketing (8 agents)
| Agent | Schedule | Status | Notes |
|-------|----------|--------|-------|
| hoa-content-writer | Mon 8 AM | LLM Active | Output schema validated |
| hoa-cms-publisher | Mon 8:30 AM | SOUL Only | Listed as Active but no handler found |
| hoa-social-media | On-demand | SOUL Only | See HOA Social Cluster doc |
| hoa-social-engagement | On-demand | SOUL Only | See HOA Social Cluster doc |
| hoa-networker | On-demand | SOUL Only | See HOA Social Cluster doc |
| hoa-email-campaigns | On-demand | SOUL Only | See HOA Outreach Cluster doc |
| hoa-website-publisher | On-demand | SOUL Only | No handler found |
| hoa-facebook-poster | Daily 10 AM | LLM Active | Posts via Facebook API |

### HOA Pipeline (5 agents)
| Agent | Status | Notes |
|-------|--------|-------|
| hoa-discovery | Active | Special handler, Playwright/Google Maps |
| hoa-contact-finder | Active | Same as hoa-contact-scraper handler |
| hoa-contact-enricher | Active | Special handler |
| hoa-outreach-drafter | Active | Special handler, LLM output |
| hoa-special-assessment-monitor | SOUL Only | No handler found |

### HOA Intel (2 special handlers, $0/run)
`hoa-minutes-monitor`, `google-reviews-monitor` — both Active with handlers

### Management Research (5 special handlers, $0/run)
`mgmt-portfolio-scraper`, `mgmt-contact-puller`, `mgmt-portfolio-mapper`, `mgmt-review-scanner`, `mgmt-cai-scraper` — all Active

### Opportunity Engine (4 agents)
| Agent | Status | Notes |
|-------|--------|-------|
| opportunity-scanner | Active | Multi-scanner signal ingestion |
| opportunity-scorer | Active | ICE+RPS+ALS scoring, GPT-4o/Ollama |
| software-factory | Active | Prototype scaffolding, needs Ralph deep QA |
| traction-monitor | Active | 14-day kill gate, revenue detection |

### Operations (8 agents)
| Agent | Status | Notes |
|-------|--------|-------|
| daily-debrief | LLM Active | 6PM M-F, Discord |
| morning-digest | Active | 7AM, $0, Discord embed |
| pipeline-director | Active | Autonomous dispatch, budget-capped |
| pipeline-state-tracker | Active | Stall detection, Discord alerts |
| urgency-scorer | Active | 0-100 dual-product scoring |
| tenacity-cadence-engine | Active | 12-touch adaptive sequencing |
| brain-distillation | Active | Nightly KB promotion |
| idle-training | Active | Agent self-improvement, QA-gated |
| ralph-qa | Active | NEW — auto-reviews all drafts |
| database-backup | Active | NEW — SQLite backup, 7-day retention |

### Revenue Signal Engine (4 agents — NEW)
| Agent | Status | Notes |
|-------|--------|-------|
| rse-channel-monitor | Active | YouTube/podcast source discovery |
| rse-transcript-extractor | Active | Transcript extraction |
| rse-signal-scorer | Active | Signal scoring + Brain observations |
| rse-expert-librarian | Active | Pattern extraction from signals |
| rse-feedback-loop | Active | Source trust scoring + pruning |

### Core (1 agent)
`main` (chat router) — Active

### Owen Marketing (3 agents — Dormant)
`owen-content-engine`, `owen-outreach-agent`, `owen-social-scheduler` — SOUL.md exists, execution path unclear, no recent runs. See Dormant Agent Review below.

### Data Rehab (3 agents — Dormant)
`data-rehab-scout`, `data-rehab-content`, `data-rehab-outreach` — SOUL.md exists, execution path unclear, no recent runs. See Dormant Agent Review below.

---

## Dormant Agent Review (as of 2026-03-14)

| Agent Group | SOUL.md | Handler | Service | Last Run | Recommendation |
|-------------|---------|---------|---------|----------|----------------|
| Owen (3) | Yes | No | No | Unknown | KEEP — experiment. Zero cost when idle. Review at Q2 planning. |
| Data Rehab (3) | Yes | No | No | Unknown | KEEP — experiment. Zero cost when idle. Review at Q2 planning. |
| jake-social-scheduler | Yes | No | No | Never | KEEP — needed when Twitter integration activated. |
| jake-analytics-monitor | Yes | No | No | Never | KEEP — useful once pipeline has enough data for analytics. |
| competitor-intel | Yes | No | No | Never | KEEP — valuable role, needs service file built. Priority B. |
| jake-pain-signal-monitor | Yes | No | No | Never | KEEP — valuable role, needs service file built. Priority B. |

**Decision: No agents archived.** All dormant agents cost $0 when idle. Their SOUL.md files represent design investment. Archive only if naming conflicts arise.

---

## Governance Infrastructure (NEW — added 2026-03-14)

| Layer | Component | Status |
|-------|-----------|--------|
| Input Validation | `validateLead()` in runs.js | Active — rejects LLM hallucinations before DB |
| Output Validation | `outputValidator.js` | Active — schema checks on all LLM agents |
| Content Guard | `contentGuard.js` | Active — competitor/false-claim/spam filter |
| Ralph QA Gate | `ralphQA.js` | Active — 5-dimension scoring, auto-review |
| Cost Cap | Daily $5 circuit breaker | Active — configurable in Settings |
| Discord Rate Limit | 30 msg/hour global + per-agent | Active |
| Schedule Drift | Drift detection in scheduleRunner | Active — audit_log + Discord alerts |
| Health Scorecard | `/api/health/agents` | Active — per-agent health score |
| Database Backup | 7-day retention, scriptable | Active |
| Audit Trail | `audit_log` table + output_validation | Active |

---

## ClawOps 2.0 Upgrades — All Complete

### Upgrade A — Urgency Scorer
- File: `server/services/urgencyScorer.js`
- Migration: `028_urgency_scorer.sql`
- Handler: `urgency_scorer` in runs.js
- Schedule: Monday 6 AM
- Scores every lead 0-100 across Fit / Pain / Timeliness / Enrichment dimensions
- Dual-product: scores `cfo_leads` (Jake) + `lg_engagement_queue` (HOA)
- $0/run

### Upgrade B — Lead Dossier Generator
- File: `server/services/leadDossierGenerator.js`
- Migration: `029_lead_dossier.sql`
- Handler: `lead_dossier_generator` in runs.js
- Dual-product (Jake + HOA). $0/run

### Upgrade C — Pipeline State Tracker + Director
- Files: `server/services/pipelineStateTracker.js`, `server/services/pipelineDirector.js`
- Migration: `030_pipeline_state.sql`
- Handlers: `pipeline_state_tracker`, `pipeline_director`
- Schedules: daily 1 AM (tracker) + 6:30 AM M-F (director)

### Upgrade D — Playwright Reliability Layer
- File: `server/services/playwrightPool.js`
- Migration: `031_playwright_metrics.sql`
- Health endpoint: `GET /api/health/playwright`

### Upgrade E — Tenacity Cadence Engine
- File: `server/services/tenacityCadenceEngine.js`
- Migration: `032_cadence.sql`
- Handler: `tenacity_cadence` in runs.js
- Schedule: Mon/Wed/Fri 9 AM

### Upgrade F — Portfolio Audit Hardening (NEW — 2026-03-14)
- Migration: `038_ralph_qa_gate.sql`
- Services: `ralphQA.js`, `contentGuard.js`, `outputValidator.js`
- Routes: `/api/qa`, `/api/health/agents`, `/api/directory`
- Handlers: `ralph_qa`, `database_backup`
- Frontend: `AgentDirectoryPage.jsx` — interactive org chart with SOUL viewer

---

## Collective Brain — All 4 Layers Live

| Layer | Table | Status |
|-------|-------|--------|
| 1 — Observations | `brain_observations` | Written by discovery + enricher runs |
| 2 — Feedback | `brain_feedback` | Manual approve/reject in UI |
| 3 — Episodes | `brain_episodes` | Reply classifier + meeting booker record outcomes |
| 4 — Knowledge Base | `brain_knowledge_base` | Nightly distillation at 2 AM |

---

## Recent Activity

- **Mar 14, 2026** — Portfolio audit complete: 8 critical fixes, Ralph QA gate, output validation, health scorecard, schedule drift detection, content guard, Agent Directory page
- **Mar 13, 2026** — 2,030 bounced emails removed from cfo_leads (SendGrid suppression list)
- **Feb 27, 2026** — All 5 ClawOps 2.0 Upgrades complete (A-E)
- **Feb 26, 2026** — Collective Brain all 4 layers live
- **Feb 25, 2026** — Jake construction pipeline live (discovery + enrichment)
- **Feb 25, 2026** — Discord integration live
- **Feb 24, 2026** — Agent autonomy upgrade — 14 SOUL.md files rewritten with web_search directives
- **Feb 20, 2026** — OpenClaw bridge rewritten; security hardening complete

---

## Cost Breakdown

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| OpenAI GPT-4o | ~$10-20 | LLM agents (~$0.025/run avg), daily cap $5 |
| SendGrid | ~$0-15 | Email sends (volume dependent) |
| Discord | $0 | Webhooks only (rate-limited) |
| GitHub + Netlify | $0 | Blog publishing (free tier) |
| Playwright / Google Maps | $0 | Discovery + enrichment |
| **Total** | **~$20-35/mo** | Full system operational |

---

## How to Run

```bash
npm run dev                         # Start server (3001) + Vite (5174) + Trader (3002)
node scripts/seed-all-agents.js     # Sync all agents to DB (idempotent)
node scripts/backup-database.js     # Manual database backup
openclaw agents list                # Verify OpenClaw registration
```
