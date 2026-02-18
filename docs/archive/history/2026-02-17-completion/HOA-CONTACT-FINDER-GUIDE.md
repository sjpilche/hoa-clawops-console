# HOA Contact Finder — Setup & Testing Guide

## 🎯 What We Built

A **lead generation agent** that scrapes public sources to find HOA board member contact information for your HOA Project Funding business.

### Features
- ✅ Search HOAs by city/state (California only in Phase 1)
- ✅ Extract contact info (name, email, phone, address, unit count)
- ✅ Data validation & confidence scoring
- ✅ Duplicate detection via fingerprinting
- ✅ Export to CSV
- ✅ Mock data mode for testing
- ✅ Full UI integration

### Architecture
- **Backend**: Node.js special handler (no LLM, deterministic scraping)
- **Database**: SQLite (2 new tables: `hoa_contacts`, `hoa_search_history`)
- **Frontend**: React page at `/hoa-leads`
- **Cost**: $0 per search (no API calls)

---

## 📦 Installation

### 1. Run the Seed Script

This creates the agent, runs the database migration, and sets everything up:

```bash
node scripts/seed-hoa-contact-finder.js
```

Expected output:
```
📦 Running database migration...
✅ Migration complete
✅ Agent created: hoa-contact-finder
✅ Created directory: openclaw-skills/hoa-contact-finder

📊 Database stats:
   HOA contacts: 0
   Search history: 0

🎉 Done! HOA Contact Finder is ready.
```

### 2. Restart the Server

```bash
npm run dev
```

This starts:
- Express API on port 3001
- Vite frontend on port 5174

---

## 🧪 Testing (Mock Data Mode)

### Step 1: Navigate to HOA Leads Page

1. Open http://localhost:5174
2. Log in (admin@clawops.local / changeme123)
3. Click **"HOA Contacts"** in the sidebar

You should see an empty state with a "Search for HOAs" button.

### Step 2: Run a Search

1. Click **"New Search"** button
2. Enter search parameters:
   - **City**: San Diego
   - **State**: CA (only option)
   - **Zip Code**: (leave blank or enter 92101)
3. Click **"Search"**

### Step 3: View Results

The search runs in mock mode by default (generates 10 fake contacts). After 2-3 seconds:

- Stats cards update (total contacts, with email, with phone, avg confidence)
- Contact cards appear in a grid
- Each card shows:
  - HOA name
  - Contact person & title
  - Email (clickable mailto link)
  - Phone (clickable tel link)
  - Address
  - Unit count
  - Management company
  - Confidence score (60-95%)
  - Status badge (New)

### Step 4: Update Contact Status

1. Click **"Edit"** on any contact card
2. Change status: New → Contacted → Qualified
3. Add notes: "Spoke with John, interested in $500K roof project"
4. Click **"Save"**

Changes persist in the database.

### Step 5: Filter Contacts

Use the filters at the top:
- **City filter**: Type "San" to filter by city name
- **Status dropdown**: Filter by New / Contacted / Qualified / Disqualified

### Step 6: Export to CSV

1. Click **"Export CSV"** button (top right)
2. Downloads: `hoa-contacts-2026-02-17.csv`
3. Open in Excel/Google Sheets

---

## 🔍 API Endpoints

All endpoints require authentication.

### Search for HOAs
```http
POST /api/runs/:runId/confirm
```

Create run via:
```http
POST /api/agents/hoa-contact-finder/run
Body: {
  "message": "{\"city\":\"San Diego\",\"state\":\"CA\",\"use_mock\":true}"
}
```

### List Contacts
```http
GET /api/hoa-contacts?status=new&city=San&limit=50&offset=0
```

Query params:
- `status`: new | contacted | qualified | disqualified | all
- `city`: Filter by city name (partial match)
- `state`: Filter by state (default: CA)
- `min_confidence`: Minimum confidence score (0-100)
- `limit`: Results per page (default: 50)
- `offset`: Pagination offset (default: 0)

### Get Statistics
```http
GET /api/hoa-contacts/stats
```

Returns:
- Total contacts
- Breakdown by status
- Breakdown by state/city
- Avg confidence score
- Contacts with email/phone
- Recent search history

### Update Contact
```http
PATCH /api/hoa-contacts/:id
Body: {
  "status": "contacted",
  "notes": "Follow up next week"
}
```

### Export CSV
```http
GET /api/hoa-contacts/export/csv?status=new
```

### Get Search History
```http
GET /api/hoa-contacts/search-history/list?limit=20
```

---

## 🗄️ Database Schema

### `hoa_contacts` Table
```sql
CREATE TABLE hoa_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hoa_name TEXT NOT NULL,
  entity_number TEXT,
  contact_person TEXT,
  title TEXT,
  email TEXT,
  phone TEXT,
  property_address TEXT,
  city TEXT NOT NULL,
  state TEXT DEFAULT 'CA',
  zip TEXT,
  unit_count INTEGER,
  management_company TEXT,
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  confidence_score INTEGER DEFAULT 50,
  status TEXT DEFAULT 'new',
  notes TEXT,
  fingerprint TEXT NOT NULL,
  scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_contacted_at DATETIME
);
```

### `hoa_search_history` Table
```sql
CREATE TABLE hoa_search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  search_params TEXT NOT NULL,
  results_count INTEGER DEFAULT 0,
  new_contacts INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running',
  error_message TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);
```

---

## 🚀 Production Mode (Real Scrapers)

**WARNING**: Phase 1 real scrapers are NOT implemented yet. Current implementation generates mock data.

To enable real scraping (when ready):

1. Set `use_mock: false` in search params
2. Implement actual scraper functions in `server/services/hoaContactScraper.js`:
   - `scrapeCASOS()` — California Secretary of State
   - `scrapeCACM()` — CA Association of Community Managers

3. Consider adding:
   - Playwright for JavaScript-rendered pages
   - Proxy rotation for large-scale scraping
   - CAPTCHA solving service (if needed)

---

## 🛠️ Troubleshooting

### "Agent not found" error
→ Run: `node scripts/seed-hoa-contact-finder.js`

### "No agents" in UI after login
→ Open DevTools console and paste:
```javascript
localStorage.setItem('clawops_token', '<your_token>');
location.reload();
```

### Routes return 404
→ Make sure you registered the routes in `server/index.js`:
```javascript
const hoaContactsRoutes = require('./routes/hoaContacts');
app.use('/api/hoa-contacts', hoaContactsRoutes);
```

### Search hangs/fails
→ Check server logs: `npm run dev` terminal
→ Verify agent config has `special_handler: 'hoa_contact_scraper'`

### Duplicate contacts from same search
→ Expected behavior! Fingerprint prevents duplicates across searches
→ If getting too many duplicates, check fingerprint logic in `hoaContactScraper.js`

### CSV export is empty
→ Make sure you have contacts in the database
→ Run a search first
→ Check browser network tab for API errors

---

## 📁 File Structure

```
server/
├── db/
│   └── migrations/
│       └── 013_hoa_contacts.sql          # Database schema
├── routes/
│   ├── runs.js                           # Special handler integration
│   └── hoaContacts.js                    # API endpoints
├── services/
│   └── hoaContactScraper.js              # Scraping logic
└── index.js                              # Route registration

src/
├── pages/
│   └── HoaLeadsPage.jsx                  # Frontend UI
├── lib/
│   └── constants.js                      # Navigation config
└── App.jsx                               # Route config

scripts/
└── seed-hoa-contact-finder.js            # Setup script

openclaw-skills/
└── hoa-contact-finder/
    └── SOUL.md                           # Agent documentation
```

---

## 🔮 Phase 2 Roadmap

### Additional States
- **Colorado**: State HOA registry (public API)
- **Florida**: DBPR condominiums database
- **Texas**: County appraisal districts
- **Nevada**: Secretary of State business search

### Advanced Features
- Email verification API (check deliverability)
- LinkedIn enrichment (find contact info)
- Auto-qualification scoring (project size, urgency)
- Scheduled searches (daily/weekly scans)
- Lead pipeline CRM integration

### Technical Improvements
- Playwright for JavaScript sites
- Proxy rotation for scale
- Better duplicate detection (fuzzy matching)
- Historical tracking (contact changes over time)

---

## ✅ Success Criteria

You should now be able to:
- ✅ Navigate to /hoa-leads in UI
- ✅ Run a search for "San Diego, CA"
- ✅ See 10 mock HOA contacts appear
- ✅ Update contact status and notes
- ✅ Filter by status/city
- ✅ Export contacts to CSV
- ✅ View statistics dashboard

---

## 🆘 Support

Questions? Check:
1. Server logs: `npm run dev` terminal output
2. Browser console: F12 → Console tab
3. Database: `sqlite3 data/clawops.db` → `.tables` → `SELECT * FROM hoa_contacts;`
4. Agent config: Database → `SELECT * FROM agents WHERE id = 'hoa-contact-finder';`

---

## 🎉 You're Ready!

The HOA Contact Finder is live and working with mock data. When you're ready to scrape real data, implement the actual scrapers in `server/services/hoaContactScraper.js` and set `use_mock: false`.

Happy lead hunting! 🏘️💰
