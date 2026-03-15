# Reviewer / Supervisor Overlay
**Date:** 2026-03-14
**Principle:** Not every output needs the same review. Risk determines the gate.

---

## 1. Review Gaps by Workflow

### Current Review Coverage (After Hardening)

| Workflow | Content Guard | Ralph QA | Human Approval | Audit Log |
|----------|:---:|:---:|:---:|:---:|
| jake-outreach-agent → draft | YES | YES (auto) | YES (Steve confirms send) | YES |
| cfo-outreach-agent → draft | YES | YES (auto) | YES (Steve confirms send) | YES |
| jake-follow-up-agent → draft | YES | YES (auto) | YES (Steve confirms send) | YES |
| jake-meeting-booker → draft | YES | YES (auto) | YES (Steve confirms send) | YES |
| hoa-outreach-drafter → draft | YES | YES (QA score) | YES (Steve reviews queue) | YES |
| jake-content-engine → draft | YES (via Ralph) | YES (auto) | YES (Steve approves publish) | — |
| cfo-content-engine → draft | YES (via Ralph) | YES (auto) | YES (Steve approves publish) | — |
| hoa-content-writer → draft | YES (via Ralph) | YES (auto) | YES (Steve approves publish) | — |
| github-publisher → live push | YES (blocks if flagged) | QA score logged | YES (/confirm gate) | — |
| hoa-facebook-poster → live post | SOUL rules only | — | YES (/confirm gate) | — |

### Gaps (No Review)

| Workflow | What It Produces | External? | Current Gate | Gap |
|----------|-----------------|-----------|-------------|-----|
| jake-lead-scout → DB insert | Lead records in cfo_leads | No | validateLead() + output schema | No review on lead QUALITY beyond schema — hallucinated but valid-looking leads pass |
| jake-construction-discovery → DB insert | Bulk lead records | No | Dedup by company name | No review at all — 50-150 leads inserted per run |
| jake-contact-enricher → DB update | Email/phone on existing leads | No | Email format validation | No review on enrichment ACCURACY — wrong email for right company passes |
| pipeline-director → dispatches runs | Queued runs for other agents | No | Budget cap, max 20 actions | No review on dispatch DECISIONS — wrong prioritization is invisible |
| brain-distillation → KB promotion | Permanent knowledge base entries | No | Score >=0.8 threshold | No review on KB CONTENT — bad episode with high score gets permanent KB entry |
| opportunity-scanner → signal ingestion | Signal records in opp_signals | No | Ollama classification | No review on signal RELEVANCE — classified signals never checked |
| software-factory → code files on disk | Prototype code in data/prototypes/ | No | Path validation only | No review on CODE QUALITY — LLM-generated code saved without inspection |
| idle-training → skill candidates | Training records in DB | No | QA gate exists but unclear enforcement | No review on SKILL VALIDITY — agents "learn" unchecked |

---

## 2. Risk-Tier Model

### Tier 1: Safe Internal — No Review Needed
Deterministic handlers with $0 cost, no LLM, no external side effects. Output is DB state computation.

| Agent | Output | Why Safe |
|-------|--------|----------|
| `urgency-scorer` | Score updates on existing leads | Pure math on existing data |
| `pipeline-state-tracker` | Stage recomputation | Pure state machine |
| `tenacity-cadence` | Next-touch scheduling | Pure calendar math |
| `jake-reply-classifier` | Status update on leads | Regex classification, Brain feedback |
| `morning-digest` | Discord embed (to Steve only) | Read-only stats, internal channel |
| `ralph-qa` | QA scores on existing drafts | The reviewer itself |
| `database-backup` | Backup file | Read + copy |
| `rse-channel-monitor` | Video discovery records | Read-only RSS parsing |
| `rse-feedback-loop` | Trust score updates | Self-correction loop |

**Gate: None.** These run, log, and complete. Audit log captures metrics.

### Tier 2: Review Recommended — Auto-QA Sufficient
LLM-generated internal content or scraping results. Not externally visible. Auto-review catches obvious problems.

| Agent | Output | Review | Escalation |
|-------|--------|--------|------------|
| `jake-lead-scout` | New leads in DB | Output schema + validateLead() | Discord alert if quality degrades |
| `cfo-lead-scout` | New leads in DB | Audit log trending | Discord alert if zero leads |
| `jake-construction-discovery` | Bulk leads in DB | Dedup + Brain observation | Discord alert if zero new |
| `jake-contact-enricher` | Email/phone updates | Hit rate trending | Discord alert if hit rate < 15% |
| `hoa-contact-enricher` | Email/phone updates | Hit rate trending | Discord alert if hit rate < 50% |
| `hoa-discovery` | Community records | Discovery rate trending | Audit log |
| `hoa-contact-finder` | Contact records | Confidence scoring | Audit log |
| `pipeline-director` | Dispatched actions | Dispatch audit trail + Brain obs | Discord if stalled > 48h |
| `brain-distillation` | KB promotions | Score threshold >=0.8 | **NEW: flag first-time KB entries for Steve review** |
| `opportunity-scanner` | Signal records | Ollama classification | Audit log |
| `opportunity-scorer` | Cluster scores | ICE scoring model | Audit log |
| `rse-signal-scorer` | Signal scores | Scoring model + Brain obs | Discord on high-score signals |
| `rse-transcript-extractor` | Transcript text | URL validation | — |
| `rse-expert-librarian` | Pattern extractions | Dedup | — |
| `idle-training` | Skill candidates | QA gate | — |
| All 5 `mgmt-*` | Research data | Playwright circuit breaker | — |

**Gate: Auto-QA + trending.** Human reviews weekly via health scorecard. Escalation only on degradation.

### Tier 3: Review Required — Ralph Must Pass Before Advancement
LLM-generated content that will eventually reach external humans. Must pass Ralph QA (score >=70) before Steve can approve.

| Agent | Output | Review Chain | Block If |
|-------|--------|-------------|----------|
| `jake-outreach-agent` | Email drafts | Content guard → Ralph QA → Steve approves | Ralph score < 70 OR content guard HIGH flag |
| `cfo-outreach-agent` | Email drafts | Content guard → Ralph QA → Steve approves | Same |
| `jake-follow-up-agent` | Follow-up drafts | Content guard → Ralph QA → Steve approves | Same |
| `jake-meeting-booker` | Meeting emails | Content guard → Ralph QA → Steve approves | Same |
| `hoa-outreach-drafter` | 3-email sequences | Content guard → QA score → Steve reviews | QA score < 70 OR content guard flag |
| `jake-content-engine` | Blog/LinkedIn | Ralph QA → Steve approves publish | Ralph score < 70 |
| `cfo-content-engine` | Blog/LinkedIn | Ralph QA → Steve approves publish | Ralph score < 70 |
| `hoa-content-writer` | HOA articles | Ralph QA → Steve approves publish | Ralph score < 70 |
| `software-factory` | Prototype code | Path validation → **NEW: Ralph code review** | Path escape OR review fails |
| `daily-debrief` | Day summary | — (Steve-facing but informational) | — |

**Gate: Content guard + Ralph QA auto-review.** Status = `flagged` if guard fails. Status = `draft` only if Ralph passes. Steve sees only drafts that survived both gates.

### Tier 4: Human Approval Mandatory — Steve Must Confirm
Outputs that reach the outside world. No automated path to execution.

| Agent | Output | Approval Path | Enforced By |
|-------|--------|--------------|-------------|
| `hoa-facebook-poster` | Facebook page post | `/confirm` gate in runs.js | run status must be 'pending' → Steve clicks confirm |
| `hoa-cms-publisher` | Blog push to GitHub/Netlify | Content guard blocks if flagged, `/confirm` gate | github_publisher handler |
| `jake-crm-sync` | Google Sheets push | Auto (to Steve's own sheet) | Acceptable — Steve owns the sheet |
| Email sending (SendGrid) | Actual emails to leads | Manual from content queue UI | No agent has direct SendGrid access |
| SMS (Twilio) | Text messages | FROZEN | No handler exists |
| LinkedIn/Twitter posts | Social posts | FROZEN | No handler exists |
| QA override | Mark failed draft as passed | `/api/qa/:id/override` requires auth | Auth middleware |
| Schedule changes | Cron modifications | API requires auth | Auth middleware |

**Gate: No automation path exists.** Steve must take a manual action (click confirm, press send, modify schedule).

---

## 3. Reviewer Checkpoints

### Where Ralph Reviews Now (Automated)

```
LLM Agent Output
    ↓
postProcessor.js / handler
    ↓
Content Guard (banned phrases, competitor mentions, spam)
    ↓ flag HIGH severity → status = 'flagged'
    ↓ pass → continue
Ralph QA (5-dimension scoring: subject, personalization, structure, safety, tone)
    ↓ score < 70 → qa_status = 'failed'
    ↓ score >= 70 → qa_status = 'passed'
    ↓
status = 'draft' (visible to Steve in Content Queue / Outreach Queue)
    ↓
Steve approves → status = 'approved'
    ↓
Steve sends (manual) → status = 'sent'
```

### Where Review Is Missing (New Checkpoints Needed)

| Checkpoint | Trigger | Reviewer | Action |
|-----------|---------|----------|--------|
| **KB Entry Review** | brain-distillation promotes episode to KB | Flag for Steve | New KB entries get `review_status = 'pending'` — Steve approves or archives in weekly review |
| **Software Factory Code Review** | Prototype files written to disk | Ralph code check | Count files, check for suspicious patterns (eval, exec, require('child_process')), flag if found |
| **Dispatch Sanity Check** | pipeline-director queues >10 actions in one cycle | Auto-flag | Log warning, Discord alert — possible runloop |
| **Enrichment Accuracy Spot-Check** | jake-contact-enricher enriches 20+ leads in a batch | Weekly sample | Pick 3 random enriched leads, verify email domain matches company website |

---

## 4. Escalation Triggers

| Trigger | Condition | Action | Channel |
|---------|-----------|--------|---------|
| Ralph QA fail rate >50% for an agent | 5+ drafts, >50% failed in 7 days | Pause that agent's scheduled runs | Discord alert + audit_log |
| Content guard HIGH flag | Any outreach/content with competitor mention or false claim | Block draft, set status='flagged' | Console log + qa_notes |
| Lead scout quality degradation | validation_failure_rate >30% OR leads_per_run <3 | Discord alert | Discord embed |
| Enricher hit rate collapse | jake-enricher <15% OR hoa-enricher <50% | Discord alert | Discord embed |
| Pipeline director runloop | >15 actions dispatched in single cycle | Discord warning | Audit log + Discord |
| Brain KB poisoning | KB entry referenced 5+ times but associated outreach has 0% reply rate | Flag KB entry for review | Nightly check in distillation |
| Software factory suspicious code | Generated file contains eval()/exec()/child_process | Block prototype, flag for Steve | Console log + Discord |
| Daily cost spike | Today's cost >2x yesterday's | Discord warning | Cost cap still enforced at $5/day |
| Agent consecutive failures | Same agent fails 3x in a row | Pause agent, notify Steve | Existing in coordination protocol |

---

## 5. Minimal Reviewer Architecture

### What Already Exists (Don't Rebuild)

```
Ralph QA Service (ralphQA.js)
    ├── reviewSingleOutreach(id)     — 5-dimension scoring
    ├── reviewOutreachBatch(limit)    — batch review
    ├── reviewSingleContent(id)      — content scoring
    ├── reviewContentBatch(limit)     — batch review
    └── getQAStats()                 — queue metrics

Content Guard (contentGuard.js)
    └── checkContent(body, subject)  — competitor/false-claim/spam/tone filter

Output Validator (outputValidator.js)
    └── validateAgentOutput(name, data, raw)  — per-agent schema checks

Lead Validator (runs.js)
    └── validateLead(lead)           — field validation before DB insert
```

### What Needs to Be Added (3 Small Extensions)

**A. KB Entry Review Flag** — flag new KB entries for Steve's weekly review instead of auto-promoting silently.

**B. Software Factory Code Review** — scan generated files for dangerous patterns before saving.

**C. Dispatch Sanity Check** — warn when pipeline-director queues an unusual number of actions.

These are the only gaps. Everything else is already gated.

---

## 6. File-Level Implementation Plan

### Step 1: KB Entry Review Flag (LOW RISK)
**File:** `server/services/collectiveBrain.js` (in the distillation function)
**Change:** When inserting new KB entries, set a `review_status = 'pending'` field. Add to weekly summary.

### Step 2: Software Factory Code Review (LOW RISK)
**File:** `server/services/softwareFactory.js`
**Change:** After generating files but before writing to disk, scan each file's content for dangerous patterns.

### Step 3: Dispatch Sanity Check (LOW RISK)
**File:** `server/routes/runs.js` (pipeline_director handler)
**Change:** After dispatch cycle, if actions >15, send Discord warning.
