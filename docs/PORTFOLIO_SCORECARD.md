# Portfolio Evaluation & Scorecard System
**Date:** 2026-03-14
**Scope:** All 67 agents — 34 active, 12 SOUL-only, 2 scaffolded, 19 frozen

---

## 1. Portfolio Scorecard Framework

### The Five Dimensions

Every agent is scored 0-100 on five dimensions. The composite **Portfolio Score** determines whether it continues, gets hardened, gets frozen, or gets deprecated.

| Dimension | Weight | What It Measures | Data Source |
|-----------|--------|-----------------|-------------|
| **Usefulness** | 30% | Does this agent produce output that advances the pipeline toward revenue? | Leads generated, drafts approved, content published, pipeline actions dispatched |
| **Reliability** | 25% | Does it run without failing? | `success_rate` from agents table, `failures_7d` from health endpoint |
| **Correction Burden** | 20% | How much human time does its output require before it's usable? | Ralph QA pass rate, content guard flag rate, Steve override frequency |
| **Risk** | 15% | What's the worst thing that happens if this agent malfunctions? | Reviewer tier (1-4), external-facing flag, LLM vs deterministic |
| **Cost Efficiency** | 10% | What does it cost relative to what it produces? | `cost_7d`, cost per lead, cost per approved draft |

### Composite Formula

```
Portfolio Score = (Usefulness × 0.30) + (Reliability × 0.25) + ((100 - CorrectionBurden) × 0.20) + ((100 - Risk) × 0.15) + (CostEfficiency × 0.10)
```

Higher = better. Range 0-100.

### Decision Thresholds

| Score | Action | Review Cadence |
|-------|--------|---------------|
| **80-100** | CONTINUE — agent is healthy and productive | Monthly glance |
| **60-79** | HARDEN — agent works but has governance or quality gaps | Weekly check |
| **40-59** | FREEZE — agent costs more attention than it's worth right now | Quarterly review |
| **0-39** | DEPRECATE — agent provides no value and should be archived | Remove from seed script |

---

## 2. Top 10 Agents to Benchmark First

These are the agents with the highest combination of revenue impact and data availability. Benchmark these first because their metrics directly measure pipeline health.

| Rank | Agent | Why Benchmark First | Primary Metric |
|------|-------|-------------------|----------------|
| 1 | `jake-lead-scout` | Entry point to entire revenue pipeline. Every downstream agent depends on lead quality. | Leads per run, avg qualification score, validation failure rate |
| 2 | `jake-outreach-agent` | Produces the emails that generate revenue. Ralph QA scores are trackable now. | Ralph QA pass rate, angle_type distribution, reply rate (when replies come) |
| 3 | `jake-contact-enricher` | Bottleneck between discovery and outreach. Hit rate directly determines pipeline throughput. | Hit rate (%), method distribution, failure reasons |
| 4 | `pipeline-director` | Autonomous decision-maker. If its dispatch logic is wrong, entire pipeline stalls. | Actions per cycle, stall count, dispatch decision audit trail |
| 5 | `jake-construction-discovery` | Volume top-of-funnel. Feeds the entire Jake pipeline. | Companies per run, dedup rate, region coverage |
| 6 | `hoa-outreach-drafter` | HOA revenue path. Template-based but high-volume. | QA score, drafts per run, scenario distribution |
| 7 | `jake-follow-up-agent` | Persistence layer — turns cold contacts into warm. | Follow-up angle distribution, word count compliance, QA pass rate |
| 8 | `brain-distillation` | Institutional memory. Bad KB entries degrade all future LLM runs. | KB entries inserted, pending review count, usage_count on KB entries |
| 9 | `urgency-scorer` | Prioritization engine. If scoring is wrong, outreach goes to wrong leads. | Score distribution, correlation between score and reply rate (once data exists) |
| 10 | `jake-content-engine` | Brand voice. Published content represents Steve publicly. | Ralph QA score, self-eval scores, word count, pillar distribution |

---

## 3. Evaluation Metrics by Cluster

### Cluster A: Lead Pipeline (Jake/CFO) — 11 agents

| Agent | Success Metric | Failure Metric | Current Data |
|-------|---------------|----------------|--------------|
| `jake-lead-scout` | >=5 leads/run, avg score >=50, failure rate <20% | <3 leads/run, failure rate >30%, avg score <30 | audit_log `lead_scout_quality` |
| `cfo-lead-scout` | >=3 leads/run, avg score >=40 | 0 leads/run | audit_log `lead_scout_quality` |
| `jake-construction-discovery` | >=20 new companies/run | 0 new companies | Brain `market_insight` obs |
| `jake-contact-enricher` | Hit rate >=20% | Hit rate <15% | audit_log `enricher_quality` |
| `jake-outreach-agent` | Ralph QA pass rate >=80%, reply rate >=5% (future) | QA pass rate <50%, flagged by content guard | `cfo_outreach_sequences.qa_score` |
| `cfo-outreach-agent` | Same as jake-outreach | Same | Same table, `source_agent='cfo'` |
| `jake-follow-up-agent` | QA pass rate >=70%, angle distribution not all "general" | QA fail rate >50%, word count >200 (SOUL says <100) | `qa_score`, `angle_type` |
| `jake-reply-classifier` | Classification accuracy >=95% (validate on first 20 replies) | Misclassification rate >10% | Brain Layer 2 feedback |
| `jake-meeting-booker` | QA pass rate >=90%, Calendly link present in 100% of drafts | Missing Calendly link, QA fail | `qa_score`, output validator |
| `jake-crm-sync` | Synced within 24h of status change | CSV fallback used repeatedly (Sheets broken) | `csv_fallback_used` in result_data |
| `jake-case-study-builder` | N/A (SOUL only) | N/A | — |

### Cluster B: HOA Pipeline — 10 agents

| Agent | Success Metric | Failure Metric |
|-------|---------------|----------------|
| `hoa-discovery` | >=20 new communities/run | 0 new communities, Playwright circuit breaker trips |
| `hoa-contact-finder` | >=5 new contacts/run, confidence avg >=60 | 0 contacts, repeated scraping failures |
| `hoa-contact-enricher` | Hit rate >=50% | Hit rate <30% |
| `hoa-outreach-drafter` | QA score >=70 on all 3-email sequences | Content guard flags, QA fails |
| `hoa-minutes-monitor` | >=1 tier upgrade per run | 0 signals detected across 20+ scans |
| `google-reviews-monitor` | Tier upgrades detected | 0 upgrades across 10+ scans |

### Cluster E: Content Production — 3 active agents

| Agent | Success Metric | Failure Metric |
|-------|---------------|----------------|
| `jake-content-engine` | Ralph QA >=70, self-eval scores >=8/10, word count 800-1500 | QA <50, no self-eval produced, word count <200 |
| `cfo-content-engine` | Same + trust_envelope present | Same + missing trust_envelope |
| `hoa-content-writer` | QA >=70, HOA-relevant keywords present | QA <50, generic non-HOA content |

### Cluster G: Operations — 10 agents

| Agent | Success Metric | Failure Metric |
|-------|---------------|----------------|
| `pipeline-director` | 5-20 actions/cycle, 0 stalled leads >48h | >15 actions (runloop), stalled leads growing |
| `pipeline-state-tracker` | Stage changes detected, stalls flagged <24h | Stages not updating, stalls missed |
| `urgency-scorer` | Score distribution has clear separation (not all clustered at 50) | All scores within 10-point range (no discrimination) |
| `brain-distillation` | >=1 KB entry/week during active outreach | 0 entries for 30+ days |
| `morning-digest` | Posted by 7:05AM every weekday | Missed posts, schedule drift >5min |
| `daily-debrief` | Posted by 6:05PM every weekday | Same |

### Cluster H+I: Opportunity + Revenue Signal — 9 agents

| Agent | Success Metric | Failure Metric |
|-------|---------------|----------------|
| `opportunity-scanner` | >=10 new signals/week | 0 signals for 7 days, all scanners erroring |
| `opportunity-scorer` | >=1 cluster scored >=75/week | 0 clusters qualified for 30 days |
| `software-factory` | Prototype passes code review, no dangerous patterns | Code review flags on every build |
| `rse-signal-scorer` | >=1 accepted signal/week | All signals rejected for 14 days |

### Frozen Agents (19) — No Evaluation Needed

Score: N/A. $0 cost. Review at Q2 2026 for activate-or-archive decision.

---

## 4. Logging / Reporting Structure

### Data Already Available (from hardening work)

| Metric Source | What It Contains | Query Location |
|---------------|-----------------|----------------|
| `agents` table | `success_rate`, `total_runs`, `last_run_at` | Direct SQL |
| `runs` table | Per-run status, duration, cost, tokens | Direct SQL |
| `audit_log` — `output_validation` | Per-agent output schema score, error/warning counts | `WHERE action = 'output_validation'` |
| `audit_log` — `lead_scout_quality` | Leads per run, avg score, validation failure rate | `WHERE action = 'lead_scout_quality'` |
| `audit_log` — `enricher_quality` | Hit rate, method distribution | `WHERE action = 'enricher_quality'` |
| `audit_log` — `pipeline_dispatch` | Actions dispatched, stall count | `WHERE action = 'pipeline_dispatch'` |
| `audit_log` — `discovery_quality` | New communities per run | `WHERE action = 'discovery_quality'` |
| `audit_log` — `contact_finder_quality` | Contacts found, new contacts | `WHERE action = 'contact_finder_quality'` |
| `audit_log` — `kb_entry_pending_review` | New KB entries awaiting Steve review | `WHERE action = 'kb_entry_pending_review'` |
| `audit_log` — `code_review_flag` | Dangerous patterns in generated code | `WHERE action = 'code_review_flag'` |
| `audit_log` — `soul_modified` | SOUL.md write events | `WHERE action = 'soul_modified'` |
| `cfo_outreach_sequences` | `qa_score`, `qa_status`, `angle_type`, `source_agent` | Direct SQL |
| `cfo_content_pieces` | `qa_score`, `qa_status`, `source_agent` | Direct SQL |
| `/api/health/agents` | Per-agent health score, 7-day metrics, QA trending | HTTP endpoint |
| `/api/health/agents/summary` | Fleet-wide fail rate, cost, worst agents, stale agents | HTTP endpoint |
| `/api/qa/stats` | QA queue: pending, passed, failed, avg score | HTTP endpoint |

### What Needs to Be Built: Portfolio Scorecard Endpoint

A single API endpoint that computes the 5-dimension score for every active agent and returns a ranked portfolio view.

---

## 5. Weekly Portfolio Review Process

### When
**Every Friday at end of day.** Steve reviews the scorecard while the daily debrief is fresh.

### What Steve Sees (1 page)

```
PORTFOLIO SCORECARD — Week of 2026-03-10

Fleet: 34 active | 12 ready | 19 frozen | $X.XX spent this week

TOP PERFORMERS (Score >= 80)
  jake-reply-classifier    95  Tier 1  0 failures  $0.00
  urgency-scorer           92  Tier 1  0 failures  $0.00
  pipeline-state-tracker   90  Tier 1  0 failures  $0.00

WATCH LIST (Score 60-79)
  jake-contact-enricher    68  Tier 2  Hit rate 19% (↓ from 24%)
  jake-content-engine      72  Tier 3  QA avg 74 (2 failed this week)

ACTION REQUIRED (Score < 60)
  [none this week]

FROZEN (19 agents — $0 cost — next review: Q2 2026)

KB ENTRIES PENDING REVIEW: 3
  1. "Tampa Bay GCs respond to AR pain angle" — from jake-outreach-agent
  2. "Single-word company names fail enrichment" — from jake-contact-enricher
  3. "HOT tier leads reply 3x faster" — from brain-distillation

CODE REVIEW FLAGS: 0

COST: $X.XX this week ($X.XX daily avg) — Cap: $5/day ($35/week)
```

### Steve's Actions
1. Glance at top performers — no action needed
2. Check watch list — is the trend down? If so, investigate
3. Action required — decide: fix, freeze, or deprioritize
4. Review 3 KB entries — approve or archive each one
5. Scan code review flags — 0 is good, >0 needs a look
6. Check cost — is it trending up?

**Total time: 5-10 minutes per week.**

---

## 6. Stop / Go / Deprecate Criteria

### GO (Keep Running — Score >= 80)

| Condition | All must be true |
|-----------|-----------------|
| success_rate >= 80% | Agent completes >80% of runs |
| failures_7d <= 1 | At most 1 failure per week |
| Produces output used downstream | Leads enriched, drafts approved, actions dispatched |
| Cost per unit of value is declining or stable | Not burning more per lead/draft/action |
| No content guard HIGH flags in 30 days | Clean output |

### HARDEN (Fix and Monitor — Score 60-79)

| Condition | Any one triggers |
|-----------|-----------------|
| success_rate 50-80% | Needs investigation |
| failures_7d 2-5 | Pattern forming |
| QA pass rate <70% for outreach/content agents | Drafts are low quality |
| Hit rate declining for enrichers | Scraping may be blocked |
| Output schema warnings increasing | LLM output structure degrading |
| Cost per unit increasing >20% week-over-week | Efficiency dropping |

**Action:** Review SOUL.md, check service file for bugs, check external dependencies (Playwright, APIs). Fix within 1 week or freeze.

### FREEZE (Pause — Score 40-59)

| Condition | Any one triggers |
|-----------|-----------------|
| success_rate <50% | More failures than successes |
| failures_7d >5 | Consistently broken |
| Zero useful output for 14+ days | Running but producing nothing |
| Content guard HIGH flags recurring | Consistently unsafe output |
| Review burden exceeds value | Steve spending more time fixing than the agent saves |
| Cost per unit >2x the next-best alternative | Cheaper to do manually |

**Action:** Remove from schedules. Keep in agents table. Keep SOUL.md. Flag for quarterly review. Reactivate only after root cause is fixed.

### DEPRECATE (Archive — Score <40 for 2 consecutive quarters)

| Condition | All must be true |
|-----------|-----------------|
| Frozen for 2+ quarters | 6 months of inactivity |
| No pipeline dependency | No active agent reads its output |
| Steve confirms archive | Human decision required |
| SOUL.md moved to `openclaw-skills/_archived/` | Preserved but not active |

**Action:** Remove from `seed-all-agents.js`. Move SOUL.md to `_archived/`. Delete from agents table on next seed.

**Current candidates for deprecation: NONE.** All frozen agents have been frozen <1 quarter. First possible deprecation review: Q3 2026.

---

## Implementation: Portfolio Scorecard Endpoint + Weekly Report Handler

The scorecard needs a single API endpoint and a scheduled handler that generates the weekly report.
