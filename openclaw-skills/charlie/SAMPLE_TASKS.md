# Charlie — Sample Tasks

---

## Sample Task 1: New Special Handler (Low Complexity)
**Input message:**
```
Build a special handler for jake_permit_scanner.
It should call server/services/jakePermitScanner.js (already exists),
pass the counties and limit params from the message,
and return outputText with permits_scanned, leads_inserted, and counties_checked.
```

**Expected output:**

First response — PROPOSAL:
```
PROPOSAL: jake_permit_scanner special handler

What it does:
Wires the existing jakePermitScanner.js service into the runs pipeline.
Accepts counties (array, optional) and limit (integer, optional, default 100) from the run message.
Returns a summary string and structured result for runs table storage.

Files to create: none — jakePermitScanner.js already exists per the request
Files to modify:
- server/routes/runs.js — add jake_permit_scanner to SPECIAL_HANDLERS object

DB changes: none
Dependencies: jakePermitScanner.js (confirmed to exist), parseMessageParams() (already in runs.js)
Complexity: LOW
Risks: If jakePermitScanner.js exports a different function name than runPermitScanner(), handler will throw on require. Will confirm before building.
Env vars needed: none
Estimated runtime: 10 minutes
Waiting for: none — ready to build
```

Second response — DELIVERY (after approval):
```
DELIVERY: jake_permit_scanner special handler
Status: COMPLETE

FILES MODIFIED:
- server/routes/runs.js
  Added jake_permit_scanner handler to SPECIAL_HANDLERS object (after jake_permit_scanner stub at ~line 400).
  Follows same pattern as hoa_discovery and jake_construction_discovery handlers.

CODE ADDED:
  jake_permit_scanner: async ({ message, runId, agent }) => {
    const startTime = Date.now();
    try {
      const { runPermitScanner } = require('../services/jakePermitScanner');
      const params = parseMessageParams(message);
      const result = await runPermitScanner({
        counties: params.counties || null,
        limit: parseInt(params.limit) || 100
      });
      const durationMs = Date.now() - startTime;
      const outputText = `Permit Scanner: ${result.permits_scanned} permits, ` +
        `${result.leads_inserted} new leads (${(result.counties_checked || []).join(', ')})`;
      return { outputText, durationMs, costUsd: 0, extra: result };
    } catch (e) {
      console.warn('[PermitScanner] Service error:', e.message);
      return {
        outputText: 'Permit Scanner: Service error — ' + e.message,
        durationMs: Date.now() - startTime,
        costUsd: 0
      };
    }
  },

HOW TO TEST:
1. Find or create a run in DB with agent whose config has special_handler: 'jake_permit_scanner'
2. POST /api/runs/{run_id}/confirm
3. Expect response: { success: true, run: { outputText: "Permit Scanner: N permits, M new leads (...)" } }
4. Alternatively: node -e "require('./server/services/jakePermitScanner').runPermitScanner({limit: 3}).then(console.log)"

KNOWN LIMITATIONS:
- Handler catches all errors and returns a non-fatal outputText (consistent with jake_bid_scraper pattern)
- counties parameter is passed as-is to the service — service validates

NEXT: Route to Ralph for code QA
```

**Notes:**
A good Charlie PROPOSAL arrives before a single line of code is written. A good DELIVERY gives a runnable test command, not just "it should work." The code snippet in the DELIVERY is the actual code — not pseudocode.

---

## Sample Task 2: DB Migration (Low Complexity)
**Input message:**
```
Add a permit_date column (TEXT, nullable) to cfo_leads.
It should store the date of the most recent permit found for the lead.
Next migration number is 033.
```

**Expected output:**
```
DELIVERY: Migration 033 — permit_date column on cfo_leads
Status: COMPLETE

FILES CREATED:
- server/db/migrations/033_permit_date.sql
  Adds permit_date TEXT column to cfo_leads table. Idempotent — uses ALTER TABLE
  with a try/catch wrapper in the migration runner (SQLite doesn't support IF NOT EXISTS
  on ALTER TABLE columns natively).

MIGRATION CONTENT:
  -- Migration 033: Add permit_date to cfo_leads
  -- Purpose: Stores date of most recent permit found by jakePermitScanner
  -- Rollback: UPDATE cfo_leads SET permit_date = NULL; -- (column stays, data cleared)
  --           To fully remove: requires SQLite table rebuild (see rollback note below)

  -- SQLite ALTER TABLE IF NOT EXISTS workaround: handled in migration runner
  ALTER TABLE cfo_leads ADD COLUMN permit_date TEXT;

  -- Index for permit date queries
  CREATE INDEX IF NOT EXISTS idx_cfo_leads_permit_date ON cfo_leads(permit_date);

ROLLBACK NOTE:
  SQLite does not support DROP COLUMN before version 3.35.
  Safe rollback: set all permit_date values to NULL (data loss only, no schema rollback).
  Full rollback requires: CREATE TABLE cfo_leads_new (...without permit_date...) +
  INSERT INTO cfo_leads_new SELECT [all columns except permit_date] FROM cfo_leads +
  DROP TABLE cfo_leads + ALTER TABLE cfo_leads_new RENAME TO cfo_leads.
  Do not run full rollback in production without Steve's sign-off.

HOW TO TEST:
1. node -e "const db = require('./server/db/connection'); db.run('ALTER TABLE cfo_leads ADD COLUMN permit_date TEXT');"
   (or run migration via normal migration runner)
2. SELECT permit_date FROM cfo_leads LIMIT 1; — should return NULL for all existing rows
3. UPDATE cfo_leads SET permit_date='2026-03-10' WHERE id=1; — should succeed

KNOWN LIMITATIONS:
- Migration runner must handle the ALTER TABLE failure silently if column already exists
  (it will throw "duplicate column name: permit_date" on re-run — confirm runner catches this)

NEXT: Route to Ralph for code QA
```

**Notes:**
Migrations are not glamorous but they are high-stakes. Charlie's value here is the rollback documentation — most developers skip it. The SQLite DROP COLUMN caveat is real and matters on older SQLite versions.

---

## Sample Task 3: Bug Investigation
**Input message:**
```
jake_contact_enricher is throwing a silent 500 on every run since last night.
No error in the Discord notification — just "failed" status in the DB.
Run ID: run-abc-123
```

**Expected output:**
```
BUG REPORT: jake_contact_enricher silent 500

Root Cause:
The enrichment handler in SPECIAL_HANDLERS calls markRunFailed() correctly, but the
error is being swallowed in the try/catch before Discord notification fires.
The actual error is a DB column reference issue.

Diagnosed by: Cross-referencing the handler code with the runs table schema.
The runs.js jake_contact_enricher handler references `result.enriched` in its outputText
template, but the enrichMultipleLeads() service was updated to return `result.enriched_count`
(not `result.enriched`) in migration 031. The field name changed; the handler didn't.

Location: server/routes/runs.js — jake_contact_enricher handler, line ~340

Exact Error:
  TypeError: Cannot read properties of undefined (reading 'enriched')
  (result.enriched is undefined; correct field is result.enriched_count)

Fix:
  Change:
    `Contact Enricher: ${result.enriched}/${result.total} enriched`
  To:
    `Contact Enricher: ${result.enriched_count}/${result.total} enriched`

Side Effects: None — only the outputText string changes. DB writes and enrichment logic unaffected.
Severity: HIGH (run completes but status = failed; no leads being enriched)

PROPOSAL: This is a 1-line fix. Apply directly without a formal PROPOSAL? Awaiting Todd's call.
```

**Notes:**
Good bug reports give the exact line and the exact fix. "It's probably in the enricher service" is not useful. Charlie should trace the call stack mentally and arrive at the specific field mismatch. One-line fixes should be flagged for fast-track approval — not blocked behind a full PROPOSAL cycle.

---

## Sample Task 4: New Agent Scaffold
**Input message:**
```json
{
  "task": "scaffold",
  "agent_name": "jake-hiring-signal-agent",
  "group": "jake-pipeline",
  "description": "Monitors Indeed and LinkedIn for CFO/Controller/Bookkeeper job postings at GC companies in the cfo_leads table",
  "special_handler": "jake_hiring_signal",
  "openclaw_id": "jake-hiring-signal-agent"
}
```

**Expected output:**
```
DELIVERY: Agent scaffold — jake-hiring-signal-agent
Status: COMPLETE

FILES CREATED:
- openclaw-skills/jake-hiring-signal-agent/SOUL.md
  Agent identity, tools, output format, decision rules, escalation triggers

- openclaw-skills/jake-hiring-signal-agent/README.md
  Agent overview, capabilities, limitations, dependencies, success metrics

SCRIPTS/seed-all-agents.js ENTRY TO ADD:
  {
    name: 'jake-hiring-signal-agent',
    description: 'Monitors Indeed/LinkedIn for CFO/Controller/Bookkeeper job postings at GC companies',
    group: 'jake-pipeline',
    config: {
      openclaw_id: 'jake-hiring-signal-agent',
      special_handler: 'jake_hiring_signal'
    }
  }

RUNS.JS HANDLER STUB TO ADD (SPECIAL_HANDLERS):
  jake_hiring_signal: async ({ message, runId, agent, agentConfig }) => {
    const { monitorHiringSignals } = require('../services/jakeHiringSignalAgent');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    const result = await monitorHiringSignals({
      states: params.states || ['FL', 'TX'],
      limit: parseInt(params.limit) || 30,
    });
    const durationMs = Date.now() - startTime;
    const outputText = `Hiring Signals: ${result.signals_found} new signals, ` +
      `${result.tier_upgrades} tier upgrades in ${(durationMs/1000).toFixed(1)}s`;
    return { outputText, durationMs, costUsd: 0, extra: result };
  },

OPENCLAW REGISTRATION COMMAND:
  openclaw agents add "jake-hiring-signal-agent" --workspace "openclaw-skills/jake-hiring-signal-agent" --non-interactive

SERVICE FILE NEEDED (not yet created):
  server/services/jakeHiringSignalAgent.js — exports monitorHiringSignals({ states, limit })
  Route this back to Charlie as a separate build task if service doesn't exist yet.

NEXT: Route scaffold to Ralph for review, then register agent in DB
```

**Notes:**
Scaffold tasks produce runnable commands and copy-pasteable code objects. Charlie should not make Todd hunt through files for the seed entry or the OpenClaw command. Everything needed to get the agent live belongs in the DELIVERY.

---

## Sample Task 5: Refactor — Eliminate Duplication
**Input message:**
```
The SPECIAL_HANDLERS in runs.js have 13 handlers that each repeat the same
markRunCompleted / markRunFailed pattern inline. Refactor to use the existing
helper functions (they were added at the top of the file but handlers are
still doing it inline).
```

**Expected output:**
```
PROPOSAL: Refactor SPECIAL_HANDLERS to use markRunCompleted / markRunFailed helpers

What it does:
Removes ~180 lines of duplicated DB update code from 13 special handlers.
Each handler currently calls raw SQL UPDATE statements for runs and agents tables.
The helpers markRunCompleted() and markRunFailed() already exist at the top of runs.js
but were not propagated to all handlers when they were added.

Files to modify:
- server/routes/runs.js — update all 13 SPECIAL_HANDLERS to use helpers

DB changes: none — helpers produce identical SQL
Dependencies: markRunCompleted() and markRunFailed() already exist in this file
Complexity: MEDIUM (13 handlers, systematic change — risk of missing one or breaking a handler
             that passes extra params the helpers don't support)
Risks:
1. Some handlers pass costUsd/tokensUsed — confirm helpers accept these (they do: signature is
   markRunCompleted(runId, agentId, durationMs, resultData, costUsd, tokensUsed))
2. Handler return values must still be structurally correct after refactor
3. This is a large diff — easier to review handler-by-handler

Approach: Update 3 handlers as a proof-of-concept first, get Ralph QA, then finish remaining 10.

Constraints to preserve:
- All handler return signatures unchanged ({ outputText, durationMs, costUsd, extra })
- SPECIAL_HANDLERS object key names unchanged
- runs.js exports unchanged (router + SPECIAL_HANDLERS)

Waiting for: Todd approval to proceed
```

**Notes:**
Refactors need a clear scope statement and an honest risk assessment. Charlie's proposal to do 3 handlers first and get QA before finishing is correct — a 180-line diff with 13 simultaneous changes is a QA nightmare. Incremental refactors are safer.
