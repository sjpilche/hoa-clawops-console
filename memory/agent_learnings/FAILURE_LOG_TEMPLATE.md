# Failure Log
*Append new failure entries at the bottom. Never overwrite. Format: one entry per failure pattern. Last updated: [YYYY-MM-DD]*

*A failure pattern is defined as: the same task fails 2+ consecutive times. Single failures go in daily_logs/ unless they have a clear systemic cause.*

---

## Failure Entry Template

Copy this block for each new entry. Append at the bottom of this file.

```
---
date: YYYY-MM-DD
time: HH:MM MT
agent: [agent-name-slug]
run_id: [uuid of most recent failing run, or null]
type: failure
consecutive_fail_count: [N]
confidence: [0.0-1.0 — how confident are we in the root cause?]
tags: [pipeline, task-type, agent-name, error-category — comma-separated]
resolved: false
---
```

---

### [FAILURE-ID] — [one-line description of failure]

**Failure Record**

| Field | Value |
|-------|-------|
| **Date first observed** | [YYYY-MM-DD] |
| **Agent** | [agent-name] |
| **Consecutive fail count** | [N] |
| **Task type** | [enrichment / outreach / discovery / scraping / content / scheduling / other] |
| **Pipeline** | [jake / hoa / data_rehab / system] |

**Error Message / Failure Mode**
```
[Paste exact error message, stack trace excerpt, or precise description of symptom]
[If no error message: describe exactly what output was produced and why it's wrong]
```

**What Was Expected**
[What should have happened? Be specific — e.g., "Should have found email for 30%+ of Tampa Bay leads. Found 0%."]

**What Actually Happened**
[What did happen? Be specific — e.g., "All 15 enrichment attempts returned empty. No emails found. No errors thrown — silent failure."]

**Hypothesized Root Cause**
[Your best guess at why this is failing. Rate your confidence: 0.0-1.0]

**Data Checked**

| Check | What You Looked At | What You Found |
|-------|--------------------|----------------|
| [e.g., DB state] | [cfo_leads WHERE status='pending'] | [N rows with expected data / unexpected state] |
| [e.g., service logs] | [server console output during run] | [specific log lines that are informative] |
| [e.g., external service] | [Playwright browser state / API response] | [what you observed] |
| [e.g., config] | [.env.local / agent config in DB] | [missing key / wrong value / expected] |

**Fix Attempted**

| Attempt | Date | What Was Changed | Result |
|---------|------|-----------------|--------|
| Attempt 1 | [YYYY-MM-DD] | [Specific change made — file path + line number if code] | [outcome — did it help, partial, no change] |
| Attempt 2 | [YYYY-MM-DD] | | |

**Escalation**

| Question | Answer |
|----------|--------|
| Escalated to Todd? | [Y — date / N — reason] |
| Escalated to Steve? | [Y — date — what was communicated / N — not needed] |

**Resolution**

| Field | Value |
|-------|-------|
| **Resolved?** | yes / no / partial |
| **Resolution date** | [YYYY-MM-DD or "open"] |
| **What fixed it** | [Specific — file changed, config updated, external dependency resolved, or "unresolved"] |
| **Resolved by** | [agent-name / Todd / Steve] |

**Prevention — What Memory or Rule Change Prevents This Recurring?**

- [ ] Add to SOUL.md for [agent-name]: [specific instruction]
- [ ] Add to runs.js handler [handler-name]: [guard condition or validation]
- [ ] Add to service file [service.js]: [error handling or fallback]
- [ ] Add to AGENT_MEMORY_INSTRUCTIONS.md: [new trigger or check]
- [ ] Add to failure_log watch list: [pattern to monitor for in future runs]
- [ ] No code change needed — environmental issue (document the environment dependency)

---

## Failure Log (Append Below This Line)

*Each new failure entry gets appended below. Most recent at the bottom.*

---
*(No failure entries yet. First entry will be appended when a 2+ consecutive failure is detected.)*
