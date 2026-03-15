# Scout — Input/Output Contract
*Contract Version: 1.0.0*

---

## Inputs

### Discovery Request
| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | "discovery" |
| `region` | string | No | "Tampa Bay, FL" / "Denver, CO" etc. Rotates automatically if omitted. |
| `limit` | integer | No | Max companies to return. Default: 100. |

**Example:**
```json
{ "task": "discovery", "region": "Austin, TX", "limit": 80 }
```

### Enrichment Request
| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | "enrichment" |
| `limit` | integer | No | Max leads to enrich per run. Default: 30. |
| `status_filter` | string | No | "pending" / "partial" / "failed". Default: "pending". |
| `source` | string | No | Filter by source ("maps" / "permits" / null for all). |
| `min_score` | integer | No | Only enrich leads with pilot_fit_score >= N. Default: 0. |

**Example:**
```json
{ "task": "enrichment", "limit": 20, "status_filter": "pending", "source": "maps" }
```

### Lead Scoring Request
| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | "score" |
| `lead_id` | integer | No | Score a single lead by ID. If omitted, scores all unscored leads. |
| `limit` | integer | No | Max leads to score per run. Default: 100. |

**Example:**
```json
{ "task": "score", "lead_id": 147 }
```

### Signal Monitoring Request
| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | "monitor_hiring" / "monitor_permits" / "monitor_reviews" |
| `states` | array | No | ["FL", "TX"] — states to monitor. Defaults vary by signal type. |
| `limit` | integer | No | Max records to process. Default: 50. |

---

## Outputs

### Discovery Output
```json
{
  "task": "discovery",
  "region": "Austin, TX",
  "stats": {
    "total": 87,
    "inserted": 62,
    "duplicates": 25
  },
  "sample_leads": [
    {
      "company_name": "Hill Country Builders LLC",
      "city": "Austin",
      "state": "TX",
      "phone": "512-555-0142",
      "website": "hillcountrybuilders.com",
      "maps_url": "https://maps.google.com/?cid=...",
      "source": "google_maps"
    }
  ],
  "market_signal": "Dense market — 87 GCs found in 6 search queries. High competition suggests active construction environment.",
  "next_step": "Run enrichment on 62 new leads",
  "duration_s": 41.2,
  "cost_usd": 0.00
}
```

### Enrichment Output
```json
{
  "task": "enrichment",
  "stats": {
    "processed": 20,
    "email_found": 5,
    "partial": 8,
    "failed": 7,
    "hit_rate_pct": 25
  },
  "enriched": [
    {
      "lead_id": 147,
      "company_name": "Hill Country Builders LLC",
      "contact_name": "Mike Renfro",
      "contact_title": "Owner",
      "contact_email": "mike@hillcountrybuilders.com",
      "method": "direct_scrape",
      "confidence": 0.9
    }
  ],
  "partial": [
    {
      "lead_id": 148,
      "company_name": "Lone Star Contracting",
      "contact_name": "Sarah Patel",
      "contact_linkedin": "linkedin.com/in/sarahpatel-lsc",
      "method": "linkedin",
      "confidence": 0.8,
      "note": "Email not found — LinkedIn only"
    }
  ],
  "failed": [
    {
      "lead_id": 149,
      "company_name": "Travis County Concrete",
      "last_step_tried": "email_pattern",
      "failure_reason": "Could not verify contact name from any source"
    }
  ],
  "duration_s": 188.4,
  "cost_usd": 0.00
}
```

### Lead Score Output
```json
{
  "task": "score",
  "lead_id": 147,
  "company_name": "Hill Country Builders LLC",
  "scores": {
    "fit": 22,
    "fit_reason": "GC with 25-50 employees, uses QuickBooks — strong match for Jake CFO pilot",
    "pain_signal": 18,
    "pain_signal_reason": "3.8 Google rating with 2 reviews mentioning billing disputes",
    "timeliness": 20,
    "timeliness_reason": "Hired Controller on LinkedIn 2 weeks ago — actively addressing finance function",
    "enrichment": 25,
    "enrichment_reason": "Direct email, verified contact name, phone available"
  },
  "total": 85,
  "tier": "HOT",
  "flagged_to_todd": true
}
```

---

## Error Handling

| Scenario | Scout's Response |
|---|---|
| Region not recognized by Google Maps | Returns `error: "REGION_NOT_FOUND"`, suggests nearest valid region |
| Playwright circuit breaker tripped | Returns `error: "BROWSER_UNAVAILABLE"`, includes circuit breaker reset instructions |
| Bing API key missing or rate-limited | Skips Bing step, notes in enrichment output, continues with remaining steps |
| Lead already enriched (status != 'pending') | Skips with `"skipped": "already_enriched"` note, does not overwrite |
| Company name is too generic to enrich (e.g., "Construction LLC") | Returns `"failed"` with `failure_reason: "company_name_too_generic"` |
| DB insert fails due to constraint | Returns individual lead failure note, continues batch |

---

## SLA
| Operation | Expected Runtime | Token Budget | Cost Target |
|---|---|---|---|
| Discovery (100 companies) | 30–90 seconds | 0 (no LLM) | $0.00 |
| Enrichment (30 leads) | 3–10 minutes | 0–500 tokens (pattern scoring only) | $0.00–$0.01 |
| Lead Scoring (100 leads) | < 30 seconds | 0 (rule-based, no LLM) | $0.00 |
| Signal Monitoring | 1–5 minutes | 0–1,000 tokens | $0.00–$0.02 |

---

## Versioning
- **Contract Version:** 1.0.0
- **Breaking Change Policy:** Changes to the lead object schema (adding/removing fields in `enriched` or `partial` arrays) are breaking changes. Increment major version and update Quill and Todd's context expectations.
- **Non-breaking changes:** Adding new task types, adding optional fields, changing SLA targets.
- **Last Updated:** 2026-03-13
