# ClawOps Console — System Status

**Last Updated:** March 14, 2026
**Version:** 2.2
**Overall Status:** ✅ OPERATIONAL

---

## System Health

| Component | Status | Notes |
|-----------|--------|-------|
| Backend API | ✅ Operational | Express on port 3001 |
| Frontend UI | ✅ Operational | Vite on port 5174 |
| Database | ✅ Operational | SQLite (`data/clawops.db`) |
| Authentication | ✅ Secured | JWT + bcrypt + rate limiting |
| OpenClaw Bridge | ✅ Connected | GPT-4o mode active |
| Schedule Runner | ✅ Active | Fires every 60s |
| Collective Brain | ✅ Active | All 4 layers live, nightly distillation at 2 AM |
| Discord Notifications | ✅ Live | Every run + morning digest |
| Playwright Reliability Layer | ✅ Active | Circuit breaker, browser pool, auto-restart |
| Unified LLM Client | ✅ Active | llmClient.js — retry, error classification, 9 services |
| DOM Extractor | ✅ Active | LLM-assisted contact extraction (Step 5 fallback, $0) |

---

## Agent Fleet (50+ Agents)

### Jake Marketing — Core Brand (7 LLM agents)
| Agent | Schedule | Status |
|-------|----------|--------|
| jake-content-engine | Mon 9 AM | ✅ Active |
| jake-outreach-agent | On-demand | ✅ Active |
| jake-lead-scout | Mon 7 AM | ✅ Active |
| jake-social-scheduler | On-demand | ✅ Active |
| jake-analytics-monitor | Daily 10 AM | ✅ Active |
| jake-offer-proof-builder | On-demand | ✅ Active |
| jake-pilot-deliverer | On-demand | ✅ Active |

### Jake Marketing — CFO Brand (7 LLM agents)
Same capabilities as Jake core, `source_agent='cfo'` in DB. All active.

### Jake Pipeline — Discovery & Enrichment (2 special handlers, $0/run)
| Agent | Schedule | Status |
|-------|----------|--------|
| jake-construction-discovery | Mon 6 AM | ✅ Active — 50–150 companies/market |
| jake-contact-enricher | Mon 8 AM | ✅ Active — 24% email hit rate baseline; Step 5 LLM fallback active |

### Jake Pipeline — Follow-up Loop (3 agents)
| Agent | Schedule | Status |
|-------|----------|--------|
| jake-follow-up-agent | Wed/Fri 9 AM | ✅ Active |
| jake-reply-classifier | On-demand | ✅ Active — $0, instant classification |
| jake-meeting-booker | On-demand | ✅ Active |

### Jake Pipeline — Signal Sources (3 agents)
| Agent | Schedule | Status |
|-------|----------|--------|
| jake-permit-scanner | On-demand | ✅ Scaffolded (service file pending) |
| jake-hiring-signal-agent | On-demand | ✅ Active |
| bid-result-scraper | On-demand | ✅ Scaffolded (service file pending) |

### Jake Pipeline — Close Loops (3 agents)
| Agent | Schedule | Status |
|-------|----------|--------|
| jake-crm-sync | Daily | ✅ Active — Google Sheets or CSV fallback |
| content-repurposer | On-demand | ✅ Active |
| jake-case-study-builder | On-demand | ✅ Active |

### Jake Intel (3 agents)
All active on-demand: `competitor-intel`, `jake-pain-signal-monitor`, `linkedin-direct-poster`

### Jake Social (2 agents)
`jake-twitter-poster`, `sms-follow-up` — active on-demand

### HOA Marketing (8 agents)
| Agent | Schedule | Status |
|-------|----------|--------|
| hoa-content-writer | Mon 8 AM | ✅ Active |
| hoa-cms-publisher | Mon 8:30 AM | ✅ Active — GitHub → Netlify |
| hoa-social-media | On-demand | ✅ Active |
| hoa-social-engagement | On-demand | ✅ Active |
| hoa-networker | On-demand | ✅ Active |
| hoa-email-campaigns | On-demand | ✅ Active |
| hoa-website-publisher | On-demand | ✅ Active |
| hoa-facebook-poster | Daily 10 AM | ✅ Active |

### HOA Pipeline (5 agents)
All active: `hoa-discovery`, `hoa-contact-finder`, `hoa-contact-enricher`, `hoa-outreach-drafter`, `hoa-special-assessment-monitor`

### HOA Intel (2 special handlers, $0/run)
`hoa-minutes-monitor`, `google-reviews-monitor` — both active

### Management Research (5 special handlers, $0/run)
`mgmt-portfolio-scraper`, `mgmt-contact-puller`, `mgmt-portfolio-mapper`, `mgmt-review-scanner`, `mgmt-cai-scraper` — all active

### Core (3 agents)
`main` (chat router), `daily-debrief` (6 PM M-F), `morning-digest` (7 AM M-F)

---

## ClawOps 2.0 Upgrades — All Complete

### Upgrade A — Urgency Scorer ✅
- File: `server/services/urgencyScorer.js`
- Migration: `028_urgency_scorer.sql`
- Handler: `urgency_scorer` in runs.js
- Schedule: Monday 6 AM
- Scores every lead 0–100 across Fit / Pain / Timeliness / Enrichment dimensions
- Dual-product: scores `cfo_leads` (Jake) + `lg_engagement_queue` (HOA)
- $0/run — pure SQLite reads + writes

### Upgrade B — Lead Dossier Generator ✅
- File: `server/services/leadDossierGenerator.js`
- Migration: `029_lead_dossier.sql`
- Handler: `lead_dossier_generator` in runs.js
- Assembles personalized Markdown dossier per lead: situation · pain narrative · brain episodes · KB angles · CTA
- Dual-product (Jake + HOA). $0/run — DB reads + string assembly

### Upgrade C — Pipeline State Tracker + Director ✅
- Files: `server/services/pipelineStateTracker.js`, `server/services/pipelineDirector.js`
- Migration: `030_pipeline_state.sql`
- Handlers: `pipeline_state_tracker`, `pipeline_director`
- Schedules: daily 1 AM (tracker) + 6:30 AM M-F (director)
- State tracker: recomputes `pipeline_stage` for all active leads, flags stalled, Discord alert
- Director: dispatches next actions (enrich/dossier/outreach/follow-up/book), 70/30 Jake/HOA split, max 20 actions/5 LLM per cycle

### Upgrade D — Playwright Reliability Layer ✅
- File: `server/services/playwrightPool.js`
- Migration: `031_playwright_metrics.sql` (3 tables)
- Singleton browser pool: `getInstance()`, `getPage()`, `safeClose()`, `circuitBreaker()`
- Circuit breaker: 3 fails/5 min → 10 min pause → Discord alert on open/close
- Auto-restart: browser restarts every 20 pages
- Health endpoint: `GET /api/health/playwright`
- Used by: `jakeConstructionDiscovery.js`, `jakeContactEnricher.js`, `googleMapsDiscovery.js`

### Upgrade E — Tenacity Cadence Engine ✅
- File: `server/services/tenacityCadenceEngine.js`
- Migration: `032_cadence.sql` (`cadence_touches` table + cadence columns on `cfo_leads` + `lg_engagement_queue`)
- Handler: `tenacity_cadence` in runs.js
- Schedule: Mon/Wed/Fri 9 AM
- 12-touch adaptive cadence across 3 channels (email / LinkedIn / SMS)
- Brain v2 adjusts timing and tone based on past episode outcomes
- `deactivateCadence()` auto-called on INTERESTED / UNSUBSCRIBE / BOUNCED reply

---

## Collective Brain — All 4 Layers Live

| Layer | Table | Status |
|-------|-------|--------|
| 1 — Observations | `brain_observations` | ✅ Written by discovery + enricher runs |
| 2 — Feedback | `brain_feedback` | ✅ Manual approve/reject in UI |
| 3 — Episodes | `brain_episodes` | ✅ Reply classifier + meeting booker record outcomes |
| 4 — Knowledge Base | `brain_knowledge_base` | ✅ Nightly distillation at 2 AM |

Brain context prepended to every scheduled LLM run automatically.

Episode outcome scores:
- `INTERESTED` reply → 0.9
- `NOT_NOW` reply → 0.3
- `UNSUBSCRIBE` → 0.1
- `BOUNCED` → 0.0
- Meeting booked → 1.0

---

## Recent Activity

- **Mar 13, 2026** — 2,030 bounced emails removed from cfo_leads (SendGrid suppression list)
- **Feb 27, 2026** — All 5 ClawOps 2.0 Upgrades complete (A–E)
- **Feb 26, 2026** — Collective Brain all 4 layers live
- **Feb 25, 2026** — Jake construction pipeline live (discovery + enrichment)
- **Feb 25, 2026** — Discord integration live
- **Feb 24, 2026** — Agent autonomy upgrade — 14 SOUL.md files rewritten with web_search directives
- **Feb 20, 2026** — OpenClaw bridge rewritten; security hardening complete

---

## Known Issues / Workarounds

| Issue | Fix |
|-------|-----|
| `openclaw doctor` shows "stopped" | False negative — verify with `netstat -ano | findstr ':18789'` |
| Playwright `page.close()` hangs after timeout | Fixed: `Promise.race([page.close(), setTimeout(3s)])` |
| Browser state degradation during enrichment | Auto-restart every 20 pages via Playwright pool |
| Email false match (wrong company domain) | Page text verified against company name before accepting |
| Auth rate limiter resets on restart | In-memory by design — 50 attempts, 30s lockout |
| `openclaw agent` fails with "Unknown agent id" | Run: `openclaw agents add "{name}" --workspace "openclaw-skills/{name}" --non-interactive` |

---

## Cost Breakdown

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| OpenAI GPT-4o | ~$10–20 | LLM agents (~$0.025/run avg) |
| SendGrid | ~$0–15 | Email sends (volume dependent) |
| Discord | $0 | Webhooks only |
| GitHub + Netlify | $0 | Blog publishing (free tier) |
| Azure SQL | Pay-as-you-go | Collective Brain storage |
| Playwright / Google Maps | $0 | Discovery + enrichment |
| **Total** | **~$20–35/mo** | Full system operational |

---

## How to Run

```bash
npm run dev                         # Start server (3001) + Vite (5174) + Trader (3002)
node scripts/seed-all-agents.js     # Sync all agents to DB (idempotent)
openclaw agents list                # Verify OpenClaw registration
```
