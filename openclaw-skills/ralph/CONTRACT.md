# Ralph — Input/Output Contract
*Contract Version: 1.0.0*

---

## Inputs

### Content QA Request
| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | "qa_content" |
| `content_type` | string | Yes | "cold_email" / "follow_up" / "meeting_booking" / "blog_post" / "linkedin_post" / "facebook_post" / "case_study" |
| `submitted_by` | string | Yes | Agent name that produced the content |
| `content` | object | Yes | The full content output object from Quill (pass the entire output JSON) |
| `lead_id` | integer | No | Required for email content types — Ralph will verify lead status against DB |

**Example:**
```json
{
  "task": "qa_content",
  "content_type": "cold_email",
  "submitted_by": "quill",
  "lead_id": 147,
  "content": {
    "subject": "Hill Country Builders — your QuickBooks problem",
    "body": "Mike —\n\nYou're running a $6M construction company on QuickBooks...",
    "word_count": 48,
    "voice": "jake",
    "cta": "20-minute demo ask"
  }
}
```

### Code QA Request
| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | "qa_code" |
| `submitted_by` | string | Yes | Agent name (always "charlie") |
| `delivery` | object | Yes | The full DELIVERY output object from Charlie |
| `code_snippets` | array | No | Key code sections to review (if delivery references file paths only) |

**Example:**
```json
{
  "task": "qa_code",
  "submitted_by": "charlie",
  "delivery": {
    "feature_name": "jake_permit_scanner special handler",
    "files_created": ["server/services/jakePermitScanner.js"],
    "files_modified": ["server/routes/runs.js"]
  },
  "code_snippets": [
    {
      "file": "server/routes/runs.js",
      "lines": "387-401",
      "code": "jake_permit_scanner: async ({ message, runId, agent }) => { ... }"
    }
  ]
}
```

### Lead Data QA Request
| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | "qa_leads" |
| `lead_ids` | array | Yes | Array of lead IDs to audit |
| `check_type` | string | No | "email_format" / "name_quality" / "dedup" / "all". Default: "all" |

---

## Outputs

### QA Review — Content
```json
{
  "task": "qa_content",
  "content_type": "cold_email",
  "submitted_by": "quill",
  "review_date": "2026-03-13T09:22:11Z",
  "verdict": "PASS",
  "dimensions": {
    "accuracy": { "result": "PASS", "note": "Lead data matches DB: Mike Renfro, Hill Country Builders, QuickBooks confirmed" },
    "brand_voice": { "result": "PASS", "note": "Jake CFO voice — blunt, short sentences, direct CTA. Correct." },
    "functionality": { "result": "PASS", "note": "Word count: 48 (under 150 limit). One CTA. No attachment reference." },
    "risk": { "result": "PASS", "note": "No legal claims. Lead status is 'new' — not opted out." }
  },
  "notes": [],
  "action_required": null,
  "routed_to": "todd"
}
```

### QA Review — PASS WITH NOTES
```json
{
  "task": "qa_content",
  "content_type": "blog_post",
  "submitted_by": "quill",
  "review_date": "2026-03-13T10:14:33Z",
  "verdict": "PASS WITH NOTES",
  "dimensions": {
    "accuracy": { "result": "PASS", "note": "All claims are opinion-based or clearly attributed" },
    "brand_voice": { "result": "PASS", "note": "Owen CFO voice — analytical, evidence-based. Correct." },
    "functionality": { "result": "PASS", "note": "Word count: 1,087. H2s present. CTA at end." },
    "risk": { "result": "PASS", "note": "One unverified statistic flagged below" }
  },
  "notes": [
    "Line 3: '67% of construction companies miss payroll at least once' — no source cited. Add '(based on our analysis of 40+ construction CFO engagements)' or remove.",
    "Link in CTA section (hoaprojectfunding.com/checklist) was not validated — confirm page exists before publishing."
  ],
  "action_required": null,
  "routed_to": "todd"
}
```

### QA Review — REJECT
```json
{
  "task": "qa_content",
  "content_type": "cold_email",
  "submitted_by": "quill",
  "review_date": "2026-03-13T11:03:17Z",
  "verdict": "REJECT",
  "dimensions": {
    "accuracy": { "result": "PASS", "note": "Lead data correct" },
    "brand_voice": { "result": "FAIL", "note": "Email reads as Owen CFO (thought-leader tone) but task requested Jake CFO voice" },
    "functionality": { "result": "FAIL", "note": "Word count: 214 — exceeds 150-word hard limit by 64 words" },
    "risk": { "result": "PASS", "note": "No risk issues" }
  },
  "notes": [
    "Word count violation: 214 words. Hard limit is 150. Cut the middle paragraph entirely.",
    "Voice mismatch: phrases like 'In my experience advising construction executives...' are Owen CFO, not Jake CFO. Jake would say 'I've seen this exact problem at 30+ GCs.'"
  ],
  "action_required": "Rewrite from scratch using Jake CFO voice. Max 150 words. Remove all thought-leader framing. Start with the company's pain, not your credentials.",
  "routed_to": "quill"
}
```

### Code QA Review
```json
{
  "task": "qa_code",
  "submitted_by": "charlie",
  "review_date": "2026-03-13T14:22:08Z",
  "verdict": "PASS WITH NOTES",
  "checklist": {
    "no_hardcoded_secrets": true,
    "env_vars_documented": true,
    "error_handling_external_calls": true,
    "parameterized_queries": true,
    "result_data_not_output": true,
    "route_registration_both_lines": "N/A — no new route",
    "migration_idempotent": "N/A — no migration",
    "rollback_documented": "N/A — no migration"
  },
  "dimensions": {
    "accuracy": { "result": "PASS", "note": "Handler signature matches SPECIAL_HANDLERS pattern" },
    "brand_voice": { "result": "N/A", "note": "Code review" },
    "functionality": { "result": "PASS", "note": "Error handling present. Returns correct outputText format." },
    "risk": { "result": "PASS", "note": "No destructive operations. No secrets." }
  },
  "notes": [
    "Line 394: catch block logs error but does not re-throw — if runPermitScanner throws, handler returns undefined outputText. Add fallback outputText in catch."
  ],
  "action_required": null,
  "routed_to": "todd"
}
```

---

## Error Handling

| Scenario | Ralph's Response |
|---|---|
| Content object is missing required fields | Returns `verdict: "PASS WITH NOTES"` with `note: "Incomplete submission — [missing fields]"` |
| lead_id provided but lead not in DB | Returns `verdict: "REJECT"` with `note: "Lead ID not found — cannot verify opt-out status"` |
| Lead status = unsubscribed or bounced | Returns `verdict: "REJECT"` with `risk: FAIL`, escalation flag to Steve |
| Code snippet not provided — can only review DELIVERY metadata | Returns review with `note: "Full code not reviewed — metadata review only"` |
| Same agent's 3rd consecutive REJECT | Adds flag: `"pattern_alert": "quill has received 3 consecutive REJECTs on cold_email — route to Todd for calibration"` |

---

## SLA
| Operation | Expected Runtime | Token Budget | Cost Target |
|---|---|---|---|
| Cold email QA | < 15 seconds | 600 tokens | < $0.01 |
| Blog post QA | < 30 seconds | 1,500 tokens | < $0.02 |
| Code QA (full delivery) | < 60 seconds | 2,000 tokens | < $0.03 |
| Lead data audit (20 leads) | < 20 seconds | 500 tokens | < $0.01 |
| Batch content QA (10 emails) | < 2 minutes | 5,000 tokens | < $0.07 |

---

## Versioning
- **Contract Version:** 1.0.0
- **Breaking Change Policy:** Changes to the verdict enum values ("PASS" / "PASS WITH NOTES" / "REJECT"), the dimensions object structure, or the `routed_to` field behavior are breaking changes. Todd and the scheduling system depend on these values.
- **Non-breaking changes:** Adding new content_type values, adding checklist items, adding note fields.
- **Last Updated:** 2026-03-13
