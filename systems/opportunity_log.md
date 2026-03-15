# Opportunity Log
*ClawOps Systems File — Running record of every business opportunity surfaced*
*Maintained by: Reverse Prompt Engine + Todd (Chief of Staff AI)*
*Last updated: 2026-03-13*

---

## About This Log

Every time an agent discovers a potential revenue opportunity — from a forum complaint, a job posting pattern, a data signal, a market gap, or a direct lead — it gets logged here before Steve ever sees it. Logged entries that pass the GO criteria get escalated. Everything else stays in the log with its scoring, so Steve can revisit or kill it explicitly.

This log is never pruned. KILLED entries stay — they serve as institutional memory so agents don't re-surface the same dead ideas.

**New entries are added by:**
- Reverse Prompt Engine (daily scan)
- Any agent that encounters a signal meeting the standing orders in `agent_mandate.md`
- Todd during morning brief prep
- Steve manually (when he hears something interesting)

---

## Log Format

Each entry uses this structure:

```
### OPP-[ID] — [Opportunity Name]
**Date Discovered:** YYYY-MM-DD
**Source:** [which agent found it / which signal triggered it]
**Description:** [one sentence — what the opportunity is and who pays for it]
**Target Customer:** [specific job title or company type — not "businesses"]
**Revenue Model:** [how money flows — subscription, one-time, rev share, etc.]
**Price Point:** $[X]/mo or $[X] one-time
**Time to Revenue:** [X days estimated]
**ICE Score:** [X/10] (Impact: [X] | Confidence: [X] | Ease: [X])
**Revenue Potential Score (RPS):** [X/40]
**Automation Leverage Score (ALS):** [X/30]
**Priority Score:** [X/100]
**GO / NO-GO:** [GO / NO-GO + one sentence why]
**Status:** NEW / EVALUATING / ACTIVE / KILLED / CONVERTED
**Notes:** [agent or Steve observations]
```

---

## Active Opportunities

---

### OPP-001 — Jake CFO Pipeline: Construction ERP + Finance Automation Outreach Service

**Date Discovered:** 2026-02-15 (pipeline predates this log — entered retroactively)
**Source:** Steve Pilcher (founder insight) — validated by jake-construction-discovery and jake-lead-scout agent output
**Description:** Cold outreach service targeting construction company CFOs and controllers using Sage 300, Viewpoint, or legacy ERP systems who are struggling with data quality, reporting, and AR automation — offering a CFO-led automation assessment and implementation engagement.
**Target Customer:** CFO, Controller, VP Finance at construction companies with $5M-$100M revenue, 20-500 employees, running Sage 300, Viewpoint Vista, Foundation, or QuickBooks Enterprise
**Revenue Model:** Consulting engagement (assessment + implementation) with SaaS upsell
**Price Point:** $8,000-$15,000 per engagement | $500-$1,500/mo SaaS (future)
**Time to Revenue:** 30-45 days (first engagement close from a warm reply)
**ICE Score:** 8.0/10 (Impact: 9 | Confidence: 7 | Ease: 8)
**Revenue Potential Score (RPS):** 40/40 (direct path to closing a deal)
**Automation Leverage Score (ALS):** 25/30 (agents do discovery, enrichment, drafting — Steve closes)
**Priority Score:** 87/100
**GO / NO-GO:** GO — passes all 5 criteria, Steve has unfair domain advantage as construction CFO, pipeline infrastructure already live
**Status:** ACTIVE
**Notes:**
- 53 agents running; Jake + CFO pipelines unified in cfo_leads table
- Current state (2026-03-13): leads in DB, enrichment running, outreach in cadence
- Bottleneck: first INTERESTED reply → meeting booked → closed deal
- Key next step: ensure every lead with pilot_fit_score > 70 has outreach queued
- Comp reference: construction finance consultants charge $150-$250/hr, engagements run 40-100 hrs
- ERP pain is universal in mid-market construction — validated by hiring signal patterns

---

### OPP-002 — HOA Project Funding: Automated Deal Sourcing + Underwriting Pipeline

**Date Discovered:** 2026-01-20 (pipeline predates this log — entered retroactively)
**Source:** Steve Pilcher (founder insight) — validated by hoa-discovery agent (568 HOAs found in South Florida alone in first run)
**Description:** Automated pipeline that identifies HOA communities needing capital project financing (roofs, pools, parking, elevators), sources lender options, and delivers a funding package — targeting property management companies and HOA boards as the customer.
**Target Customer:** HOA property managers at management companies (FirstService, Castle Group, Greystar HOA, regional firms), HOA board treasurers at self-managed communities with 50-500 units
**Revenue Model:** Origination fee (1-2% of loan amount) or referral fee from lender partners; optionally: SaaS for property managers to run their own assessments
**Price Point:** $2,000-$10,000 per deal originated (on $100K-$500K loans at 1-2%) | $299/mo SaaS (future)
**Time to Revenue:** 60-90 days (longer cycle — HOA board decisions require votes)
**ICE Score:** 6.7/10 (Impact: 8 | Confidence: 6 | Ease: 6)
**Revenue Potential Score (RPS):** 35/40 (high per-deal revenue, medium conversion speed)
**Automation Leverage Score (ALS):** 22/30 (discovery and research fully automated; deal closing requires human relationship)
**Priority Score:** 73/100
**GO / NO-GO:** GO — passes all criteria; time-to-revenue is 60-90 days which is at the upper edge, but deal size justifies the cycle; HOA board decision process is the natural constraint, not a failure of the system
**Status:** ACTIVE
**Notes:**
- HOA discovery agent validated: 568 HOAs found in South Florida, 19 geo-targets configured, $0 cost
- HOA minutes monitor checks for special assessment discussions — direct buying signal
- Pipeline: discovery → contact enrichment → outreach → meeting → funding package → lender match
- Key gap: no lender partner relationships yet — either build lending_products table with scraped data or pursue 1-2 direct lender partnerships
- Adjacent opportunity: property management companies as a distribution channel (one PM firm manages 50+ HOA clients)
- Time-to-revenue depends heavily on whether we target the PM company (faster — B2B sale) vs. the HOA board directly (slower — committee decision)

---

### OPP-003 — Data Rehab / ERP Automation: Construction Data Cleanup as a Service

**Date Discovered:** 2026-02-20
**Source:** jake-pain-signal-monitor + founder insight — pattern of construction companies with messy Sage/Viewpoint data discovered through outreach replies and forum monitoring
**Description:** Fixed-price service to clean, reconcile, and automate construction company financial data — targeting companies with ERP migration debt, duplicate vendors, AR chaos, job cost mismatches, and broken reporting — delivered as a one-time data rehab engagement with optional ongoing automation retainer.
**Target Customer:** Construction company controllers and CFOs who recently changed ERP systems, inherited bad data from a predecessor, or are in the process of an audit where data quality problems have been exposed; also targets new CFOs 90 days into a job who need to fix the mess they inherited
**Revenue Model:** Fixed-price engagement ($3K-$8K) for data assessment + cleanup script; recurring automation retainer ($500-$1,500/mo) to maintain clean data going forward
**Price Point:** $3,000-$8,000 one-time + $500-$1,500/mo retainer
**Time to Revenue:** 14-30 days (fastest of the three active pipelines — pain is acute, decision is quick)
**ICE Score:** 7.7/10 (Impact: 8 | Confidence: 8 | Ease: 7)
**Revenue Potential Score (RPS):** 38/40 (closes fast when pain is acute — controller with a bad audit finding is ready to spend immediately)
**Automation Leverage Score (ALS):** 20/30 (agents do discovery, diagnosis scripts, and documentation; Steve does the actual data work or supervises it — has a clear path to fully automated with agent-written SQL)
**Priority Score:** 81/100
**GO / NO-GO:** GO — fastest path to first dollar of all active opportunities; Steve's construction CFO background is the unfair advantage; no one else is positioning as a "data rehab" specialist for mid-market construction
**Status:** EVALUATING
**Notes:**
- Not yet receiving dedicated outreach — Jake pipeline leads are being hit with the CFO automation message, not a Data Rehab-specific message
- Key test needed: send 10 cold emails specifically about Data Rehab to companies that match the "recent ERP migration" or "new controller" signal — measure reply rate vs. CFO automation message
- SendGrid email infrastructure is live; enriched leads exist in DB; outreach agent can be prompted with a Data Rehab angle
- The SendGrid blast infrastructure (scripts/send-datarehab-blast.js exists in working directory) suggests this was started — check file status
- Monetization path to SaaS: if the data cleanup scripts are templated, they become a self-serve product for $99-$299/mo
- Hypothesis: Data Rehab converts faster than Jake CFO because the pain is acute and diagnosed (they already know they have bad data) vs. latent (they don't know how much their ERP is costing them)
- Kill condition: if 20 Data Rehab-specific outreach emails produce zero replies in 30 days, either the message is wrong or the product needs repositioning

---

## Opportunity Pipeline Summary

| ID | Opportunity | Priority Score | Status | Next Action |
|----|------------|---------------|--------|-------------|
| OPP-001 | Jake CFO Pipeline | 87/100 | ACTIVE | Ensure leads with score > 70 have outreach queued; advance any INTERESTED replies to meeting |
| OPP-003 | Data Rehab / ERP | 81/100 | EVALUATING | Send 10 Data Rehab-specific cold emails this week; check send-datarehab-blast.js status |
| OPP-002 | HOA Project Funding | 73/100 | ACTIVE | Identify 1-2 lender partners for referral relationship; test PM company as distribution channel |

---

## Log Instructions for Agents

When you surface a new opportunity, add an entry to this file using the exact format above. The entry is incomplete unless it includes:

1. A specific target customer with job title (not "businesses" or "companies")
2. A price point with a number (not "market rate" or "TBD")
3. A time to revenue estimate in days
4. All three scores: ICE, RPS, ALS, and the combined Priority Score
5. A GO / NO-GO verdict with one-sentence justification
6. At least two notes that would help Steve decide to act or kill

If you cannot fill in any of these fields, you don't have enough information yet. Do more research before logging. Half-baked entries waste Steve's attention.

---

*This log is a decision-making tool, not a parking lot. Every EVALUATING entry older than 14 days without a status change should be escalated to Steve: "This has been EVALUATING for X days — are we pursuing it or killing it?"*
