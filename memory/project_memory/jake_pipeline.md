# Project Memory — Jake Construction GC Pipeline
*Last updated: 2026-03-17 by memoryBridge*

---

## Project Header

| Field | Value |
|-------|-------|
| **Name** | Jake AI CFO Marketing — Construction GC Pipeline |
| **Status** | ACTIVE |
| **Owner** | Steve Pilcher (human) / Todd (orchestration) |
| **Started** | 2026-02-24 |
| **Last Updated** | 2026-03-13 |
| **Mission** | Find general contractors using legacy ERP/accounting systems, enrich contact data, and close them on Jake's CFO financial automation pilot ($8K-$15K engagement) |

---

## Current Pipeline State

**Snapshot: 2026-03-13**

| Stage | Count | Notes |
|-------|-------|-------|
| Discovered (Maps) | 54 | Tampa Bay batch + national rotation via jake-lead-scout |
| Enriched — email found | 13 | 24% email hit rate on Maps leads |
| Enriched — partial (phone/website, no email) | 12 | LinkedIn profile found, no email confirmed |
| Enrichment failed | 29 | 54% failure rate — see What's Not Working |
| Enrichment pending | 4 | Queued, not yet run |
| Outreach sent | 0 | Not yet started |
| Replied | 0 | — |
| Meeting booked | 0 | — |
| Pilot / closed | 0 | — |
| **Total pipeline value** | **$0 realized** | 13 enriched leads × $8K-$15K if 1 converts = $8K-$15K first deal |

---

## Key Decisions Made

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-24 | Unified Jake + CFO agents into shared DB tables (cfo_leads, cfo_outreach_sequences) | Eliminates schema drift, single source of truth for both brands |
| 2026-02-25 | Jake lead scout uses LLM + market rotation (not just Maps) | Maps gives volume but low email hit rate; LLM scout finds leads with more context |
| 2026-02-25 | Enricher saves leads WITHOUT email (partial) rather than discarding | Enricher (Step 5 pattern guess) or LinkedIn may yield email on second pass |
| 2026-02-25 | Enrichment status 3-state: enriched / partial / pending | Allows targeted re-runs by status_filter |
| 2026-03-13 | Agent minimum score threshold = 20 (practically: name + title required) | Prevents empty-shell leads from polluting DB; score < 20 = no actionable contact |

---

## What's Working

- **Google Maps scraper ($0/run):** `jake-construction-discovery` — 20-55 companies per market per run. Tampa Bay: 23, Denver: 31. Zero API cost.
- **5-step enrichment waterfall:** Step 0 (direct domain guess) is the highest hit-rate, lowest cost step. Hits on ~27% of leads with unique company names.
- **Market rotation:** `jakeLeadRotation.js` prevents re-scraping the same market. Rotates nationally across 50+ metro markets.
- **LLM lead scout:** `jake-lead-scout` via OpenClaw produces leads with context (ERP type, pain signals, contact title) that Maps leads lack.
- **Dedup by company name:** prevents double-entry on re-runs of the same market.
- **Brain Layer 3 episodes:** Reply classifier records every outcome to the episode table. Over time, this surfaces which message + ERP type + market combinations convert best.

---

## What's Not Working

- **Enrichment failure rate (54%, 29/54):** The 5-step waterfall fails on companies with generic names ("Bay Area Contractors", "FL Builders", "Tri-County Construction"). Domain guessing requires 2+ unique words. Root cause: Maps returns many DBA/generic-name businesses.
- **Pattern guess emails (Step 5):** 0% confirmation rate in Tampa Bay batch. Pattern-guessed emails bounce on verification. Do not use for single-word company names.
- **No outreach sent yet:** 13 leads with email are sitting unenriched. First send is the critical next step — we have no reply rate data at all.
- **LinkedIn enrichment (Step 4):** Finds profiles but rarely yields email. Useful as a partial signal, not a reliable email source.
- **False company matches:** Step 2 (Bing search) occasionally returns same-name companies from wrong state. Need state verification in website scraper.

---

## Next Milestone

**Target:** First outreach email sent and first reply received
**Metric:** 1 reply of any classification (INTERESTED, NOT_NOW, BOUNCED)
**By when:** 2026-03-20
**Owner:** jake-outreach-agent (Steve confirms before send)
**Blocked by:** Steve must review and approve the first outreach batch

---

## Blockers

| Blocker | Impact | Owner | Status |
|---------|--------|-------|--------|
| No outreach sent | 13 enriched leads sitting idle — no revenue progress | Steve — must approve first send | OPEN |
| Enrichment failure rate 54% | 29 leads stuck; email hit rate below 30% | jake-contact-enricher — need better domain resolution for generic names | OPEN |
| Email deliverability unknown | SendGrid deliverability not tested at scale | Steve — SENDGRID_API_KEY in .env.local required | OPEN |

---

## Agent Assignments

| Agent | Role | Schedule / Trigger |
|-------|------|--------------------|
| jake-construction-discovery | Google Maps GC scraper — bulk company discovery | Mon 6AM (market rotation) |
| jake-contact-enricher | 5-step email + contact waterfall | After discovery run, also Mon 8AM standalone |
| jake-lead-scout | LLM national lead scout with market rotation | Mon 7AM |
| jake-outreach-agent | Drafts and sends cold outreach email sequences | After enrichment; Steve approves |
| jake-follow-up-agent | Follows up on leads sent 5+ days ago with no reply | Wed + Fri 9AM |
| jake-reply-classifier | Classifies incoming replies, updates lead status | Manual trigger (paste reply) |
| jake-meeting-booker | Drafts meeting confirmation for INTERESTED replies | Manual trigger after INTERESTED classification |
| tenacity-cadence | Runs full cadence cycle — queues next touches | Mon/Wed/Fri 9AM |
| pipeline-state-tracker | Recomputes all pipeline stages, flags stalled leads | Daily 1AM |

---

## Memory Write Log

| Date | Updated By | What Changed |
|------|-----------|-------------|
| 2026-03-13 | system-init | Initial file created from known state as of 2026-03-13 |
