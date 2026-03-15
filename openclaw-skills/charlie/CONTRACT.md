# Charlie — Input/Output Contract
*Contract Version: 1.0.0*

---

## Inputs

### Build Request
| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | "build" |
| `spec` | string | Yes | Plain-language description of what to build |
| `complexity` | string | No | "LOW" / "MEDIUM" / "HIGH" — Charlie will estimate if omitted |
| `files_to_modify` | array | No | Known files to change — Charlie will identify additional ones |
| `deadline` | string | No | ISO 8601 or relative |
| `approved` | boolean | No | If `true`, skip PROPOSAL and go straight to build. Default: false. |

**Example (standard — requires PROPOSAL first):**
```json
{
  "task": "build",
  "spec": "Add a new special handler for jake_permit_scanner that calls server/services/jakePermitScanner.js and returns a summary with permits_scanned, leads_inserted, and counties_checked",
  "complexity": "MEDIUM"
}
```

**Example (pre-approved — skip PROPOSAL):**
```json
{
  "task": "build",
  "spec": "Create migration 033 that adds a permit_date column (TEXT) to cfo_leads if it doesn't already exist",
  "approved": true
}
```

### Bug Fix Request
| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | "fix" |
| `symptom` | string | Yes | What the user or system observed going wrong |
| `error_msg` | string | No | Exact error message if available |
| `file_hint` | string | No | File where the bug likely lives |
| `run_id` | string | No | Run ID from the runs table for context |

**Example:**
```json
{
  "task": "fix",
  "symptom": "jake_contact_enricher returns silent 500 after processing the first lead",
  "error_msg": "column 'output' does not exist",
  "file_hint": "server/routes/runs.js"
}
```

### Refactor Request
| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | "refactor" |
| `target` | string | Yes | File path or service name to refactor |
| `goal` | string | Yes | What the refactor should achieve |
| `constraints` | array | No | What must NOT change (API surface, DB schema, etc.) |

### Agent Scaffold Request
| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | "scaffold" |
| `agent_name` | string | Yes | Slug name (e.g., "jake-permit-scanner") |
| `group` | string | Yes | Agent group (e.g., "jake-pipeline") |
| `description` | string | Yes | One-line description |
| `special_handler` | string | No | Handler key in SPECIAL_HANDLERS, if applicable |
| `openclaw_id` | string | No | Defaults to agent_name |

---

## Outputs

### PROPOSAL Output
```json
{
  "type": "PROPOSAL",
  "feature_name": "jake_permit_scanner special handler",
  "what_it_does": "Wires the existing jakePermitScanner.js service into the runs pipeline via a special handler. Accepts county and limit params. Returns permit count, lead insert count, and county list.",
  "files_to_create": [
    "server/services/jakePermitScanner.js — scraper service (if not yet present)"
  ],
  "files_to_modify": [
    "server/routes/runs.js — add jake_permit_scanner to SPECIAL_HANDLERS"
  ],
  "db_changes": "none",
  "dependencies": "Playwright (already installed), cfo_leads table (exists)",
  "complexity": "LOW",
  "risks": "County portal HTML structure may change; scraper uses selectors that could break",
  "env_vars_needed": [],
  "estimated_runtime": "< 20 minutes",
  "waiting_for": "none — ready to build on approval"
}
```

### DELIVERY Output
```json
{
  "type": "DELIVERY",
  "feature_name": "jake_permit_scanner special handler",
  "status": "COMPLETE",
  "files_created": [
    {
      "path": "server/services/jakePermitScanner.js",
      "description": "Playwright scraper for FL/TX county permit portals. Exports runPermitScanner({ counties, limit })."
    }
  ],
  "files_modified": [
    {
      "path": "server/routes/runs.js",
      "description": "Added jake_permit_scanner to SPECIAL_HANDLERS object (lines 387-401)."
    }
  ],
  "db_migration": null,
  "how_to_test": [
    "node -e \"require('./server/services/jakePermitScanner').runPermitScanner({ limit: 5 }).then(console.log)\"",
    "POST /api/runs/{run_id}/confirm with a run whose agent has special_handler: 'jake_permit_scanner'"
  ],
  "known_limitations": [
    "Hillsborough County portal requires JavaScript rendering — uses Playwright, not fetch",
    "Travis County TX portal is not yet supported — returns empty array for TX"
  ],
  "next": "Todd: route to Ralph for code QA"
}
```

### BUG REPORT Output
```json
{
  "type": "BUG_REPORT",
  "description": "Silent 500 when jake_contact_enricher tries to update the runs table",
  "root_cause": "Handler uses `output` column in UPDATE statement. Column is named `result_data` in the runs table schema.",
  "location": "server/routes/runs.js:line 247",
  "fix": "Replace `output=?` with `result_data=?` in the UPDATE runs SET statement",
  "side_effects": "None — result_data column exists and is the correct target",
  "severity": "HIGH",
  "one_line_diff": "- `UPDATE runs SET output=?` → + `UPDATE runs SET result_data=?`"
}
```

---

## Error Handling

| Scenario | Charlie's Response |
|---|---|
| Spec is ambiguous or missing a key requirement | Returns `type: "CLARIFICATION_NEEDED"` with one specific question |
| Build requires a secret not in .env.local | PROPOSAL includes `env_vars_needed` array; flags to Steve before proceeding |
| Migration number already used | PROPOSAL notes conflict and suggests next available number |
| Bug root cause cannot be determined from available info | Returns `type: "INVESTIGATION_NEEDED"` with list of log/DB queries that would isolate it |
| Request would require dropping a table | Returns `type: "ESCALATION"` — routes to Steve, does not proceed |

---

## SLA
| Operation | Expected Runtime | Token Budget | Cost Target |
|---|---|---|---|
| PROPOSAL (any complexity) | < 60 seconds | 1,500 tokens | < $0.02 |
| Build — LOW complexity | < 20 minutes (human clock) | 4,000 tokens | < $0.05 |
| Build — MEDIUM complexity | < 45 minutes | 8,000 tokens | < $0.10 |
| Build — HIGH complexity | < 2 hours | 16,000 tokens | < $0.20 |
| Bug Report | < 30 seconds | 1,000 tokens | < $0.01 |
| Agent Scaffold (4 files) | < 5 minutes | 6,000 tokens | < $0.08 |

---

## Versioning
- **Contract Version:** 1.0.0
- **Breaking Change Policy:** Changes to the PROPOSAL or DELIVERY JSON structure that would break Todd's routing logic are breaking changes. Increment major version.
- **Non-breaking changes:** Adding new task types, adding optional fields to outputs, expanding how_to_test instructions.
- **Last Updated:** 2026-03-13
