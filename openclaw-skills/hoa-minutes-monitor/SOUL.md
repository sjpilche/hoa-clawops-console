# HOA Minutes Monitor (Agent 2)

**Agent ID:** `hoa-minutes-monitor`
**Purpose:** Scan HOA meeting minutes and score for capital project signals
**Cost:** ~$0.50/run (LLM for PDF parsing if needed), $15/month for 30 daily runs
**Schedule:** Daily (3:00 AM)

---

## Mission

Systematically scan HOA meeting minutes from websites and document portals. Score each document using keyword-based system to identify HOAs with urgent capital needs (HOT), active projects (WARM), or early signals (WATCH).

---

## Keyword Scoring System

### Tier 1 Keywords (10 points each) - URGENT SIGNALS
- special assessment
- capital improvement plan
- reserve fund deficiency / underfunded reserves
- SB 326, SB 721 (California balcony inspections)
- milestone inspection, SIRS (Florida post-Surfside)
- loan, financing, HOA loan
- engineering report
- insurance non-renewal / cancellation

### Tier 2 Keywords (5 points each) - ACTIVE PROJECTS
- roof replacement, re-roof, reroofing
- exterior painting, repaint
- parking lot, asphalt replacement, repaving
- repiping, pipe replacement
- pool resurfacing, pool deck replacement
- elevator replacement, modernization
- balcony repair, deck repair, waterproofing
- reserve study

### Tier 3 Keywords (2 points each) - EARLY SIGNALS
- contractor bids, RFP, request for proposal
- deferred maintenance
- budget shortfall
- cost estimate, construction estimate
- vendor selection
- major repair, capital project

### Negative Keywords (-5 points each)
- fully funded reserves, 100% funded
- project completed, paid in full
- no special assessment, no assessment needed

---

## Scoring Thresholds

- **HOT** (≥15 points): Immediate outreach within 24 hours
- **WARM** (8-14 points): Outreach within 72 hours
- **WATCH** (3-7 points): Monitor next meeting in 30 days
- **ARCHIVE** (0-2 points): Re-scan in 90 days

---

## Input Parameters

```json
{
  "limit": 20,
  "state": "FL",
  "priority_min": 5
}
```

**Defaults:**
- `limit`: 20 HOAs per run
- `state`: null (all states)
- `priority_min`: 5 (only scan HOAs with priority ≥5)

**Selection logic:**
- Prioritizes HOAs never scanned OR last scanned >30 days ago
- Orders by priority DESC, unit_count DESC
- Scans HOAs most likely to have urgent needs first

---

## Process Flow

### 1. Select HOAs to Scan
```sql
SELECT id FROM hoa_communities
WHERE status = 'active'
  AND priority >= 5
  AND (last_scanned IS NULL OR last_scanned < datetime('now', '-30 days'))
ORDER BY priority DESC, unit_count DESC
LIMIT 20
```

### 2. Fetch Minutes
- **Mock mode** (current): Generate realistic test minutes
- **Real mode** (future): Scrape from website/portal using Playwright

### 3. Score Minutes
- Extract all text from document
- Search for Tier 1/2/3 keywords
- Calculate total score
- Extract quotes around keywords
- Detect project types (roofing, painting, paving, etc.)
- Generate plain English summary

### 4. Save Scan Results
Save to `minutes_scans` table:
- Document metadata (URL, date, title, word count)
- Scoring (total_score, tier, matched keywords)
- Signal quotes (exact text around keywords)
- Signal summary (2-3 sentence human-readable)
- Project types detected

### 5. Create Scored Leads (HOT/WARM only)
If tier = HOT or WARM, create record in `scored_leads` table:
- Link to HOA and scan
- Score and tier
- Estimated loan size (unit_count × $2,000-$10,000)
- Project types
- Signal summary
- Flags: special_assessment_mentioned, compliance_trigger
- Status: contact_enrichment_status = 'pending'

---

## Output Example

**HOT Lead (69 points):**
```
🔥 Waterfront HOA, Sarasota, FL (173 units)

SCORE: 69 points (HOT)

SIGNALS DETECTED:
  Tier 1: special assessment, reserve fund deficiency
  Tier 2: roof replacement, balcony inspection
  Project Types: roofing, balcony_deck

SUMMARY:
"Waterfront HOA has URGENT capital need signals: special assessment
and reserve fund deficiency. Score: 69 points."

ESTIMATED LOAN SIZE: $346,000 - $1,730,000

NEXT STEPS:
  1. Agent 3 (Contact Enricher) will find board contact info
  2. Agent 4 (Outreach Drafter) will write personalized emails
  3. Human approves email drafts
  4. Outreach sent within 24 hours
```

---

## Success Metrics

**Daily Run (20 HOAs scanned):**
- Expected HOT leads: 1-3 (5-15% of scans)
- Expected WARM leads: 2-4 (10-20% of scans)
- Expected WATCH leads: 2-4 (10-20% of scans)
- Expected ARCHIVE: 11-15 (55-75% of scans)

**Monthly Totals:**
- Scanned: 600 HOAs
- HOT leads: 30-90 (target: 50)
- WARM leads: 60-120 (target: 80)
- Total actionable leads: 90-210 (target: 130)

**Conversion Funnel:**
- HOT leads → Contact enrichment: 80-90% success
- Enriched → Email drafted: 100%
- Email sent → Response: 3-5%
- Response → Qualified: 30%
- Qualified → Closed: 20%

**Expected deals per month:** 1-2 from HOT leads alone

---

## Special Handler

This agent uses a **special handler** (Node.js with optional LLM):

**File:** `server/services/hoaMinutesMonitor.js`
**Function:** `scanMultipleHOAs(params)`

**Why special handler:**
- Keyword scoring is deterministic (no LLM needed for scoring)
- Only uses LLM for complex PDF parsing ($0.50 per run)
- Faster and cheaper than full OpenClaw run

**Cost breakdown:**
- Mock mode: $0 (keyword scoring only)
- Real mode: $0.50/run (LLM for PDF parsing) × 30 runs/month = $15/month

---

## Testing

```bash
# Scan 10 HOAs (mock mode)
node scripts/run-minutes-monitor.js --limit=10

# Scan Florida HOAs only
node scripts/run-minutes-monitor.js --limit=20 --state=FL

# Scan high-priority HOAs only
node scripts/run-minutes-monitor.js --limit=20 --priority_min=8

# View HOT leads in database
node -e "const initSqlJs = require('sql.js'); const fs = require('fs'); (async () => { const SQL = await initSqlJs(); const db = new SQL.Database(fs.readFileSync('hoa_leads.sqlite')); const stmt = db.prepare('SELECT * FROM scored_leads WHERE tier = \"HOT\" ORDER BY score DESC'); while (stmt.step()) { const row = stmt.getAsObject(); console.log(row); } stmt.free(); db.close(); })();"
```

---

## Database Tables

### minutes_scans
Logs every scan attempt (success or failure):
- hoa_id, scan_date, minutes_url, minutes_date
- total_score, tier, matched keywords
- signal_quotes (JSON array of keyword + quote)
- signal_summary (plain English)
- scan_status (success, no-docs-found, portal-gated, error)

### scored_leads
HOT/WARM/WATCH leads only:
- hoa_id, scan_id, score, tier
- estimated_loan_size_min/max
- project_types (JSON array)
- signal_summary
- contact_enrichment_status (pending, in-progress, complete, failed)
- outreach_status (pending, queued, drafted, sent, replied)

---

## Next Agent

Once HOT/WARM leads are identified, **Agent 3 (Contact Enricher)** automatically:
1. Finds board president or property manager email (zero-cost methods)
2. Saves to `contacts` table
3. Triggers Agent 4 (Outreach Drafter)

**Trigger:** Runs when `scored_leads.tier IN ('HOT', 'WARM')` AND `contact_enrichment_status = 'pending'`

---

Last updated: February 17, 2026
Agent Status: ✅ Operational
Cost: $0 (mock mode) → $15/month (real mode with LLM)
