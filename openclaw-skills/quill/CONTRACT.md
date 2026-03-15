# Quill — Input/Output Contract
*Contract Version: 1.0.0*

---

## Inputs

### Cold Email Request
| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | "cold_email" |
| `lead_id` | integer | Yes | ID from cfo_leads table |
| `voice` | string | No | "jake" / "owen" / "clawops". Default: "jake" |
| `sequence_position` | integer | No | 1 (first touch), 2 (follow-up), 3 (meeting booking). Default: 1 |

**Example:**
```json
{ "task": "cold_email", "lead_id": 147, "voice": "jake", "sequence_position": 1 }
```

### Batch Cold Email Request
| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | "cold_email_batch" |
| `lead_ids` | array | Yes | Array of lead IDs from cfo_leads |
| `voice` | string | No | Brand voice. Default: "jake" |

**Example:**
```json
{ "task": "cold_email_batch", "lead_ids": [142, 143, 144, 145], "voice": "jake" }
```

### Follow-Up Email Request
| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | "follow_up" |
| `lead_id` | integer | Yes | ID from cfo_leads |
| `days_since_last_touch` | integer | Yes | Days since the last email was sent |
| `original_subject` | string | Yes | Subject of the first email sent |
| `touch_number` | integer | Yes | 2 or 3 |

### Meeting Booking Email Request
| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | "meeting_booking" |
| `lead_id` | integer | Yes | ID from cfo_leads (must have status = "replied") |
| `reply_text` | string | Yes | The lead's reply text (for personalization) |
| `calendly_url` | string | No | Calendly link. Defaults to `[CALENDLY_URL]` placeholder if not provided. |

### Blog Post Request
| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | "blog_post" |
| `topic` | string | Yes | Subject/angle for the post |
| `keyword` | string | No | Primary SEO keyword to target |
| `voice` | string | No | "owen" (default for blog) / "jake" |
| `word_count_target` | integer | No | 600–1200. Default: 900. |

### Social Post Request
| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | "social_post" |
| `platform` | string | Yes | "linkedin" / "facebook" |
| `topic` | string | Yes | Subject/angle for the post |
| `voice` | string | No | Brand voice. Default: "owen" for LinkedIn, "jake" for Facebook. |
| `source_post_id` | integer | No | If repurposing a blog post, provide cfo_content_pieces.id |

### Case Study Request
| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | "case_study" |
| `lead_id` | integer | No | Lead that converted to pilot (for personalization) |
| `problem` | string | Yes | Description of the client's problem |
| `solution` | string | Yes | What was done |
| `result` | string | Yes | The measurable outcome ("reduced AR aging 40 days in 6 weeks") |
| `quote` | string | No | Client quote, if available |

---

## Outputs

### Cold Email Output
```json
{
  "task": "cold_email",
  "lead_id": 147,
  "company_name": "Hill Country Builders LLC",
  "contact_name": "Mike Renfro",
  "voice": "jake",
  "sequence_position": 1,
  "subject": "Hill Country Builders — your QuickBooks problem",
  "body": "Mike —\n\nYou're running a $6M construction company on QuickBooks and wondering why your AR looks like a spreadsheet from 2004.\n\nWe fixed this for ourselves as construction CFOs. Now we're sharing the fix.\n\nWorth 20 minutes to see the dashboard?\n\n— Jake",
  "word_count": 48,
  "personalization_hook": "Company name + ERP type (QuickBooks from lead record)",
  "cta": "20-minute demo ask",
  "saved_to_sequence_id": 891,
  "status": "DRAFT — PENDING RALPH QA"
}
```

### Blog Post Output
```json
{
  "task": "blog_post",
  "title": "Why Construction Companies Bleed Cash in Q4 (And How to Stop It)",
  "keyword_target": "construction cash flow management",
  "voice": "owen",
  "word_count": 943,
  "body": "[full post content]",
  "h2s": [
    "The Q4 Cash Trap Is Predictable",
    "The Three Places Money Disappears",
    "What a Real-Time Dashboard Changes",
    "The Fix We Implemented in 6 Weeks"
  ],
  "cta": "Download the construction CFO checklist",
  "saved_to_content_id": 44,
  "status": "DRAFT — PENDING RALPH QA"
}
```

### Batch Output
```json
{
  "task": "cold_email_batch",
  "requested": 4,
  "drafted": 4,
  "failed": 0,
  "drafts": [
    { "lead_id": 142, "status": "DRAFT", "subject": "...", "sequence_id": 888 },
    { "lead_id": 143, "status": "DRAFT", "subject": "...", "sequence_id": 889 }
  ],
  "status": "BATCH COMPLETE — ALL PENDING RALPH QA"
}
```

---

## Error Handling

| Scenario | Quill's Response |
|---|---|
| lead_id not found in DB | Returns `error: "LEAD_NOT_FOUND"` with the ID provided |
| Lead missing company_name | Returns `error: "INSUFFICIENT_LEAD_DATA"`, lists missing fields |
| Lead status = "unsubscribed" or "bounced" | Returns `error: "LEAD_OPTED_OUT"` — does not draft |
| word_count_target outside 600-1200 for blog | Adjusts to nearest bound, notes the adjustment in output |
| meeting_booking requested for non-replied lead | Returns `error: "LEAD_NOT_REPLIED"` with current lead status |
| No personalization data available | Drafts with placeholders, sets `"personalization_hook": "NONE — template only"` |

---

## SLA
| Operation | Expected Runtime | Token Budget | Cost Target |
|---|---|---|---|
| Single cold email | < 15 seconds | 800 tokens | < $0.01 |
| Batch cold email (10 leads) | < 2 minutes | 6,000 tokens | < $0.08 |
| Follow-up email | < 15 seconds | 600 tokens | < $0.01 |
| Meeting booking email | < 20 seconds | 800 tokens | < $0.01 |
| Blog post (900 words) | < 60 seconds | 3,000 tokens | < $0.04 |
| LinkedIn post | < 15 seconds | 500 tokens | < $0.01 |
| Case study | < 45 seconds | 2,000 tokens | < $0.03 |

---

## Versioning
- **Contract Version:** 1.0.0
- **Breaking Change Policy:** Changes to saved table column targets (cfo_outreach_sequences or cfo_content_pieces schema changes) are breaking changes — coordinate with Charlie. Output JSON field renames are breaking changes.
- **Non-breaking changes:** Adding new task types, new optional input fields, new output metadata fields.
- **Last Updated:** 2026-03-13
