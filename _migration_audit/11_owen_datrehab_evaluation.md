# 11 — Owen CFO & Data Rehab Evaluation

---

## Owen CFO (Property Management) — 5 Agents

### Verdict: KEEP (frozen until Jake proves the model)

**Market:** Property Management companies (500-5,000 units, $2M-$50M)
- Trust accounting & compliance
- Owner distributions & CAM reconciliation
- Reserve studies & capital planning
- AppFolio / Yardi / Buildium pain

**Why keep:**
- Genuinely different market from Jake (PM, not construction)
- SOUL.md files are mature and well-differentiated
- `owen_pm_discovery` handler exists and is registered
- Shares Jake's infrastructure (cfo_leads, enrichment, outreach) via `source_agent='owen'`
- Low marginal cost — no new tables, no new services needed

**Why not activate yet:**
- Zero operational traction (never run)
- Jake hasn't proven the model yet (no closed revenue)
- Splitting focus before Jake converts = premature

**Activation conditions:**
1. Jake hits 10+ replied leads (proves outreach works)
2. 3 manual PM CFO conversations validate demand
3. One manual `owen_pm_discovery` run produces viable leads

**Agents:**
| Agent | Shares Handler With | Status |
|-------|-------------------|--------|
| owen-content-engine | (LLM, own SOUL) | Frozen |
| owen-outreach-agent | (LLM, own SOUL) | Frozen |
| owen-lead-scout | `jake_lead_scout` | Frozen |
| owen-social-scheduler | (LLM, own SOUL) | Frozen |
| owen-analytics-monitor | (LLM, own SOUL) | Frozen |

---

## Data Rehab — 3 Agents

### Verdict: CONVERT to cross-sell signal (cut 2 of 3 agents)

**Current positioning:** Standalone "data cleanup" product — foot-in-door at low price, bridges to Jake/Owen upsell.

**Problem:** Data Rehab is not a product. It's a **lead qualification signal**. The SOUL.md files pitch a service ("we'll audit your data for $X") but:
- No pricing defined
- No deliverable defined (what does the customer actually get?)
- No operational playbook
- Zero traction (never run)
- Overlaps with Jake's messaging

**Recommended conversion:**
1. **Keep** `data-rehab-scout` (or rename to a cross-sell signal handler)
   - Mines existing Jake/Owen leads for "data chaos" signals
   - Adds a `data_rehab_score` to leads with messy-data indicators
   - When outreach-agent drafts an email for a high-chaos lead, it can add: "Your data might need cleanup first — we can audit it in 2 days"
2. **Cut** `data-rehab-outreach` and `data-rehab-content`
   - They duplicate Jake's pipeline with a weaker value prop
   - No distinct handler, no distinct schedule, no distinct output

**Implementation:**
- Keep the data-rehab-scout SOUL.md (good signal detection logic)
- Remove data-rehab-outreach and data-rehab-content from seed-all-agents.js
- Disable their schedules in seed-all-schedules.js
- Add brain context that surfaces data-chaos signals in Jake outreach

---

## Summary

| Group | Agents | Action | When |
|-------|--------|--------|------|
| Owen CFO | 5 | Keep frozen | Activate after Jake proves revenue |
| Data Rehab scout | 1 | Keep as cross-sell signal | Wire into Jake outreach |
| Data Rehab outreach/content | 2 | Cut from seed | On EEKOM after migration |
