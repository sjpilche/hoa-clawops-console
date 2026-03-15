# Daily Log — [YYYY-MM-DD]
*Copy this file to `YYYY-MM-DD.md`. Replace all bracketed fields. Append entries chronologically throughout the day.*

---

## Agent Runs Summary

| Time (MT) | Agent | Task | Output | Status | Cost ($) |
|-----------|-------|------|--------|--------|----------|
| HH:MM | [agent-name] | [one-line task description] | [one-line result] | completed / failed / skipped | $0.00 |
| HH:MM | | | | | |

**Total runs today:** [N]
**Total cost today:** $[0.00]
**Failed runs:** [N] — [brief reason if any]

---

## Pipeline Changes

### Jake Pipeline
- Leads added: [N] (source: [maps/scout/manual])
- Leads enriched: [N] (emails found: [N])
- Outreach sent: [N]
- Replies received: [N] ([classification: INTERESTED/NOT_NOW/BOUNCED/etc.])
- Meetings booked: [N]
- Status changes: [e.g., "Lead #42 Apex Construction → replied (INTERESTED)"]

### HOA Pipeline
- Communities discovered: [N] (geo: [target])
- Contacts enriched: [N]
- Outreach drafted: [N]
- Engagement queue: [N] pending review
- Tier changes: [e.g., "3 communities HOT → WARM (no activity 14 days)"]

### Other Pipelines
- [data_rehab / other]: [brief status or "no activity"]

---

## New Leads Found

| Lead ID | Company | Pipeline | Source | Score | Email | Next Action |
|---------|---------|----------|--------|-------|-------|-------------|
| [DB id] | [company name] | jake / hoa | maps / scout / manual | [0-100] | yes / no / partial | [enrich / outreach / hold] |

---

## New Opportunities Flagged

| Opportunity | ICE Score | Source | Next Action |
|-------------|-----------|--------|-------------|
| [one-line description] | [I/C/E = X] | [which agent / signal] | [file idea / score / present to Steve] |

*If ICE total >= 5, create `memory/business_ideas/IDEA-[slug].md` immediately.*

---

## Failures and Blockers

| Time | Agent | What Failed | Error / Symptom | Root Cause (if known) | Action Taken |
|------|-------|-------------|-----------------|----------------------|--------------|
| HH:MM | [agent] | [task] | [error message or symptom] | [cause or "unknown"] | [retry / escalate / skip] |

*If same task fails 2x: append to `memory/agent_learnings/failure_log.md` now.*

---

## Learnings

*What worked today that we should repeat? What didn't work that we should stop doing?*

**What worked:**
- [Specific. Include numbers. Example: "5-step enrichment waterfall: step 0 (direct domain) hit on 4/10 Maps leads today — faster than Bing"]

**What didn't work:**
- [Specific. Example: "Enricher fails on company names with single common word ('Contractors'). Need 3+ unique words for domain guess."]

**Patterns noticed:**
- [Example: "All 3 INTERESTED replies came from leads with pilot_fit_score > 75. Below 75: zero replies."]

*If a learning is actionable, create an entry in `memory/agent_learnings/learnings.md`.*

---

## Tomorrow's Queue

*What is scheduled to run? What needs manual attention?*

| Priority | Task | Agent | Notes |
|----------|------|-------|-------|
| 1 | [task description] | [agent-name] | [any special params or flags] |
| 2 | | | |
| 3 | | | |

**Needs Steve's attention:**
- [ ] [Action item requiring human decision — e.g., "Review 3 INTERESTED replies in outreach queue"]
- [ ] [e.g., "Approve data_rehab outreach blast before Thursday send"]

---

## Memory Writes Today

*Track what was written to memory this session. Prevents duplicate writes on next run.*

| Time | File Written | Type | Summary |
|------|-------------|------|---------|
| HH:MM | [path relative to memory/] | [type] | [one sentence] |

---
*Log created by: [agent-name] at [HH:MM MT]*
*Last updated by: [agent-name] at [HH:MM MT]*
