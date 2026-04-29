# ClawOps Agent Org Chart
*Operating context for AI agents. Last updated: 2026-03-13.*

---

## Chain of Command

```
CEO: Steve Pilcher (Human — Final Authority on spend, send, pivot, legal)
  └── Chief of Staff: Todd (AI Orchestrator — routes tasks, monitors fleet health, surfaces priorities)
        │
        ├── RESEARCH DEPARTMENT
        │     ├── Trend Hunter              → rse-channel-monitor / rse-transcript-extractor (YouTube creator monitoring)
        │     ├── Market Analyzer           → rse-signal-scorer / rse-evaluator (scores + ranks business ideas)
        │     ├── Lead Discovery Agent      → jake-construction-discovery / hoa-discovery
        │     ├── Pain Signal Monitor       → jake-pain-signal-monitor
        │     └── Competitive Intel Agent   → competitor-intel
        │
        ├── REVENUE SIGNAL ENGINE (reports to Research + Engineering)
        │     ├── Channel Monitor           → rse-channel-monitor (5 AM daily — RSS scan)
        │     ├── Transcript Extractor      → rse-transcript-extractor (5:30 AM — yt-dlp)
        │     ├── Signal Scorer             → rse-signal-scorer (6 AM — GPT-4o-mini grades)
        │     ├── Build Spec Generator      → rse-build-spec-generator (7 AM M-F — GPT-4o specs)
        │     ├── Idea Evaluator            → rse-code-builder (7:30 AM M-F — ranks ideas 1-10)
        │     ├── Campaign Builder          → rse-campaign-builder (8 AM Tue/Thu — marketing drafts)
        │     ├── Expert Librarian          → rse-expert-librarian (2 AM — pattern extraction)
        │     └── Feedback Loop             → rse-feedback-loop (3 AM Sun — trust score updates)
        │
        ├── ENGINEERING DEPARTMENT
        │     └── Code Builder              → rse-code-builder (on-demand via Steve + Claude Code)
        │
        ├── MARKETING DEPARTMENT
        │     ├── Content Writer            → jake-content-engine / cfo-content-engine / hoa-content-writer
        │     ├── Lead Generator            → jake-lead-scout / cfo-lead-scout
        │     ├── Contact Enricher          → jake-contact-enricher / hoa-contact-enricher
        │     ├── Social Media Manager      → jake-social-scheduler / hoa-social-media / hoa-facebook-poster
        │     ├── Outreach Agent            → jake-outreach-agent / cfo-outreach-agent / hoa-outreach-drafter
        │     ├── Follow-Up Agent           → jake-follow-up-agent
        │     ├── Reply Classifier          → jake-reply-classifier
        │     ├── Meeting Booker            → jake-meeting-booker
        │     └── Content Repurposer        → content-repurposer
        │
        ├── FINANCE DEPARTMENT
        │     └── Opportunity Evaluator     → mgmt-review-scanner / urgency-scorer
        │
        └── OPERATIONS DEPARTMENT
              ├── Daily Debrief             → daily-debrief
              ├── Morning Digest            → morning-digest
              ├── Pipeline Director         → pipeline-director
              ├── Pipeline State Tracker    → pipeline-state-tracker
              ├── Tenacity Cadence Engine   → tenacity-cadence
              ├── Memory Manager            → brain-distillation
              └── CRM Sync                  → jake-crm-sync
```

### Considered-but-not-built roles

These roles appeared in earlier drafts as "VACANT — needs agent" placeholders
but remained vacant through 2026-Q1. Per Rule #3 (simplicity wins), they were
removed from the active chart on 2026-04-28. Build them only with a clear
brief and a measurable scorecard.

- **Tool Builder** (Engineering) — generic dev-tool authoring; superseded
  by Steve + Claude Code working directly in this repo.
- **Automation Engineer** (Engineering) — overlaps Charlie (Dream Team
  Engineering & Builder), pipeline-director, and tenacity-cadence-engine.
- **Pricing Analyzer** (Finance) — pricing decisions are Steve-owned and
  low-frequency; an agent here would mostly produce noise.
- **ROI Calculator** (Finance) — already covered by revenueTracker +
  /api/revenue/* + RevenueDashboard; no need for a separate LLM agent.
- **Workflow Optimizer** (Operations) — Todd's nightly cycle already
  scores performance and auto-pauses underperformers.

---

## Full Agent-to-Role Mapping

### Research Department

| Role | Mapped Agent(s) | Status |
|------|-----------------|--------|
| Trend Hunter (RSE) | `rse-channel-monitor`, `rse-transcript-extractor` | ACTIVE |
| Market Analyzer (RSE) | `rse-signal-scorer`, `rse-build-spec-generator` | ACTIVE |
| Lead Discovery Agent | `jake-construction-discovery`, `hoa-discovery` | ACTIVE |
| Pain Signal Monitor | `jake-pain-signal-monitor` | ACTIVE |
| Competitive Intel Agent | `competitor-intel` | ACTIVE |
| HOA Intel Monitor | `hoa-minutes-monitor`, `google-reviews-monitor` | ACTIVE |
| Mgmt Research Suite | `mgmt-portfolio-scraper`, `mgmt-portfolio-mapper`, `mgmt-contact-puller`, `mgmt-cai-scraper` | ACTIVE |

### Engineering Department

| Role | Mapped Agent(s) | Status |
|------|-----------------|--------|
| Code Builder (RSE) | `rse-code-builder` (build mode, on-demand) | ACTIVE |

### Marketing Department

| Role | Mapped Agent(s) | Status |
|------|-----------------|--------|
| Content Writer | `jake-content-engine`, `cfo-content-engine`, `hoa-content-writer` | ACTIVE |
| Lead Generator | `jake-lead-scout`, `cfo-lead-scout` | ACTIVE |
| Contact Enricher | `jake-contact-enricher`, `hoa-contact-enricher` | ACTIVE |
| Social Media Manager | `jake-social-scheduler`, `hoa-social-media`, `hoa-facebook-poster`, `jake-twitter-poster`, `linkedin-direct-poster` | ACTIVE |
| Outreach Agent | `jake-outreach-agent`, `cfo-outreach-agent`, `hoa-outreach-drafter` | ACTIVE |
| Follow-Up Agent | `jake-follow-up-agent` | ACTIVE |
| Reply Classifier | `jake-reply-classifier` | ACTIVE |
| Meeting Booker | `jake-meeting-booker` | ACTIVE |
| Content Repurposer | `content-repurposer` | ACTIVE |
| Case Study Builder | `jake-case-study-builder` | ACTIVE |
| Email Campaigns | `hoa-email-campaigns` | ACTIVE |
| Community Networker | `hoa-networker`, `hoa-social-engagement` | ACTIVE |

### Finance Department

| Role | Mapped Agent(s) | Status |
|------|-----------------|--------|
| Opportunity Evaluator | `mgmt-review-scanner`, `urgency-scorer` | ACTIVE |
| Lead Dossier Generator | `lead-dossier-generator` | ACTIVE |
| Idea Evaluator (RSE) | `rse-code-builder` (evaluate mode) | ACTIVE |
| ROI Reporting | `revenueTracker` service + `/api/revenue/*` (no LLM agent) | ACTIVE |

### Operations Department

| Role | Mapped Agent(s) | Status |
|------|-----------------|--------|
| Daily Debrief | `daily-debrief` | ACTIVE |
| Morning Digest | `morning-digest` | ACTIVE |
| Pipeline Director | `pipeline-director` | ACTIVE |
| Pipeline State Tracker | `pipeline-state-tracker` | ACTIVE |
| Tenacity Cadence Engine | `tenacity-cadence` | ACTIVE |
| Brain Distillation | `brain-distillation` | ACTIVE |
| CRM Sync | `jake-crm-sync` | ACTIVE |
| Permit Scanner | `jake-permit-scanner` | ACTIVE |
| Bid Scraper | `bid-result-scraper` | ACTIVE |
| Performance Optimizer | `dream-team-nightly` (scorecard + auto-pause) | ACTIVE |
| Schedule Drift / Zombie Reaper | `scheduleRunner` (cron-parser based) | ACTIVE |

---

## Reporting Cadence

| Department | Reports to Todd | Frequency | Escalates to Steve When |
|------------|----------------|-----------|-------------------------|
| Research | Pipeline stats, new markets found | Daily (morning digest) | >50 qualified prospects found in a new market |
| RSE (Research) | New videos found, signals scored, ideas ranked | Daily via Todd's briefing at 8:30 AM | Any idea scoring 7+/10; new high-trust source discovered |
| Engineering | Build specs approved, prototypes requested | On-demand (Steve picks from Ranked Ideas) | Any new automation that saves >2 hrs/week |
| Marketing | Lead counts, email sent, reply rates, pipeline value | Daily via `morning-digest` | INTERESTED reply received; pipeline value milestone hit |
| Finance | Urgency scores, opportunity flags, stalled leads | Weekly (Monday) | Any spend decision >$50; new revenue model identified |
| Operations | Run health, failed schedules, cost burn, brain stats | Daily via `daily-debrief` at 6PM | Failed runs >3 in a row; cost spike; schedule drift |

### What Always Escalates to Steve (Non-Negotiable)

1. **Spend decisions** — Any action with real-money cost outside pre-approved agent budgets
2. **Sending external communications** — Emails, SMS, or social posts not in approved draft queue
3. **Legal or compliance exposure** — Unsubscribe violations, scraping restrictions, data regulations
4. **Strategic pivot signals** — Market data suggesting a better opportunity than current roadmap
5. **INTERESTED reply from a lead** — A human said yes — Steve needs to close this, not an agent
6. **New paying customer opportunity** — Anyone willing to pay real money for anything

---

*This file is agent-readable operating context. Cross-reference `agent_roles.md` for per-role specs and `agent_responsibilities.md` for RACI boundaries.*
