# Optimization Priority Matrix
**Source of truth:** `docs/RATIONALIZATION_PLAN.md`
**Date:** 2026-03-14
**Scope:** All 48 active and ready agents (19 frozen agents excluded)

---

## Scoring Methodology

Each agent scored 1-5 on seven dimensions:

| Dimension | 1 (Low) | 5 (High) |
|-----------|---------|----------|
| **Revenue Impact** | No pipeline connection | Directly generates or converts leads into money |
| **Frequency of Use** | Ran 0 times / on-demand only | Scheduled daily or fires on every pipeline event |
| **External Risk** | Internal only, no side effects | Touches external APIs, sends emails, posts publicly |
| **Review Burden** | Deterministic, $0, self-validating | LLM output requires human review before action |
| **Failure Cost** | Silent failure, no downstream impact | Failure breaks pipeline, loses leads, or damages brand |
| **Maturity** | SOUL only / scaffolded / no tests | Handler + service + validation + QA gate + Brain integration |
| **Optimization Priority** | Composite: `(Revenue + External Risk + Failure Cost) - Maturity` — higher = needs more attention |

---

## Full Scoring Table

### Cluster A: Lead Pipeline (Jake/CFO)

| Agent | Rev | Freq | ExtRisk | Review | FailCost | Maturity | OptPri | Action |
|-------|-----|------|---------|--------|----------|----------|--------|--------|
| `jake-lead-scout` | 5 | 3 | 3 | 4 | 4 | 4 | **8** | HARDEN NOW |
| `jake-outreach-agent` | 5 | 3 | 5 | 5 | 5 | 4 | **11** | HARDEN NOW |
| `cfo-outreach-agent` | 5 | 3 | 5 | 5 | 5 | 4 | **11** | HARDEN NOW |
| `jake-contact-enricher` | 5 | 3 | 3 | 2 | 3 | 4 | **7** | MONITOR |
| `jake-construction-discovery` | 4 | 3 | 3 | 1 | 2 | 5 | **4** | MONITOR |
| `cfo-lead-scout` | 4 | 2 | 2 | 3 | 3 | 4 | **5** | MONITOR |
| `jake-follow-up-agent` | 4 | 3 | 4 | 4 | 3 | 3 | **8** | HARDEN NOW |
| `jake-reply-classifier` | 5 | 4 | 1 | 1 | 4 | 5 | **5** | LEAVE ALONE |
| `jake-meeting-booker` | 5 | 2 | 4 | 4 | 3 | 3 | **9** | MONITOR |
| `jake-crm-sync` | 3 | 4 | 3 | 1 | 3 | 4 | **5** | LEAVE ALONE |
| `jake-case-study-builder` | 3 | 1 | 2 | 3 | 1 | 1 | **5** | BUILD LATER |

### Cluster B: HOA Pipeline

| Agent | Rev | Freq | ExtRisk | Review | FailCost | Maturity | OptPri | Action |
|-------|-----|------|---------|--------|----------|----------|--------|--------|
| `hoa-outreach-drafter` | 5 | 3 | 4 | 4 | 4 | 3 | **10** | HARDEN NOW |
| `hoa-discovery` | 4 | 2 | 3 | 1 | 2 | 4 | **5** | MONITOR |
| `hoa-contact-finder` | 4 | 2 | 3 | 1 | 2 | 4 | **5** | MONITOR |
| `hoa-contact-enricher` | 4 | 2 | 3 | 2 | 3 | 4 | **6** | MONITOR |
| `hoa-minutes-monitor` | 3 | 2 | 3 | 1 | 2 | 4 | **4** | LEAVE ALONE |
| `google-reviews-monitor` | 3 | 2 | 3 | 1 | 2 | 4 | **4** | LEAVE ALONE |
| `hoa-special-assessment-monitor` | 3 | 1 | 1 | 1 | 1 | 1 | **4** | BUILD LATER |
| `hoa-email-campaigns` | 3 | 1 | 3 | 3 | 2 | 1 | **7** | BUILD LATER |
| `hoa-cms-publisher` | 2 | 1 | 3 | 2 | 2 | 1 | **6** | BUILD LATER |
| `hoa-website-publisher` | 2 | 1 | 2 | 2 | 1 | 1 | **4** | BUILD LATER |

### Cluster C: HOA Social

| Agent | Rev | Freq | ExtRisk | Review | FailCost | Maturity | OptPri | Action |
|-------|-----|------|---------|--------|----------|----------|--------|--------|
| `hoa-facebook-poster` | 3 | 4 | 5 | 3 | 4 | 3 | **9** | MONITOR |
| `hoa-networker` | 2 | 1 | 3 | 3 | 2 | 1 | **6** | BUILD LATER |

### Cluster D: Management Research

| Agent | Rev | Freq | ExtRisk | Review | FailCost | Maturity | OptPri | Action |
|-------|-----|------|---------|--------|----------|----------|--------|--------|
| `mgmt-portfolio-scraper` | 3 | 2 | 3 | 1 | 2 | 4 | **4** | LEAVE ALONE |
| `mgmt-portfolio-mapper` | 3 | 2 | 3 | 1 | 2 | 4 | **4** | LEAVE ALONE |
| `mgmt-contact-puller` | 3 | 2 | 3 | 1 | 2 | 4 | **4** | LEAVE ALONE |
| `mgmt-review-scanner` | 3 | 2 | 3 | 1 | 2 | 4 | **4** | LEAVE ALONE |
| `mgmt-cai-scraper` | 3 | 2 | 3 | 1 | 2 | 4 | **4** | LEAVE ALONE |

### Cluster E: Content Production

| Agent | Rev | Freq | ExtRisk | Review | FailCost | Maturity | OptPri | Action |
|-------|-----|------|---------|--------|----------|----------|--------|--------|
| `jake-content-engine` | 4 | 3 | 3 | 4 | 3 | 4 | **6** | MONITOR |
| `cfo-content-engine` | 4 | 3 | 3 | 4 | 3 | 4 | **6** | MONITOR |
| `hoa-content-writer` | 3 | 2 | 3 | 4 | 2 | 4 | **4** | MONITOR |
| `content-repurposer` | 2 | 1 | 2 | 3 | 1 | 1 | **4** | BUILD LATER |

### Cluster F: Signal & Intelligence

| Agent | Rev | Freq | ExtRisk | Review | FailCost | Maturity | OptPri | Action |
|-------|-----|------|---------|--------|----------|----------|--------|--------|
| `jake-pain-signal-monitor` | 4 | 1 | 2 | 2 | 2 | 1 | **7** | BUILD LATER |
| `competitor-intel` | 3 | 1 | 2 | 2 | 1 | 1 | **5** | BUILD LATER |
| `jake-hiring-signal-agent` | 3 | 1 | 2 | 2 | 1 | 1 | **5** | BUILD LATER |
| `jake-permit-scanner` | 3 | 1 | 2 | 1 | 1 | 2 | **4** | BUILD LATER |
| `bid-result-scraper` | 3 | 1 | 2 | 1 | 1 | 2 | **4** | BUILD LATER |

### Cluster G: Operations & Orchestration

| Agent | Rev | Freq | ExtRisk | Review | FailCost | Maturity | OptPri | Action |
|-------|-----|------|---------|--------|----------|----------|--------|--------|
| `pipeline-director` | 5 | 5 | 1 | 1 | 5 | 5 | **6** | MONITOR |
| `pipeline-state-tracker` | 4 | 5 | 1 | 1 | 4 | 5 | **4** | LEAVE ALONE |
| `urgency-scorer` | 4 | 3 | 1 | 1 | 3 | 5 | **3** | LEAVE ALONE |
| `tenacity-cadence-engine` | 4 | 4 | 1 | 1 | 3 | 5 | **3** | LEAVE ALONE |
| `daily-debrief` | 3 | 5 | 2 | 2 | 2 | 4 | **3** | LEAVE ALONE |
| `morning-digest` | 3 | 5 | 2 | 1 | 2 | 5 | **2** | LEAVE ALONE |
| `brain-distillation` | 3 | 5 | 1 | 1 | 3 | 4 | **3** | LEAVE ALONE |
| `idle-training` | 1 | 3 | 1 | 2 | 2 | 3 | **1** | LEAVE ALONE |
| `ralph-qa` | 4 | 5 | 1 | 1 | 3 | 4 | **4** | LEAVE ALONE |
| `main` (Todd) | 3 | 5 | 1 | 2 | 3 | 4 | **3** | LEAVE ALONE |

### Cluster H: Opportunity Engine

| Agent | Rev | Freq | ExtRisk | Review | FailCost | Maturity | OptPri | Action |
|-------|-----|------|---------|--------|----------|----------|--------|--------|
| `software-factory` | 2 | 1 | 2 | 4 | 3 | 3 | **4** | MONITOR |
| `opportunity-scanner` | 2 | 3 | 2 | 1 | 2 | 4 | **2** | LEAVE ALONE |
| `opportunity-scorer` | 2 | 2 | 1 | 2 | 2 | 4 | **1** | LEAVE ALONE |
| `traction-monitor` | 2 | 4 | 2 | 1 | 2 | 4 | **2** | LEAVE ALONE |

### Cluster I: Revenue Signal Engine

| Agent | Rev | Freq | ExtRisk | Review | FailCost | Maturity | OptPri | Action |
|-------|-----|------|---------|--------|----------|----------|--------|--------|
| `rse-channel-monitor` | 2 | 3 | 2 | 1 | 1 | 4 | **1** | LEAVE ALONE |
| `rse-transcript-extractor` | 2 | 3 | 2 | 1 | 1 | 4 | **1** | LEAVE ALONE |
| `rse-signal-scorer` | 2 | 2 | 1 | 2 | 2 | 4 | **1** | LEAVE ALONE |
| `rse-expert-librarian` | 1 | 2 | 1 | 1 | 1 | 4 | **-1** | LEAVE ALONE |
| `rse-feedback-loop` | 1 | 2 | 1 | 1 | 1 | 4 | **-1** | LEAVE ALONE |
| `rse-build-spec-generator` | 2 | 1 | 2 | 3 | 1 | 1 | **4** | BUILD LATER |
| `rse-campaign-builder` | 3 | 1 | 3 | 3 | 2 | 1 | **7** | BUILD LATER |

### Cluster J: Social Distribution (non-frozen)

| Agent | Rev | Freq | ExtRisk | Review | FailCost | Maturity | OptPri | Action |
|-------|-----|------|---------|--------|----------|----------|--------|--------|
| `linkedin-direct-poster` | 3 | 1 | 4 | 3 | 3 | 1 | **9** | BUILD LATER |

### Cluster N: Analytics & Proof (SOUL only)

| Agent | Rev | Freq | ExtRisk | Review | FailCost | Maturity | OptPri | Action |
|-------|-----|------|---------|--------|----------|----------|--------|--------|
| `jake-analytics-monitor` | 2 | 1 | 1 | 2 | 1 | 1 | **3** | BUILD LATER |
| `cfo-analytics-monitor` | 2 | 1 | 1 | 2 | 1 | 1 | **3** | BUILD LATER |
| `jake-offer-proof-builder` | 3 | 1 | 2 | 3 | 2 | 1 | **6** | BUILD LATER |
| `cfo-offer-proof-builder` | 3 | 1 | 2 | 3 | 2 | 1 | **6** | BUILD LATER |
| `jake-pilot-deliverer` | 3 | 1 | 2 | 3 | 2 | 1 | **6** | BUILD LATER |
| `cfo-pilot-deliverer` | 3 | 1 | 2 | 3 | 2 | 1 | **6** | BUILD LATER |

---

## Action Group Summary

### 1. HARDEN NOW (OptPri >= 8, active execution, external-facing)

| Rank | Agent | OptPri | Why |
|------|-------|--------|-----|
| 1 | `jake-outreach-agent` | 11 | LLM generates emails sent to real humans. Highest external risk in the system. |
| 2 | `cfo-outreach-agent` | 11 | Same risk as jake-outreach, different brand voice. |
| 3 | `hoa-outreach-drafter` | 10 | HOA cold outreach — same external risk class, slightly lower frequency. |
| 4 | `jake-follow-up-agent` | 8 | LLM generates follow-up emails. No output schema validation before this audit. |
| 5 | `jake-lead-scout` | 8 | LLM output goes directly to DB. Validation added but no A/B tracking on lead quality yet. |

**What "harden" means for these 5:**
- Output schema validation: DONE (outputValidator.js)
- Content guard: DONE (contentGuard.js)
- Ralph QA auto-review: DONE (ralphQA.js)
- Lead validation: DONE (validateLead)
- **Remaining gaps:**
  - `jake-outreach-agent` / `cfo-outreach-agent`: Add outreach-specific output quality trending (track Ralph QA scores over time per agent, alert on degradation)
  - `hoa-outreach-drafter`: Wire Ralph QA into HOA outreach path (currently only in postProcessor for jake/cfo — HOA uses special handler directly)
  - `jake-follow-up-agent`: Add follow-up specific schema to outputValidator (currently validated but less strict than outreach)
  - `jake-lead-scout`: Add lead quality trending — track average qualification_score, validation failure rate, and leads-per-run over time

### 2. MONITOR ONLY (active, governance in place, watch for degradation)

| Agent | OptPri | Watch For |
|-------|--------|-----------|
| `hoa-facebook-poster` | 9 | Facebook API errors, content posted without review |
| `jake-meeting-booker` | 9 | Meeting emails missing Calendly link, wrong lead status |
| `jake-contact-enricher` | 7 | Email hit rate dropping below 20%, enrichment failures spiking |
| `hoa-contact-enricher` | 6 | Same as jake enricher |
| `jake-content-engine` | 6 | Ralph QA scores trending down, generic content |
| `cfo-content-engine` | 6 | Same |
| `pipeline-director` | 6 | Action count per cycle, budget cap hits, dispatch errors |
| `hoa-discovery` | 5 | New community discovery rate, Playwright failures |
| `hoa-contact-finder` | 5 | Contact pull rate, scraping blocks |
| `cfo-lead-scout` | 5 | Lead quality scores, dedup rate |
| `software-factory` | 4 | QA pass rate on prototypes, deploy failures |
| `hoa-content-writer` | 4 | Ralph QA scores |

### 3. LEAVE ALONE (stable, well-governed, deterministic, low risk)

| Agent | OptPri | Why Safe |
|-------|--------|----------|
| `jake-reply-classifier` | 5 | Deterministic regex, $0, Brain feedback integrated, cadence deactivation works |
| `jake-crm-sync` | 5 | CSV fallback, no LLM, no external comms |
| `pipeline-state-tracker` | 4 | Deterministic, $0, stall detection tested |
| `urgency-scorer` | 3 | Pure SQLite scoring, $0, dual-product |
| `tenacity-cadence-engine` | 3 | Deterministic touch scheduling, Brain v2 adjustments |
| `daily-debrief` | 3 | LLM but output is internal (Discord to Steve only) |
| `morning-digest` | 2 | Deterministic, $0, Discord embed |
| `brain-distillation` | 3 | Deterministic KB promotion, $0 |
| `ralph-qa` | 4 | Deterministic scoring, $0, the QA gate itself |
| `main` (Todd) | 3 | Chat router, no external actions |
| `idle-training` | 1 | Internal only, QA-gated skill promotion |
| `opportunity-scanner` | 2 | Multi-scanner, $0, internal signals |
| `opportunity-scorer` | 1 | ICE scoring, budget-capped |
| `traction-monitor` | 2 | Deterministic kill gate, Discord alerts |
| `rse-channel-monitor` | 1 | Internal discovery, $0 |
| `rse-transcript-extractor` | 1 | Internal extraction, $0 |
| `rse-signal-scorer` | 1 | Internal scoring |
| `rse-expert-librarian` | -1 | Internal only, low stakes |
| `rse-feedback-loop` | -1 | Internal trust scoring |
| All 5 `mgmt-*` agents | 4 | Deterministic scrapers, well-bounded, Playwright-pooled |

### 4. BUILD LATER (SOUL only or scaffolded — valuable but not urgent)

| Agent | OptPri | Build When |
|-------|--------|------------|
| `rse-campaign-builder` | 7 | When RSE has 10+ accepted signals ready for campaign |
| `jake-pain-signal-monitor` | 7 | When hiring-signal is proven as concept |
| `linkedin-direct-poster` | 9 | When LinkedIn API access is configured |
| `hoa-email-campaigns` | 7 | When 50+ NOT_NOW HOA contacts exist |
| `hoa-networker` | 6 | When community engagement becomes priority |
| `jake-offer-proof-builder` / `cfo-offer-proof-builder` | 6 | When first pilot is closing |
| `jake-pilot-deliverer` / `cfo-pilot-deliverer` | 6 | Same trigger as proof builder |
| `hoa-cms-publisher` | 6 | When HOA blog publishing cadence is established |
| `jake-case-study-builder` | 5 | When first pilot closes successfully |
| `competitor-intel` | 5 | When active outreach volume warrants competitive positioning |
| `jake-hiring-signal-agent` | 5 | Fold into pain-signal-monitor when building |
| `content-repurposer` | 4 | When content volume warrants derivative production |
| `hoa-special-assessment-monitor` | 4 | When HOA pipeline matures |
| `hoa-website-publisher` | 4 | When landing page updates become recurring |
| `jake-permit-scanner` | 4 | When county portal scraping is worth the Playwright investment |
| `bid-result-scraper` | 4 | When procurement portals are mapped |
| `rse-build-spec-generator` | 4 | When RSE pipeline needs spec generation |
| `jake-analytics-monitor` / `cfo-analytics-monitor` | 3 | When pipeline has 3+ months of data |

### 5. FREEZE (19 agents — excluded from matrix, documented in Rationalization Plan)

All Owen (5), Data Rehab (3), DC Intel (2), Polyclaw (1), executive personas (3), social-only (4), SMS (1).

---

## Top 5 Hardening Queue

| Priority | Agent | What Specifically To Do |
|----------|-------|------------------------|
| **H1** | `jake-outreach-agent` | Track Ralph QA scores per-agent over time. Alert if avg score drops below 60/100 over 7 days. Add outreach quality trend to `/api/health/agents/:id`. This agent's output goes to real humans — it's the single highest-consequence LLM call in the system. |
| **H2** | `cfo-outreach-agent` | Same hardening as H1. Same handler path, different voice. If jake-outreach degrades, cfo-outreach likely does too — monitor both with one alert. |
| **H3** | `hoa-outreach-drafter` | Wire Ralph QA auto-review into the HOA outreach special handler path (currently auto-QA only fires in postProcessor for LLM agents, but HOA uses a special handler that inserts directly). Add `qa_status='pending'` and call `ralphQA.reviewSingleOutreach()` after insert. |
| **H4** | `jake-follow-up-agent` | Tighten output schema in `outputValidator.js`: require `body_text` field, enforce word count 50-200 (follow-ups should be shorter than initial outreach), require `subject` field. Log validation failures to audit_log. |
| **H5** | `jake-lead-scout` | Add lead quality trending: compute 7-day rolling average of `qualification_score` for inserted leads, `validation_failure_rate`, and `leads_per_run`. Alert via Discord if leads_per_run drops below 3 (indicates market exhaustion or LLM degradation) or validation_failure_rate exceeds 30%. |

---

## Matrix Visual Summary

```
                        HIGH EXTERNAL RISK
                              |
        HARDEN NOW            |           MONITOR
   jake-outreach-agent        |      hoa-facebook-poster
   cfo-outreach-agent         |      jake-meeting-booker
   hoa-outreach-drafter       |      jake-contact-enricher
   jake-follow-up-agent       |      content engines (3)
   jake-lead-scout            |      pipeline-director
                              |
 ─────────────────────────────┼─────────────────────────────
                              |
        BUILD LATER           |         LEAVE ALONE
   linkedin-direct-poster     |      jake-reply-classifier
   pain-signal-monitor        |      urgency-scorer
   rse-campaign-builder       |      cadence engine
   hoa-email-campaigns        |      brain-distillation
   offer-proof-builders       |      all mgmt-* agents
   pilot-deliverers           |      all rse-* agents
                              |      morning-digest
                              |      daily-debrief
                LOW EXTERNAL RISK

   (FREEZE: 19 agents — off chart, $0, review Q2 2026)
```

---

*This matrix is a point-in-time snapshot. Re-score quarterly or after any agent's execution path changes. The health scorecard API (`/api/health/agents`) provides live data for the MONITOR group.*
