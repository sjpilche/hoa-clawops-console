# Todd — Input/Output Contract
*Contract Version: 1.0.0*

---

## Inputs

### Task Routing Request
| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | What needs to be done |
| `urgency` | string | No | "HIGH" / "NORMAL" / "LOW" — defaults to "NORMAL" |
| `context` | object | No | Any additional data relevant to routing |
| `deadline` | string | No | ISO 8601 datetime or relative ("by EOD") |
| `requester` | string | No | Who or what sent the task ("steve" / agent name / "scheduled") |

**Example:**
```json
{
  "task": "Draft cold emails for the 8 Tampa GC leads Scout enriched this morning",
  "urgency": "NORMAL",
  "context": { "lead_ids": [142, 143, 144, 145, 146, 147, 148, 149] },
  "requester": "scout"
}
```

### Daily Briefing Request
Sent by the scheduler — no payload required. Todd reads the DB directly.
```json
{ "task": "morning_briefing" }
```

### Escalation from Subordinate Agent
| Field | Type | Required | Description |
|---|---|---|---|
| `from_agent` | string | Yes | Which agent is escalating |
| `issue` | string | Yes | One-sentence description |
| `context` | array | Yes | 1-3 bullet strings with supporting detail |
| `decision_needed` | string | Yes | Exact question Steve needs to answer |
| `deadline` | string | No | When this must be resolved |

**Example:**
```json
{
  "from_agent": "quill",
  "issue": "Asked to write a 3rd follow-up with no new value to offer",
  "context": [
    "Lead: Apex Roofing, contact: Dan Mercer",
    "Touches 1 and 2 sent on 2026-02-14 and 2026-02-19",
    "No reply, no open signals"
  ],
  "decision_needed": "Should I drop this lead or wait for a stronger signal before touch 3?",
  "deadline": "2026-02-26"
}
```

---

## Outputs

### Task Routing Response
```json
{
  "status": "ROUTED",
  "task_summary": "Draft cold emails for 8 Tampa GC leads",
  "routed_to": "quill",
  "priority": "NORMAL",
  "deadline": null,
  "context_passed": { "lead_ids": [142, 143, 144, 145, 146, 147, 148, 149] },
  "notes": "8 leads enriched by Scout this morning — all have email. Use Jake CFO voice."
}
```

### Daily Briefing Response
```json
{
  "status": "BRIEFING_POSTED",
  "date": "2026-03-13",
  "pipeline": {
    "leads_discovered_yesterday": 23,
    "leads_enriched_yesterday": 18,
    "emails_sent_yesterday": 12,
    "replies_yesterday": 1,
    "cost_yesterday_usd": 1.42
  },
  "agent_health": [
    { "agent": "scout", "status": "healthy" },
    { "agent": "charlie", "status": "healthy" },
    { "agent": "quill", "status": "healthy" },
    { "agent": "ralph", "status": "healthy" }
  ],
  "overnight_runs": [
    { "agent": "jake-construction-discovery", "status": "completed", "summary": "31 new companies in Denver CO" },
    { "agent": "jake-contact-enricher", "status": "completed", "summary": "18/31 enriched, 6 emails found" }
  ],
  "top_priority_today": "Route 6 enriched Denver leads to Quill for cold email drafting",
  "open_blockers": [],
  "discord_embed_posted": true
}
```

### Escalation to Steve Response
```json
{
  "status": "ESCALATED",
  "escalation_id": "esc-2026-03-13-001",
  "routed_to": "steve",
  "issue": "Lead Apex Roofing (Dan Mercer) replied — interested in a call",
  "context": [
    "Lead has status = 'replied' as of 2026-03-13 09:14",
    "Original email sent 2026-03-08 via Jake CFO voice",
    "No existing Calendly integration — link placeholder in meeting booker"
  ],
  "decision_needed": "Confirm you want the meeting booking email sent. Calendly URL needed.",
  "deadline": "2026-03-13 EOD",
  "discord_alert_sent": true
}
```

---

## Error Handling

| Scenario | Todd's Response |
|---|---|
| Task has no clear classification | Returns `status: "NEEDS_CLARIFICATION"` with one specific question |
| Agent to route to is currently failing | Returns `status: "ROUTED_WITH_WARNING"` and flags the agent health issue |
| DB is unreadable at briefing time | Returns briefing with `pipeline: "DB_READ_ERROR"`, posts error to Discord |
| Escalation received without `decision_needed` field | Returns `status: "ESCALATION_INCOMPLETE"` and asks the originating agent to provide it |
| Duplicate task already in queue | Returns `status: "DUPLICATE_DETECTED"` with the existing task's ID |

---

## SLA
| Operation | Expected Runtime | Token Budget | Cost Target |
|---|---|---|---|
| Daily Briefing | < 30 seconds | 2,000 tokens | < $0.03 |
| Task Routing | < 10 seconds | 500 tokens | < $0.01 |
| Escalation Packaging | < 15 seconds | 1,000 tokens | < $0.01 |
| Full Fleet Health Check | < 60 seconds | 3,000 tokens | < $0.04 |

---

## Versioning
- **Contract Version:** 1.0.0
- **Breaking Change Policy:** Any change to required input fields or removal of output fields is a breaking change. Increment major version. Announce in the morning briefing on the day of deployment.
- **Non-breaking changes:** Adding optional input fields, adding new output fields, changing descriptions. Increment minor version.
- **Last Updated:** 2026-03-13
