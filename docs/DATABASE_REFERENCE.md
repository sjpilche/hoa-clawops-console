# Empire Capital — Central Database Reference

Single source of truth for all lead, outreach, and CRM data across every business line.

Last updated: 2026-03-25

---

## Azure SQL Connection

**Server:** `empirecapital.database.windows.net`
**Database:** `empcapmaster2`
**Port:** 1433 (SQL Server default)
**Encryption:** Required (TLS)

Credentials are in each project's `.env.local`:
```
AZURE_SQL_SERVER=empirecapital.database.windows.net
AZURE_SQL_DATABASE=empcapmaster2
AZURE_SQL_USER=CloudSA1f77fc9b
AZURE_SQL_PASSWORD=(see .env.local)
```

---

## Connection Examples

### Node.js (mssql)
```javascript
const sql = require('mssql');
const pool = await sql.connect({
  server: 'empirecapital.database.windows.net',
  database: 'empcapmaster2',
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: false },
});
const leads = await pool.request().query("SELECT * FROM crm_leads WHERE domain = 'hoa'");
```

### Python (pyodbc)
```python
import pyodbc
conn = pyodbc.connect(
    'DRIVER={ODBC Driver 18 for SQL Server};'
    'SERVER=empirecapital.database.windows.net;'
    'DATABASE=empcapmaster2;'
    'UID=CloudSA1f77fc9b;'
    'PWD=<password>;'
    'Encrypt=yes;TrustServerCertificate=no'
)
cursor = conn.cursor()
cursor.execute("SELECT * FROM crm_leads WHERE domain = 'jake' AND status = 'queued'")
```

### Python (SQLAlchemy — async)
```python
from sqlalchemy.ext.asyncio import create_async_engine
engine = create_async_engine(
    "mssql+aioodbc://CloudSA1f77fc9b:<password>@empirecapital.database.windows.net/empcapmaster2"
    "?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=no"
)
```

### ADO.NET / SSMS / Azure Data Studio
```
Server=empirecapital.database.windows.net,1433;
Database=empcapmaster2;
User Id=CloudSA1f77fc9b;
Password=<password>;
Encrypt=True;TrustServerCertificate=False;
```

### Power BI / Excel
Data > Get Data > SQL Server > `empirecapital.database.windows.net` > `empcapmaster2`

---

## Business Lines & Domains

| Domain | Brand | Product | Sender Email | Audience |
|--------|-------|---------|-------------|----------|
| `jake` | Jake CFO | Construction finance / back-office automation | JimMcGuire@jakecfo.com | GCs, subcontractors, construction CFOs |
| `hoa` | HOA Project Funding | Capital for community projects | spilcher@hoaprojectfunding.com | HOA boards, property managers, community managers |
| `owen` | Owen CFO | PM company financial services | JimMcGuire@owencfo.com | Property management companies (same audience as HOA, different pitch) |
| `data-rehab` | Data Rehab | CRM/ERP data cleanup | JimMcguire@getdatarehab.com | Construction + PM companies with dirty data |
| `fence` | Fence Outreach | Fencing contractor leads | (TBD) | Fence companies, HOA fence projects |
| `bottlequote` | BottleQuote | Packaging marketplace | cjohnson@quotedockpro.com | Supplement brands needing bottles/closures |

---

## CRM Tables (OpenClaw Console)

These tables power the multi-domain outreach pipeline for Jake, HOA, Owen, Data Rehab, and Fence.

### crm_leads
The master lead table. Every prospect across every domain.

| Column | Type | Description |
|--------|------|-------------|
| id | INT (identity) | Primary key (Azure auto-increment) |
| old_id | INT | Original SQLite ID (for migration mapping) |
| domain | VARCHAR(20) | Business line: jake, hoa, owen, data-rehab, fence |
| company_name | NVARCHAR(255) | Company name |
| contact_name | NVARCHAR(200) | Primary contact |
| contact_title | NVARCHAR(200) | Title (CFO, Property Manager, etc.) |
| contact_email | VARCHAR(255) | Verified email address |
| contact_linkedin | VARCHAR(500) | LinkedIn profile URL |
| phone | VARCHAR(50) | Phone number |
| website | VARCHAR(500) | Company website |
| city, state | VARCHAR | Location |
| erp_type | VARCHAR(50) | ERP system (Vista, Sage300, QBE) — Jake-specific |
| pilot_fit_score | INT | 0-100 fit score |
| status | VARCHAR(30) | `new` > `queued` > `contacted` > `replied` > `pilot` > `closed_won` / `closed_lost` / `unsubscribed` |
| source | VARCHAR(50) | How discovered: livempaint, apollo_miner, google_maps_discovery, dbpr_scrape |
| source_agent | VARCHAR(30) | Which agent sourced it: jake, hoa, owen, cfo, data-rehab |
| enrichment_status | VARCHAR(30) | `pending` > `in_progress` > `enriched` > `failed` |
| enrichment_method | VARCHAR(50) | apollo, web_search, manual |
| urgency_score | INT | 0-100 urgency |
| cadence_active | BIT | Is this lead in an active outreach cadence? |
| last_touch_number | INT | How many touches sent (out of 12) |
| revenue_stage | VARCHAR(30) | `discovered` > `engaged` > `qualified` > `proposal` > `closed` |
| engagement_score | INT | Aggregate engagement metric |
| created_at, updated_at | DATETIME2 | Timestamps (UTC) |

**Key indexes:** `domain`, `status`, `enrichment_status`, `contact_email`, `source_agent`, `(domain, status)`

### crm_outreach_sequences
Email drafts and sent messages.

| Column | Type | Description |
|--------|------|-------------|
| id | INT (identity) | Primary key |
| lead_id | INT | FK to crm_leads.id |
| domain | VARCHAR(20) | Business line |
| source_agent | VARCHAR(30) | Which brand persona drafted this |
| email_subject | NVARCHAR(500) | Subject line |
| email_body | NVARCHAR(MAX) | Full email body |
| status | VARCHAR(30) | `draft` > `approved` > `sent` > `replied` / `bounced` / `cancelled` |
| qa_status | VARCHAR(30) | Ralph QA result: `passed`, `failed`, `flagged` |
| qa_score | INT | QA score 0-100 |
| delivery_status | VARCHAR(30) | SendGrid result: `delivered`, `bounced`, `failed` |
| sent_at, replied_at | DATETIME2 | Delivery timestamps |
| sequence_position | INT | Touch number in cadence (1-12) |

### crm_cadence_touches
Every single outreach touch across all channels.

| Column | Type | Description |
|--------|------|-------------|
| id | INT (identity) | Primary key |
| lead_id | INT | FK to crm_leads.id |
| domain | VARCHAR(20) | Business line |
| product | VARCHAR(30) | Brand name |
| touch_number | INT | 1-12 in the cadence |
| channel | VARCHAR(30) | email, linkedin, phone |
| status | VARCHAR(30) | pending, sent, opened, replied |
| sent_at, opened_at, replied_at | DATETIME2 | Timestamps |
| run_id | VARCHAR(100) | Links to agent run that executed this |

### crm_content_pieces
Content library per brand (blog posts, email templates, social posts).

### crm_id_map
Maps old SQLite IDs to new Azure IDs. Used during migration and for cross-referencing.

| Column | Type | Description |
|--------|------|-------------|
| table_name | VARCHAR(50) | e.g. 'crm_leads' |
| old_id | INT | Original SQLite ID |
| new_id | INT | Azure SQL ID |

---

## Collective Brain Tables (same database)

The AI learning system. Agents write here; context is injected before each run.

| Table | Purpose |
|-------|---------|
| `shared_observations` | Agent-to-agent scratchpad (Layer 1) |
| `agent_feedback` | Human approval/rejection signals (Layer 2) |
| `agent_episodes` | Market-specific outcome patterns (Layer 3) |
| `agent_knowledge_base` | Distilled best outputs for RAG (Layer 4) |

---

## Packaging Deal Hunter Tables (separate SQLite — `deals.db`)

BottleQuote / Packaging Deal Hunter uses its own local SQLite database at `packaging-deal-hunter/backend/data/deals.db`. These are NOT in Azure yet.

### leads
| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| company_name | VARCHAR(200) | Brand / company |
| website | VARCHAR(500) | Website |
| segment | VARCHAR(50) | Market segment |
| city, state | VARCHAR | Location |
| product_type | VARCHAR(200) | What they sell |
| packaging_format | VARCHAR(50) | Bottle type needed |
| industry_vertical | VARCHAR(50) | Industry (supplements, beauty, fitness) |
| likely_packaging_needs | TEXT | AI-inferred needs |
| priority_score | INT | 1-5 priority |

### contacts
| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| lead_id | INT | FK to leads |
| contact_name | VARCHAR(200) | Name |
| title | VARCHAR(200) | Title |
| email | VARCHAR(300) | Email |
| phone | VARCHAR(50) | Phone |
| email_source | VARCHAR(20) | hunter, ai_guess, manual |
| relationship_status | VARCHAR(20) | new, contacted, replied, customer |

### opportunities
| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| lead_id | INT | FK to leads |
| contact_id | INT | FK to contacts |
| status | VARCHAR(20) | target, outreach, negotiation, won, lost |
| estimated_value | FLOAT | Deal value |
| next_action | VARCHAR(500) | Next step |

### touchpoints
| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| lead_id | INT | FK to leads |
| touch_type | VARCHAR(30) | cold_email_draft, follow_up_draft, email_sent, reply_received, etc. |
| channel | VARCHAR(20) | email, linkedin, phone |
| subject | VARCHAR(300) | Email subject |
| content | TEXT | Full message content |
| outcome | VARCHAR(30) | no_reply, replied, bounced, meeting_booked |

### Additional PDH Tables
- `packaging_profiles` — AI-inferred packaging specs per lead
- `rfqs` — Request for Quote records
- `rfq_suppliers` — Supplier-RFQ assignments
- `lead_scores` — Scoring model results
- `saved_icps` — Saved Ideal Customer Profiles
- `discovery_queue` — Queued discovery jobs

### PDH Connection
Currently SQLite only:
```
DATABASE_URL=sqlite+aiosqlite:///./data/deals.db
```
Python FastAPI backend with SQLAlchemy async ORM.

### PDH Email Config
```
SENDGRID_API_KEY=(in .env)
SENDGRID_FROM_EMAIL=cjohnson@quotedockpro.com
SENDGRID_FROM_NAME=Charles Johnson
```

---

## Useful Queries

### Lead inventory by domain
```sql
SELECT domain, status, COUNT(*) as cnt
FROM crm_leads
GROUP BY domain, status
ORDER BY domain, cnt DESC;
```

### Leads ready for outreach (enriched + has email + not yet contacted)
```sql
SELECT domain, COUNT(*) as ready
FROM crm_leads
WHERE enrichment_status = 'enriched'
  AND contact_email IS NOT NULL
  AND status IN ('queued', 'new')
GROUP BY domain;
```

### Outreach performance by domain
```sql
SELECT domain, status, COUNT(*) as cnt
FROM crm_outreach_sequences
GROUP BY domain, status
ORDER BY domain, cnt DESC;
```

### Reply rate by domain (last 30 days)
```sql
SELECT
  s.domain,
  COUNT(*) as total_sent,
  SUM(CASE WHEN s.status = 'replied' THEN 1 ELSE 0 END) as replies,
  CAST(SUM(CASE WHEN s.status = 'replied' THEN 1.0 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100 AS DECIMAL(5,2)) as reply_pct
FROM crm_outreach_sequences s
WHERE s.status IN ('sent', 'replied', 'bounced')
  AND s.sent_at >= DATEADD(day, -30, GETUTCDATE())
GROUP BY s.domain;
```

### Cross-reference: find leads that exist in both CRM and PDH
```sql
-- Run against PDH SQLite
SELECT l.company_name, l.city, l.state, c.email
FROM leads l
JOIN contacts c ON c.lead_id = l.id
WHERE l.company_name IN (
  -- paste results from Azure: SELECT DISTINCT company_name FROM crm_leads WHERE domain = 'jake'
);
```

---

## Architecture Overview

```
                    Azure SQL (empirecapital.database.windows.net/empcapmaster2)
                    ===========================================================
                    |                                                           |
                    |  CRM Tables (crm_leads, crm_outreach_sequences, etc.)   |
                    |  Collective Brain (shared_observations, agent_episodes)   |
                    |                                                           |
                    ===========================================================
                         |              |              |              |
                    OpenClaw Console   Power BI    Other Apps    PDH (future)
                    (Node.js/mssql)    (direct)    (any lang)   (Python/pyodbc)
                         |
                    SQLite (local fallback)
                    data/clawops.db
                         |
                    Schedule Runner -> 66 agents -> 4 domain pipelines

    Packaging Deal Hunter (separate)
    ================================
    SQLite: data/deals.db (Python/SQLAlchemy)
    BottleQuote marketplace + supplier outreach
```

---

## Email Infrastructure

| Domain | SPF | DKIM | DMARC | Reply MX |
|--------|-----|------|-------|----------|
| jakecfo.com | include:sendgrid.net | s1/s2 SendGrid | v=DMARC1; p=none | N/A |
| hoaprojectfunding.com | include:sendgrid.net | s1/s2 SendGrid | v=DMARC1; p=none | reply.hoaprojectfunding.com -> mx.sendgrid.net |
| owencfo.com | include:sendgrid.net | (needs s1/s2 setup) | (needs setup) | N/A |
| getdatarehab.com | include:sendgrid.net | (needs s1/s2 setup) | (needs setup) | N/A |
| quotedockpro.com | (check needed) | (check needed) | (check needed) | N/A |

---

## Daily Pipeline Schedule (OpenClaw)

| Time | What | Domain |
|------|------|--------|
| 9:00 AM | Jake Batch Drafter (25 emails) | jake |
| 9:15 AM | HOA Batch Drafter (25 emails) | hoa |
| 9:30 AM | Owen Batch Drafter (25 emails) | owen (shared HOA leads) |
| 9:30 AM | Ralph QA review | all |
| 9:45 AM | Data Rehab Batch Drafter (10 emails) | data-rehab |
| 10:00 AM | Outreach Sender (all approved) | all |
| Every 30 min | Stale-run reaper | ops |
| 11 PM | Dream Team nightly cycle | ops |
| 6:30 AM | Morning briefing | ops |
