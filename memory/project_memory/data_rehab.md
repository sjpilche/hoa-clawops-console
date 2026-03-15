# Project Memory — Data Rehab
*Last updated: 2026-03-13 by system-init*

---

## Project Header

| Field | Value |
|-------|-------|
| **Name** | Data Rehab — ERP Data Cleanup and Migration Automation for Construction |
| **Status** | EVALUATING |
| **Owner** | Steve Pilcher |
| **Started** | 2026-03 (early evaluation) |
| **Last Updated** | 2026-03-13 |
| **Mission** | Sell ERP data cleanup and migration services (and eventually automation tooling) to construction companies using legacy or messy accounting systems |

---

## Current Pipeline State

**Snapshot: 2026-03-13**

| Stage | Count | Notes |
|-------|-------|-------|
| Concept definition | In progress | Revenue model not fully defined — service vs. product vs. both |
| Landing page | Not built | Need to validate demand before building |
| Outreach drafted | Unknown | `scripts/send-datarehab-blast.js` exists — needs review to understand what was drafted |
| Leads contacted | Unknown | Unclear if blast script was ever executed |
| Replies received | 0 known | No reply data in DB attributed to data_rehab |
| Pilots / engagements | 0 | — |
| **Priority score** | **81/100** | From opportunity scoring (source: MEMORY.md) |

---

## Key Decisions Made

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03 | Evaluate as standalone product/service, not a Jake feature | Jake = CFO automation software pilot; Data Rehab = one-time cleanup engagement. Different buyer motion, different price point. |
| 2026-03 | Score at 81/100 priority | High ICE: construction companies universally have dirty ERP data; Steve has direct expertise; can use existing Jake lead list as customer pool |

---

## What's Working

- **Steve's edge is real:** As a construction CFO who has personally cleaned up Sage 300, QuickBooks, and BC/Procore data, Steve can sell this credibly. Competitors are generic IT consultants with no construction domain knowledge.
- **Existing lead list:** Jake pipeline has enriched GC leads (13 with email, 12 partial). These are the exact buyers for Data Rehab — same company, same pain.
- **send-datarehab-blast.js exists:** Someone (or an agent) already drafted an outreach blast. This means minimal work to validate — review the script, approve, send.
- **Co-sell opportunity:** Jake pilot ($8K-$15K engagement) could include Data Rehab as Phase 1 deliverable — "we clean your data, then automate it." Higher ticket, more value delivered.

---

## What's Not Working

- **No validated offer:** The specific deliverable, timeline, and price point are undefined. "Data cleanup" is vague. What does Steve deliver? A clean Sage database? A migration to a new ERP? A documented data model? Needs one-sentence offer definition.
- **Script not analyzed:** `scripts/send-datarehab-blast.js` has not been read. May contain a complete outreach sequence or may be a stub. Unknown.
- **Landing page absent:** No validation artifact exists. Any lead who responds has nowhere to go.
- **Product vs. service ambiguity:** Is this a service Steve delivers personally? An automated tool? A hybrid? Unresolved. Affects pricing, scalability, and agent workflow.

---

## Next Milestone

**Target:** Validate the offer with 3 inbound replies or 1 "yes, I need this"
**Metric:** 3 replies to the outreach blast (any classification)
**By when:** 2026-03-27
**Owner:** Steve (approve offer definition) → jake-outreach-agent (send blast)
**Blocked by:** Two prerequisites:
1. Review `scripts/send-datarehab-blast.js` — determine if outreach is already drafted
2. Define the offer: what does Steve deliver, at what price, in what timeframe

---

## Blockers

| Blocker | Impact | Owner | Status |
|---------|--------|-------|--------|
| Offer undefined | Cannot send outreach without a clear promise | Steve — 30-minute decision | OPEN |
| Blast script unreviewed | May be ready to send or may need work | Todd — read the script, report to Steve | OPEN |
| No landing page | Interested replies have nowhere to go | Steve — minimum: a PDF one-pager or Calendly link as CTA | OPEN |

---

## Opportunity Context

**Target customer:** Construction company controller, CFO, or ops manager at a GC with $5M-$100M revenue using Sage 300, QuickBooks, BC (Business Central), or Procore with known data problems.

**Pain signals that qualify this buyer:**
- Hiring a controller or CFO (data is a mess, new hire will hit walls)
- Negative ERP reviews on G2 / Capterra attributing problems to data quality
- LinkedIn post or forum complaint about "messy data," "AR chaos," "can't trust the reports"
- Active ERP migration or upgrade project (existing data must be cleaned before migration)

**Revenue model options (pick one, validate):**

| Model | Price Point | Pros | Cons |
|-------|------------|------|------|
| Fixed-scope project | $5K-$15K | Predictable, easy to quote | One-time, not recurring |
| Monthly retainer | $1K-$3K/mo | Recurring revenue | Harder to sell scope |
| Software tool + onboarding | $200-$500/mo SaaS | Scalable, no Steve time | Requires build |
| Hybrid (project + tool) | $8K setup + $300/mo | Best lifetime value | Complex to sell |

**Recommended first test:** Fixed-scope project ($8K-$12K). One company, one engagement. Prove the model before building anything.

**Steve's edge over competitors:**
- Construction domain knowledge (Sage 300, Procore, QB for construction — not generic accounting)
- Has personally performed this work as a CFO — not theoretical
- Understands the downstream automations (Jake) that require clean data — sells the why
- Existing relationships in construction industry

---

## Agent Assignments

| Agent | Role | When |
|-------|------|----|
| jake-outreach-agent | Send data rehab blast to Jake pipeline leads | After Steve approves offer + reviews script |
| jake-reply-classifier | Classify replies from data rehab outreach | Manual trigger after sends |
| jake-lead-scout | Flag leads with data-specific pain signals (ERP migrations, controller hires) | Ongoing — add `data_rehab_signal: true` tag |

---

## Key Questions for Steve

1. What exactly does a Data Rehab engagement deliver? (deliverable list)
2. Is it Steve's personal time, agent-assisted, or fully automated?
3. What is the price? ($5K? $10K? Monthly?)
4. Is it sold separately from Jake, or as Jake Phase 1?
5. What does `send-datarehab-blast.js` actually say? (Todd should read this)

---

## Memory Write Log

| Date | Updated By | What Changed |
|------|-----------|-------------|
| 2026-03-13 | system-init | Initial file created from known state as of 2026-03-13 |
