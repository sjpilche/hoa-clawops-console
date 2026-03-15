# Top 5 Highest-ROI Agent Hardening
**Date:** 2026-03-14
**Scope:** The 5 agents with the highest gap between business impact and current governance

---

## 1. Top 5 Hardening Priorities

| Rank | Agent | Business Impact | Current Governance | Gap Size |
|------|-------|----------------|-------------------|----------|
| **1** | `jake-contact-enricher` | Bottleneck between discovery and outreach. 0 emails = 0 revenue. | 45-line SOUL, no thresholds, no non-goals, no failure handling | CRITICAL |
| **2** | `pipeline-director` | Autonomous dispatch for entire pipeline. Wrong decisions = wasted runs. | No SOUL.md exists. Zero documentation beyond inline code. | CRITICAL |
| **3** | `pipeline-state-tracker` | Computes pipeline stage for every lead. Bad computation = invisible stalls. | No SOUL.md exists. | HIGH |
| **4** | `jake-lead-scout` | Entry point for entire revenue pipeline. Every downstream agent depends on it. | Good SOUL but no success thresholds, no memory rules, no failure handling | MEDIUM |
| **5** | `jake-outreach-agent` | Produces emails that generate revenue. | Strong SOUL but no skip conditions, no failure handling for empty search results | MEDIUM |

### Why These 5 Outrank the Rest

The enricher, director, and state-tracker form the **autonomous pipeline backbone** — they run on schedule without Steve's involvement and make decisions that determine whether leads advance or stall. If any of these three malfunction silently, the entire pipeline stops producing outreach. The lead-scout and outreach-agent are the highest-value **LLM agents** — their output quality directly determines whether Steve gets meetings.

Every other agent either has adequate governance already (outreach drafters, content engines, reply-classifier) or is lower-impact (discovery, monitoring, training).

---

## 2. Agent Specifications

### H1: `jake-contact-enricher`

**Purpose:** Find verified email addresses and phone numbers for leads that have a company name but no contact details.

**Inputs:**
- Leads from `cfo_leads` where `enrichment_status IN ('pending', 'partial')`
- Optional: `limit`, `min_score`, `status_filter`, `source`

**Outputs:**
- Updated `contact_email`, `phone`, `enrichment_status`, `enrichment_method` on `cfo_leads`
- Brain Layer 1 `contact_found` observations
- Audit log `enricher_quality` metrics

**Non-Goals:**
- Do NOT scrape gated/paywalled sites
- Do NOT guess emails for single-word company names (e.g., "Contractors") — too many false matches
- Do NOT enrich leads with `pilot_fit_score < 20` — waste of Playwright resources
- Do NOT mark a lead as `enriched` if the only email found is a generic role address (info@, admin@)
- Do NOT retry a lead that has already failed enrichment 2x — mark as `failed` permanently

**Tool Allowlist:** Playwright (headless Chromium), Bing search, LLM DOM extractor (fallback only)

**Approval Gates:** None needed — internal DB updates only. Hit rate trending provides monitoring.

**Reviewer Requirements:** No Ralph QA (not content). Weekly hit rate review via health scorecard.

**Memory Rules:**
- Write Brain Layer 1 `contact_found` for every successful enrichment
- Write Brain Layer 1 `enrichment_failed` for leads that fail 2x (so scout knows which companies are unenrichable)
- Log method distribution to audit_log every run

**Benchmark Tasks:**
1. Enrich 20 pending leads → measure hit rate
2. Verify 5 enriched emails actually belong to the right company (spot check)
3. Check that generic emails (info@) are NOT marked as `enriched`

**Success Thresholds:**
- Hit rate >= 20% on Maps-sourced leads
- Hit rate >= 40% on Scout-sourced leads (better company names)
- Generic email rate < 10% of total enriched
- No lead enriched without `contact_name` populated

---

### H2: `pipeline-director`

**Purpose:** Dispatch the next action for every ready lead — decide who gets enriched, who gets a dossier, who gets outreach. Runs autonomously at 6:30AM M-F.

**Inputs:**
- All active leads from `cfo_leads` and `lg_engagement_queue`
- Pipeline state from `pipeline-state-tracker`
- Urgency scores
- Daily budget cap

**Outputs:**
- Queued runs for enrichment, dossier generation, outreach drafting, follow-up
- Discord summary of dispatch plan
- Audit log `pipeline_dispatch` with full decision trail
- Brain Layer 1 `pipeline_dispatched` observation

**Non-Goals:**
- Do NOT send emails — only queue drafts
- Do NOT modify lead data — only read state and dispatch actions
- Do NOT exceed 20 actions per cycle
- Do NOT dispatch more than 5 LLM runs per cycle (cost control)
- Do NOT re-dispatch for a lead that already has a pending run
- Do NOT dispatch outreach for leads without a dossier

**Tool Allowlist:** SQLite read/write (run queue), Discord webhook

**Approval Gates:** None — autonomous dispatch. Sanity check at >15 actions triggers Discord warning.

**Reviewer Requirements:** Dispatch audit trail in audit_log. Weekly review via scorecard.

**Memory Rules:**
- Write Brain `pipeline_dispatched` observation every cycle
- Log full dispatch plan to audit_log with lead IDs and action types
- Read pipeline state before dispatching (never dispatch stale)

**Benchmark Tasks:**
1. Run with 50 active leads → verify correct action for each stage
2. Run with 0 actionable leads → verify graceful "nothing to do" output
3. Run with budget cap at $0 → verify no LLM runs dispatched
4. Run with 25 stalled leads → verify stall detection + Discord alert

**Success Thresholds:**
- 0 leads stalled > 48h due to missing dispatch
- Budget cap never exceeded
- No duplicate dispatches for the same lead in the same cycle
- Actions per cycle: 5-20 range (below 5 = pipeline empty, above 20 = possible runloop)

---

### H3: `pipeline-state-tracker`

**Purpose:** Recompute pipeline stage for every active lead. Flag leads stuck in the same stage >48h.

**Inputs:**
- All active leads from `cfo_leads` and `lg_engagement_queue`
- Outreach sequence history, enrichment status, reply status

**Outputs:**
- Updated `pipeline_stage` on each lead
- Stall flags on leads unchanged >48h
- Discord alert if stalled leads found
- Stage distribution stats

**Non-Goals:**
- Do NOT dispatch actions — that's the director's job
- Do NOT modify lead status — only compute stage
- Do NOT recompute for leads in terminal states (closed_won, closed_lost, unsubscribed, bounced)

**Tool Allowlist:** SQLite read/write, Discord webhook

**Approval Gates:** None — read-mostly, writes only stage column.

**Memory Rules:**
- No Brain observations needed (director handles that)
- Stage transition counts logged in run output

**Benchmark Tasks:**
1. Lead with email but no outreach → stage should be `enriched`
2. Lead with outreach sent 3 days ago → stage should be `contacted`
3. Lead with reply INTERESTED → stage should be `replied`
4. Lead with no stage change in 3 days → should be flagged as stalled

**Success Thresholds:**
- Stage accuracy: 100% (deterministic, no LLM)
- Stall detection within 24h of stall occurring
- Stage transition rate: leads should move forward every 2-3 days during active pipeline

---

### H4: `jake-lead-scout`

**Purpose:** Find named finance decision-makers at construction companies using web search. Insert into `cfo_leads` for enrichment and outreach.

**Inputs:**
- Region + trade from market rotation (or explicit override)
- Exactly 3 web searches (SOUL mandate)

**Outputs:**
- New leads in `cfo_leads` with company, contact, score, location
- Brain Layer 1 observations (market_insight, lead_signal, lead_quality_alert)
- Audit log `lead_scout_quality` metrics

**Non-Goals:**
- Do NOT fabricate company names or contacts — every name must come from actual search results
- Do NOT include leads without `contact_name` (company-only leads are useless)
- Do NOT include Fortune 500 subsidiaries, 1-person shops, or municipal contractors
- Do NOT run more than 3 web searches per execution
- Do NOT output anything besides raw JSON

**Tool Allowlist:** `web_search` (exactly 3 calls)

**Approval Gates:** `validateLead()` on every insert. Output schema validation.

**Memory Rules:**
- Brain `lead_quality_alert` when validation failure rate > 30%
- Brain `lead_rejected` for each individual validation failure (with reason)
- Audit log with avg_score, failure_rate, leads_per_run every run
- Discord alert on quality degradation

**Benchmark Tasks:**
1. Scout Denver, CO → expect 5-10 leads with finance titles
2. Scout a saturated market (Tampa) → expect high dedup rate, few new leads
3. Scout a non-existent market ("Atlantis, XX") → expect 0 leads, no crash

**Success Thresholds:**
- >= 5 leads per run in unscouted markets
- Avg qualification score >= 40
- Validation failure rate < 25%
- 0 leads without contact_name

---

### H5: `jake-outreach-agent`

**Purpose:** Write personalized cold emails to construction CFOs/controllers. Research-first workflow — must use web_search before writing.

**Inputs:**
- Lead record with company, contact, title, ERP, pain signals, city, state
- Brain KB context (winning angles, market patterns)

**Outputs:**
- JSON with subject, body_text, research_sources, personalization_used
- Self-evaluation scorecard appended after JSON
- Stored in `cfo_outreach_sequences` with QA scoring

**Non-Goals:**
- Do NOT write generic templates — every email must reference specific research
- Do NOT send emails — only produce drafts
- Do NOT mention competitors by name
- Do NOT make false claims (guaranteed savings, award-winning, etc.)
- Do NOT exceed 150 words for first-touch emails
- Do NOT use corporate jargon (synergy, leverage, transform, etc.)

**Tool Allowlist:** `web_search` (mandatory, 3+ searches). `exec` and `write` explicitly forbidden.

**Approval Gates:** Content guard → Ralph QA (score >= 70) → Steve approves send

**Reviewer Requirements:** Auto Ralph QA. Self-evaluation scorecard. Content guard.

**Memory Rules:**
- Brain `outreach_drafted` observation on every draft (via postProcessor)
- Self-eval scorecard parsed and stored in `qa_notes`
- `angle_type` tracked for A/B analysis

**Benchmark Tasks:**
1. Draft email for a lead with full data (company, name, title, ERP, city) → expect personalized, QA >= 75
2. Draft email for a lead with minimal data (company + name only) → expect generic angle, QA >= 60
3. Draft email with competitor name injected in lead data → expect NO competitor mention in output

**Success Thresholds:**
- Ralph QA pass rate >= 80%
- `research_sources` present in 100% of outputs
- Content guard HIGH flags: 0%
- Word count: 80-150 for first touch
- Self-eval lowest score >= 7/10

---

## 3. Exact Files to Update

| Agent | File | Change |
|-------|------|--------|
| `jake-contact-enricher` | `openclaw-skills/jake-contact-enricher/SOUL.md` | Full rewrite — expand from 45 lines to proper spec with non-goals, thresholds, failure rules |
| `pipeline-director` | `openclaw-skills/pipeline-director/SOUL.md` | CREATE new file — full spec |
| `pipeline-state-tracker` | `openclaw-skills/pipeline-state-tracker/SOUL.md` | CREATE new file — full spec |
| `jake-lead-scout` | `openclaw-skills/jake-lead-scout/SOUL.md` | Add: success thresholds section, failure handling, memory rules |
| `jake-outreach-agent` | `openclaw-skills/jake-outreach-agent/SOUL.md` | Add: non-goals section, failure handling for empty search results, skip conditions |

## 4. Implementation Order

1. `jake-contact-enricher` SOUL.md rewrite (CRITICAL — current 45-line SOUL is inadequate)
2. `pipeline-director` SOUL.md creation (CRITICAL — zero documentation)
3. `pipeline-state-tracker` SOUL.md creation (HIGH — zero documentation)
4. `jake-lead-scout` SOUL.md additions (MEDIUM — good base, needs thresholds)
5. `jake-outreach-agent` SOUL.md additions (MEDIUM — strong base, needs edge cases)

## 5. What to Defer

- No code changes needed. All handler-level governance (validation, QA, trending, audit) was built in previous sessions.
- No new services needed. This is purely SOUL.md documentation hardening.
- Content engines, reply classifier, meeting booker, discovery agents — all adequately governed.
- Frozen agents (19) — no action until Q2 2026.
- Opportunity engine, RSE — lower priority, adequate governance.
