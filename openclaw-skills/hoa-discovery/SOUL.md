# HOA Discovery Agent (Agent 1)

**Agent ID:** `hoa-discovery`
**Purpose:** Discover HOA communities from public directories across CA, FL, CO
**Cost:** $0 (Playwright scraping only - no paid APIs)
**Schedule:** Weekly (Sunday 2:00 AM)

---

## Mission

Systematically scrape public HOA directories and registries to build a master database of HOA communities. Focus on high-priority targets: 100+ unit communities with websites and document portals.

---

## Input Parameters

```json
{
  "source": "mock|fl-dbpr|co-dora|ca-sos",
  "state": "CA|FL|CO",
  "limit": 100
}
```

**Examples:**
- `{source: "mock", state: "FL", limit: 20}` - Generate 20 test HOAs
- `{source: "fl-dbpr", limit: 1000}` - Download FL DBPR CSV (25,000+ HOAs)
- `{source: "co-dora", limit: 500}` - Scrape CO DORA registry
- `{source: "ca-sos", limit: 500}` - Search CA Secretary of State

---

## Discovery Sources (Priority Order)

### 1. Florida DBPR Open Data (GOLD MINE)
**URL:** https://opendata.myfloridalicense.com/
**Records:** 25,000+ condos
**Method:** CSV bulk download
**Why Priority:** Post-Surfside laws create urgent capital needs statewide

### 2. Colorado DORA HOA Registry
**URL:** https://dora.colorado.gov/hoa
**Records:** 10,000+ HOAs
**Method:** Web scraping
**Why Priority:** Official state database, current data, aging 2000s developments

### 3. California Secretary of State
**URL:** https://bizfileonline.sos.ca.gov/search/business
**Records:** 5,000+ HOAs
**Method:** Business entity search (Common Interest Development)
**Why Priority:** SB 326/721 compliance drives capital needs

### 4. Management Company Directories
- FirstService Residential
- Associa
- Leland Management (FL)
- Sentry Management (FL)
- Hammersmith Management (CO)

**Why:** One relationship = dozens of HOA clients

---

## Priority Scoring Algorithm

**Base Score:** 5

**Bonuses:**
- Florida HOA: +2 (post-Surfside urgency)
- California HOA: +1 (SB 326/721 compliance)
- 100+ units: +2
- 50-99 units: +1
- Has website: +1

**Cap:** 10 (maximum priority)

**Example:**
- FL HOA, 150 units, has website = 5 + 2 + 2 + 1 = **10** (highest priority)
- CO HOA, 40 units, no website = 5 + 0 + 0 + 0 = **5** (medium priority)

---

## Output

Saves to `hoa_communities` table in `hoa_leads.sqlite`:

```sql
{
  id: 1,
  name: "Pacific Heights HOA",
  state: "FL",
  city: "Fort Lauderdale",
  zip: null,
  county: null,
  unit_count: 150,
  website_url: "https://www.pacificheightshoa.org",
  document_portal_url: "https://www.pacificheightshoa.org/documents",
  management_company: "FirstService Residential",
  management_company_url: null,
  source: "fl-dbpr",
  source_url: "https://opendata.myfloridalicense.com/",
  portal_type: "custom",
  status: "active",
  priority: 10,
  last_scanned: null
}
```

Returns summary:
```json
{
  "success": true,
  "communities_found": 20,
  "communities_added": 20,
  "duplicates_skipped": 0,
  "source": "mock",
  "state": "FL"
}
```

---

## Special Handler

This agent uses a **special handler** (deterministic Node.js code, NOT LLM):

**File:** `server/services/hoaDiscovery.js`
**Function:** `discoverHOAs(params)`

**Why special handler:**
- Web scraping doesn't need AI
- Saves LLM costs ($0 vs $0.10 per run)
- Faster (2 seconds vs 30 seconds)
- More reliable (deterministic results)

---

## Deduplication

**Fingerprint:** MD5 hash of `name|city|state`

**Example:**
- "Pacific Heights HOA|Fort Lauderdale|FL" → `abc123...`
- Duplicate check: `SELECT id FROM hoa_communities WHERE name = ? AND city = ? AND state = ?`

**Result:** Skips duplicates, logs them in summary

---

## Testing

```bash
# Run discovery with mock data
node scripts/run-hoa-discovery.js --source=mock --state=FL --limit=20

# Check database
node -e "const initSqlJs = require('sql.js'); const fs = require('fs'); (async () => { const SQL = await initSqlJs(); const db = new SQL.Database(fs.readFileSync('hoa_leads.sqlite')); const stmt = db.prepare('SELECT COUNT(*) as count FROM hoa_communities'); stmt.step(); console.log('Total HOAs:', stmt.getAsObject().count); stmt.free(); db.close(); })();"

# View HOAs by priority
node -e "const initSqlJs = require('sql.js'); const fs = require('fs'); (async () => { const SQL = await initSqlJs(); const db = new SQL.Database(fs.readFileSync('hoa_leads.sqlite')); const stmt = db.prepare('SELECT name, state, city, unit_count, priority FROM hoa_communities ORDER BY priority DESC LIMIT 10'); while (stmt.step()) { const row = stmt.getAsObject(); console.log(row.priority + ':', row.name + ',', row.city + ',', row.state + ' (' + row.unit_count + ' units)'); } stmt.free(); db.close(); })();"
```

---

## Success Metrics

**Week 1:**
- ✅ 100+ HOAs in database (mock mode)
- ✅ All 3 states represented (CA, FL, CO)
- ✅ Average priority ≥6

**Month 1:**
- ✅ 1,000+ HOAs from FL DBPR bulk download
- ✅ 500+ HOAs from CO DORA
- ✅ 200+ HOAs from CA SOS
- ✅ Total: 1,700+ communities

**Month 2:**
- ✅ 3,000+ total communities
- ✅ 500+ with priority ≥8
- ✅ 100+ with document portals found

---

## Next Agent

Once HOAs are discovered, **Agent 2 (Minutes Monitor)** scans their meeting minutes for capital project signals.

**Trigger:** Daily at 3:00 AM, scans 20 HOAs per session
**Target:** Find 20-30 HOT leads per month

---

Last updated: February 17, 2026
Agent Status: ✅ Operational
Cost: $0/month (zero-cost scraping)
