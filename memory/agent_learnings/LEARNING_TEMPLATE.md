# Agent Learning Entry — [YYYY-MM-DD] — [agent-name]
*Copy to `memory/agent_learnings/learnings.md` as an appended entry. Fill all fields. Last updated: [YYYY-MM-DD]*

---

```
---
date: YYYY-MM-DD
time: HH:MM MT
agent: [agent-name-slug]
run_id: [uuid or null]
type: learning
confidence: [0.0-1.0]
tags: [pipeline, geo, task-type, agent-name — comma-separated]
evergreen: [true / false]
status: PENDING_REVIEW
---
```

---

## Run Context

| Field | Value |
|-------|-------|
| **Agent** | [agent-name] |
| **Run type** | [scheduled / manual / blitz] |
| **Run ID** | [uuid or null] |
| **Task performed** | [One-line description of what the agent was doing] |
| **Pipeline** | [jake / hoa / data_rehab / other] |
| **Market / Geo** | [specific market or "national" or "n/a"] |

---

## What Worked

*Be specific. Include numbers. One finding per bullet.*

- **[Finding name]:** [Description with evidence — e.g., "Step 0 domain guess: 27% hit rate on companies with 2+ unique words in name (4/15 Tampa Bay leads). Fastest and $0 cost."]
- **[Finding name]:** [Description with evidence]

---

## What Didn't Work

*Be specific. What failed, how it failed, what the symptoms were.*

- **[Failure name]:** [Description — e.g., "Pattern guess emails (Step 5): 0% on Tampa Bay batch. All 2 guesses bounced on verification. Specific failure: single-word company names ('Contractors') produce invalid domain guesses."]
- **[Failure name]:** [Description]

---

## Root Cause Analysis

*For each failure above, what caused it? Don't leave this blank — "unknown" is an acceptable answer if genuinely unknown.*

| Failure | Root Cause | Confirmed? |
|---------|-----------|------------|
| [failure name] | [root cause description] | yes / no / suspected |

---

## What to Do Differently Next Time

*Specific, actionable changes. Not "do better" — exactly what should change.*

1. [Change 1 — e.g., "Require company_name word count >= 2 before attempting Step 0 domain guess"]
2. [Change 2]
3. [Change 3]

---

## Generalizability

| Question | Answer |
|----------|--------|
| **Does this finding hold across markets?** | yes / no / unknown |
| **Does it hold across different lead sources?** | yes (Maps + Scout) / Maps only / Scout only / unknown |
| **Does it hold for both Jake and HOA pipelines?** | yes / jake only / hoa only / unknown |
| **How many data points support this?** | N leads / N runs / N markets |
| **Confidence in generalization** | [0.0-1.0] |

If `evergreen: true` — this learning should be loaded for all future runs of this task type, not just recent ones.

---

## Recommended Action

*Pick exactly one.*

- [ ] **Update SOUL.md** for [agent-name] — add [specific instruction or constraint]
- [ ] **Update handler in runs.js** — change [specific parameter or logic] in [handler name]
- [ ] **Update scoring logic** — change [field or threshold] in [service file]
- [ ] **Update enricher waterfall** — change [step behavior] in [service file]
- [ ] **No action needed** — learning noted for context, no code change required
- [ ] **Escalate to Steve** — requires a human decision: [specific question]

**Owner of recommended action:** [agent-name / Todd / Steve]
**Target completion:** [YYYY-MM-DD or "next run"]

---

## Status

| Field | Value |
|-------|-------|
| **Current status** | PENDING_REVIEW |
| **Reviewed by** | [Todd / Steve / agent-name — leave blank until reviewed] |
| **Review date** | [YYYY-MM-DD — leave blank until reviewed] |
| **Final status** | PENDING_REVIEW → APPLIED / ARCHIVED |
| **If APPLIED:** | [What was changed and when] |
| **If ARCHIVED:** | [Why not applied] |
