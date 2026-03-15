# OpenClaw 2.0 — Portfolio Audit Report
**Auditor:** Ruthless Portfolio Auditor
**Date:** 2026-03-14
**Scope:** 50+ agents, full workspace inspection
**Principle:** Preserve what works. Harden what's weak. Don't tear down the house.

---

## 1. Portfolio Summary

| Metric | Value |
|--------|-------|
| Total agents identified | 53 |
| Active with special handlers (deterministic, $0) | 22 |
| Active with LLM execution (GPT-4o / Ollama) | 18 |
| Scaffolded but no service file | 3 |
| VACANT roles (org chart positions unfilled) | 7 |
| Dormant / unclear purpose | 3 |
| Monthly operating cost | ~$20-35 |
| Departments | 5 (Research, Engineering, Marketing, Finance, Operations) |
| Memory layers | 5 (File + 4 DB-backed Collective Brain) |
| Escalation tiers | 3 + 8 hard stops |
| Daily rhythm | 4 scheduled touchpoints (1AM, 2AM, 7AM, 6PM) |

**Verdict:** This is a well-architected, cost-conscious multi-agent system with genuine governance. The org chart, RACI matrix, escalation rules, and memory architecture are far above average. The main risks are in gaps — not in what's built.

---

## 2. Agent Classification Table

### A. Core / High-Value (Protect and Harden First)

| Agent | Type | Cost | Why Core |
|-------|------|------|----------|
| `jake-lead-scout` | LLM | $0.01/run | Primary revenue pipeline entry point |
| `jake-contact-enricher` | Special handler | $0 | 24% email hit rate, feeds outreach |
| `jake-construction-discovery` | Special handler | $0 | 50-150 companies/market, Google Maps |
| `jake-outreach-agent` | LLM | $0.01/run | Revenue-generating cold email |
| `jake-reply-classifier` | Special handler | $0 | Closes feedback loop, feeds Brain |
| `jake-meeting-booker` | LLM | $0.01/run | Converts INTERESTED → booked call |
| `pipeline-director` | Special handler | $0 | Autonomous dispatch, prevents stalls |
| `pipeline-state-tracker` | Special handler | $0 | Stall detection, stage computation |
| `urgency-scorer` | Special handler | $0 | Lead prioritization across both products |
| `tenacity-cadence` | Special handler | $0 | 12-touch adaptive sequencing |
| `brain-distillation` | Special handler | $0 | Institutional memory, KB promotion |
| `daily-debrief` | LLM | $0.01/run | Steve's daily ops picture |
| `morning-digest` | Special handler | $0 | Discord KPI delivery |
| `lead-dossier-generator` | Special handler | $0 | Context assembly for outreach |
| Todd (Chief of Staff) | Orchestrator | $0 | Routes all work, fleet health |

### B. Useful but Underdefined

| Agent | Issue |
|-------|-------|
| `competitor-intel` | Has SOUL.md but no service file or special handler; never produces output |
| `jake-pain-signal-monitor` | Same — defined in org chart, no execution path |
| `jake-hiring-signal-agent` | STATUS.md says "active" but no special handler found |
| `hoa-social-engagement` | Overlaps with `hoa-networker`; unclear division |
| `hoa-email-campaigns` | Has SOUL.md but no distinct service from `hoa-outreach-drafter` |
| `jake-case-study-builder` | Listed as active, no service file visible |
| `content-repurposer` | Listed as active, no special handler |
| `hoa-website-publisher` | Listed in STATUS.md, execution path unclear |
| `hoa-cms-publisher` | Listed in STATUS.md, execution path unclear |

### C. Overlapping / Duplicative

| Cluster | Agents | Overlap |
|---------|--------|---------|
| Jake/CFO Marketing | `jake-content-engine` + `cfo-content-engine` | Same code, different `source_agent` tag |
| Jake/CFO Lead Scout | `jake-lead-scout` + `cfo-lead-scout` | `cfo-lead-scout` is a simpler version of jake's |
| Jake/CFO Outreach | `jake-outreach-agent` + `cfo-outreach-agent` | Same prompt structure, different brand |
| HOA Social | `hoa-social-media` + `hoa-facebook-poster` + `hoa-social-engagement` | Three agents for one channel cluster |
| HOA Outreach | `hoa-outreach-drafter` + `hoa-email-campaigns` | Unclear boundary |

**Recommendation:** Do NOT merge these yet. The brand separation (Jake vs CFO vs HOA) is intentional. Instead, document the boundary between each pair and ensure they share Brain context.

### D. Risky / Over-Permissioned

| Agent | Risk |
|-------|------|
| `jake-lead-scout` | Runs LLM with `web_search` + DB writes; if prompt injection via search results, could insert garbage leads |
| `jake-outreach-agent` | Generates email body from LLM; prompt injection → reputational damage |
| `software-factory` | Scaffolds code from LLM output; if deployed without review, security risk |
| `hoa-facebook-poster` | Posts to Facebook via API; automation error → brand damage |
| `jake-crm-sync` | Writes to Google Sheets; if bad data reaches CRM, pipeline corruption |
| `idle-training` | Self-modification via reflection; no hard boundary on what skills can be "learned" |

### E. Dormant / Unclear Purpose

| Agent | Issue |
|-------|-------|
| `jake-permit-scanner` | Service file not created; handler returns "not yet created" |
| `bid-result-scraper` | Same — scaffolded handler, no service |
| `sms-follow-up` | Listed in STATUS.md, no handler or service found |
| Owen agents (`owen-content-engine`, `owen-outreach-agent`, `owen-social-scheduler`) | Full SOUL.md but unclear if Owen persona is actively generating revenue |
| Data Rehab agents (`data-rehab-scout`, `data-rehab-content`, `data-rehab-outreach`) | Same — full SOUL.md, unclear if active |

---

## 3. Top 15 Issues Ranked by Risk and ROI

| # | Issue | Risk | ROI | Fix |
|---|-------|------|-----|-----|
| 1 | **No eval framework** — zero automated tests for LLM agent output quality | HIGH | HIGH | Add output scoring for jake-lead-scout, outreach-agent, follow-up-agent |
| 2 | **No input sanitization on LLM agent messages** — `parseMessageParams` trusts JSON from LLM output | HIGH | HIGH | Validate lead data schema before DB insert in jake_lead_scout handler |
| 3 | **Outreach agent has no Ralph QA gate** — coordination_protocol says Ralph reviews all, but outreach goes direct to draft | HIGH | HIGH | Add Ralph review step between LLM draft and `status='draft'` |
| 4 | **No rate limiting on agent-to-Discord** — a runaway schedule could spam Steve's Discord | MED | HIGH | Add per-agent Discord rate limit (max 5 messages/hour) |
| 5 | **9 agents with SOUL.md but no execution path** — listed as "active" but can't actually run | MED | HIGH | Audit STATUS.md; mark scaffolded agents honestly |
| 6 | **Tool policy not enforced at handler level** — `openclaw-tool-policy.json` blocks write/exec but special handlers bypass OpenClaw entirely | MED | MED | Add tool-level access control in the handler dispatch logic |
| 7 | **No cost alerting** — monthly cost is low now, but no circuit breaker if GPT-4o spend spikes | MED | MED | Add daily cost cap in runs.js confirm route ($5/day default) |
| 8 | **Brain distillation has no quality gate** — episodes with score >=0.8 auto-promote to KB with no review | MED | MED | Add confidence threshold + human approval for KB entries |
| 9 | **Idle training has no skill boundary** — agents can "learn" anything during reflection | MED | LOW | Add skill allowlist per agent; Ralph QA gate exists but enforcement unclear |
| 10 | **No backup schedule for SQLite** — `data/clawops.db` is the single source of truth | HIGH | HIGH | Add daily cron backup to `backups/` with 7-day retention |
| 11 | **`parseMessageParams` silently swallows bad JSON** — returns `{}` on parse failure | LOW | HIGH | Log warning + return explicit error for malformed messages |
| 12 | **Opportunity Engine scanners may hit rate limits** — 10 scanners running in sequence with no backoff | MED | MED | Add per-scanner rate limit and exponential backoff |
| 13 | **No agent health scorecard** — success_rate column exists but never computed | LOW | HIGH | Compute success_rate on each run completion |
| 14 | **Playwright pool has no memory limit** — browser restarts every 20 pages but no RSS cap | LOW | MED | Add memory threshold check before page allocation |
| 15 | **Coordination protocol says "no agent-to-agent comms" but Pipeline Director dispatches runs directly** — architectural inconsistency | LOW | LOW | Update coordination_protocol.md to reflect actual dispatch pattern |

---

## 4. High-Value Agents to Protect and Harden First

**Tier 1 — Revenue Pipeline (touch these with extreme care):**
1. `jake-lead-scout` — add output schema validation, JSON parse hardening
2. `jake-contact-enricher` — add email format validation, rate limit on enrichment attempts
3. `jake-outreach-agent` — add Ralph QA gate, output length/content guard
4. `jake-reply-classifier` — add classification confidence logging, manual override path
5. `pipeline-director` — add daily action cap enforcement, dry-run mode

**Tier 2 — Operational Backbone:**
6. `brain-distillation` — add KB quality gate
7. `urgency-scorer` — add score distribution monitoring (drift detection)
8. `tenacity-cadence` — add cadence deactivation audit trail
9. `daily-debrief` / `morning-digest` — add delivery confirmation tracking

---

## 5. Overlap Clusters

### Cluster 1: Jake vs CFO Brand Agents
- `jake-lead-scout` / `cfo-lead-scout`
- `jake-outreach-agent` / `cfo-outreach-agent`
- `jake-content-engine` / `cfo-content-engine`

**Verdict:** Intentional brand separation. Same codebase, different `source_agent` tag. This is fine — do not merge. But document that they share the `cfo_leads` table and Brain context.

### Cluster 2: HOA Social Cluster
- `hoa-social-media` / `hoa-facebook-poster` / `hoa-social-engagement` / `hoa-networker`

**Verdict:** Four agents for social media is excessive. `hoa-facebook-poster` is the only one with a real execution path. Consider making `hoa-social-media` the coordinator that dispatches to platform-specific agents.

### Cluster 3: HOA Outreach
- `hoa-outreach-drafter` / `hoa-email-campaigns`

**Verdict:** Boundary unclear. Recommend: `hoa-outreach-drafter` = cold outreach to new leads; `hoa-email-campaigns` = nurture sequences for existing contacts. Document this split.

### Cluster 4: Owen + Data Rehab
- 6 agents total across two brands
- No evidence of active runs or revenue generation

**Verdict:** These are experiments. Keep SOUL.md files. Do not schedule. Review at next quarterly planning.

---

## 6. Security and Permission Issues

| Issue | Severity | Current State | Recommendation |
|-------|----------|---------------|----------------|
| Tool policy bypass | HIGH | `openclaw-tool-policy.json` restricts OpenClaw agents but special handlers run native Node.js with full DB write access | Add per-handler permission declarations |
| LLM output → DB insert | HIGH | `jake_lead_scout` parses LLM JSON and inserts directly into `cfo_leads` | Add Zod/JSON schema validation before insert |
| Email content from LLM | HIGH | Outreach agents generate email body from GPT-4o; no content filter | Add banned-phrase list; flag emails mentioning competitors by name |
| Facebook API automation | MED | `hoa-facebook-poster` can post without human review | Ensure confirmation gate is enforced (it is via runs.js) |
| Credentials table | MED | `credentials` table stores AES-256 encrypted blobs — good | Verify encryption key is not in `.env.local` (check .gitignore) |
| Admin password in scripts | LOW | `scripts/reset-admin-password.js` exists | Ensure it requires existing auth to run |
| Auth rate limiter | LOW | In-memory, resets on restart (by design) | Acceptable for single-user system |
| `.env.local` in repo | CRITICAL | `.env.local` (8KB) exists in working directory | Verify it's in `.gitignore`; never commit |

---

## 7. Missing Eval Infrastructure

| What's Missing | Impact | Recommended Fix |
|----------------|--------|-----------------|
| **LLM output quality scoring** | No way to detect when agent output degrades | Add per-agent output schema + quality score (JSON parse success rate, lead count per run, email readability score) |
| **A/B testing for outreach** | No way to know which email angles convert better | Tag outreach with `angle_type`; track reply rate per angle via Brain Layer 3 |
| **Agent success_rate computation** | Column exists in DB but never updated | Compute `success_rate = completed / total_runs` on each run completion |
| **Schedule reliability tracking** | No visibility into missed schedules | Log expected vs actual run times; alert if schedule drift > 5 minutes |
| **Brain KB retrieval effectiveness** | KB entries have `usage_count` but no correlation to outcomes | Track whether KB-informed outreach converts better than non-KB outreach |
| **Cost-per-lead tracking** | Total cost tracked but not attributed to individual leads | Add `acquisition_cost_usd` column to `cfo_leads`; sum all run costs that touched that lead |
| **Stale lead detection** | Pipeline state tracker flags stalls but no auto-archive | Auto-archive leads with no activity for 30 days |
| **Agent uptime/availability** | No health check beyond Playwright pool | Add `/api/health/agents` endpoint returning per-agent last-run recency |

---

## 8. Recommended Incremental Improvement Plan

### Week 1 — Safety and Observability (COMPLETED 2026-03-14)
- [x] Add JSON schema validation to `jake_lead_scout` DB inserts
- [x] Compute `success_rate` on every run completion
- [x] Add daily SQLite backup cron (7-day retention)
- [x] Verify `.env.local` is in `.gitignore`
- [x] Add daily cost cap ($5/day) in runs.js confirm route
- [x] Add banned-phrase list for outreach content
- [x] Add per-agent Discord rate limit (30 messages/hour)
- [x] Log warnings on parseMessageParams failure

### Week 2 — Quality Gates (COMPLETED 2026-03-14)
- [x] Add Ralph QA review step for outreach agent drafts
- [x] Add output schema validation for all LLM agents

### Week 3 — Eval Foundation (COMPLETED 2026-03-14)
- [x] Implement agent health scorecard (success rate, avg duration, cost per run)
- [x] Tag outreach emails with `angle_type` for A/B tracking
- [x] Add `acquisition_cost_usd` to `cfo_leads`
- [x] Add schedule drift alerting

### Week 4 — Cleanup and Documentation (COMPLETED 2026-03-14)
- [x] Audit STATUS.md — mark scaffolded agents as "scaffolded" not "active"
- [x] Document HOA social cluster boundaries
- [x] Document Jake vs CFO agent relationship
- [x] Review Owen and Data Rehab agent activity; decide keep/archive
- [x] Update `coordination_protocol.md` to reflect Pipeline Director dispatch pattern

### Ongoing
- [ ] Monthly Brain KB quality review (are KB entries actually improving outreach?)
- [ ] Quarterly agent portfolio review (which agents ran 0 times last quarter?)
- [ ] Weekly cost trend check (is GPT-4o spend trending up?)

---

## 9. Changes That Should NOT Be Made Yet

| Proposed Change | Why Not |
|-----------------|---------|
| Merge Jake + CFO agents into one | Brand separation is intentional; shared DB already handles dedup |
| Delete Owen / Data Rehab agents | They're experiments with SOUL.md invested; zero cost when idle |
| Replace OpenClaw with direct API calls | OpenClaw provides session management, tool policy, and audit trail |
| Migrate from SQLite to PostgreSQL | SQLite handles current load fine; migration risk outweighs benefit |
| Add more LLM agents to fill VACANT roles | Fill governance gaps first; more agents without eval = more risk |
| Rewrite special handlers as microservices | Monolith is fine at this scale; extraction adds complexity for no gain |
| Add multi-user auth | Single-user system works; multi-user adds security surface area |
| Automate email sending (remove human approval) | Steve's confirmation gate is the most important safety control in the system |
| Restructure the 5-department org chart | The org chart maps cleanly to reality; restructuring creates confusion |

---

*End of audit. This system is operationally sound. The biggest risks are in the gaps between what's documented and what's enforced. Fill those gaps incrementally. Do not restructure what's working.*
