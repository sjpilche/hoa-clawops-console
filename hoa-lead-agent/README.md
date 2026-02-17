# HOA Management Company Lead Generation Agent

Automated lead generation system for discovering and enriching HOA (Homeowners Association) management companies across the United States.

## 🎯 Features

- **Multi-Source Scraping**:
  - Google Maps business listings
  - Better Business Bureau (BBB.org)
  - LinkedIn company pages
  - State licensing databases (FL, CA, TX)

- **Automated Enrichment**:
  - Email discovery via Hunter.io API
  - Company data via Clearbit API
  - Contact name and title extraction
  - Signal scoring algorithm (0-10 scale)

- **Smart Storage**:
  - SQLite database with automatic deduplication
  - CSV export with timestamps
  - Full audit trail with Winston logging

- **Scheduled Execution**:
  - Configurable cron scheduling (default: every 6 hours)
  - Email summaries via Gmail SMTP
  - Graceful error handling and recovery

## 📋 Requirements

- **Node.js** 18+ (with TypeScript support)
- **npm** or **yarn**
- **API Keys**:
  - [Hunter.io](https://hunter.io/api_keys) (email discovery)
  - [Clearbit](https://dashboard.clearbit.com/api) (company enrichment)
  - [Gmail App Password](https://myaccount.google.com/apppasswords) (notifications)
- **Optional**:
  - LinkedIn account (for LinkedIn scraper - not recommended for production)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd hoa-lead-agent
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
# Required
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
HUNTER_API_KEY=your_hunter_key
CLEARBIT_API_KEY=your_clearbit_key

# Optional
ENABLE_EMAIL=true
CRON_SCHEDULE=0 */6 * * *
MAX_LEADS_PER_RUN=100
```

### 3. Run the Agent

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm run build
npm start
```

**One-time run** (no cron):
```bash
RUN_ON_STARTUP=true CRON_SCHEDULE="" npm run dev
```

## 📂 Project Structure

```
hoa-lead-agent/
├── src/
│   ├── index.ts                 # Main orchestrator
│   ├── scrapers/
│   │   ├── googleMaps.ts        # Google Maps scraper
│   │   ├── bbb.ts               # BBB.org scraper
│   │   ├── linkedin.ts          # LinkedIn scraper
│   │   └── stateLicensing.ts    # State licensing databases
│   ├── enrichment/
│   │   ├── hunter.ts            # Hunter.io email discovery
│   │   └── clearbit.ts          # Clearbit company enrichment
│   ├── storage/
│   │   ├── db.ts                # SQLite database layer
│   │   └── export.ts            # CSV export module
│   ├── notifications/
│   │   └── email.ts             # Gmail notification module
│   └── utils/
│       ├── logger.ts            # Winston logger
│       └── scorer.ts            # Lead scoring algorithm
├── logs/                        # Application logs
├── exports/                     # CSV exports (auto-created)
├── leads.db                     # SQLite database (auto-created)
├── .env                         # Environment variables
└── README.md
```

## 📊 Database Schema

```sql
CREATE TABLE leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,
  website TEXT,
  phone TEXT,
  primary_email TEXT,
  contact_name TEXT,
  contact_title TEXT,
  contact_linkedin_url TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  number_of_hoas_managed INTEGER DEFAULT 0,
  source TEXT,
  signal_score INTEGER DEFAULT 0,
  date_found TEXT NOT NULL,
  outreach_status TEXT DEFAULT 'new',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint on company_name + website for deduplication
CREATE UNIQUE INDEX idx_unique_company ON leads(company_name, website);
```

## 🎯 Signal Scoring Algorithm

Leads are scored 0-10 based on data quality:

| Criteria | Points |
|----------|--------|
| Has email address | +3 |
| Has contact name | +3 |
| Manages 10+ HOAs | +4 |
| Has website | +1 |
| Has phone | +1 |
| Has LinkedIn profile | +1 |

**High-value leads** = Score ≥ 8

## 📧 Email Notifications

After each run, you'll receive a summary email with:
- Total leads found vs. new leads added
- Enrichment success rate
- Database statistics (total leads, high-value count)
- Breakdown by state
- Link to CSV export

### Setting Up Gmail App Password

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable 2-Step Verification (required)
3. Go to [App Passwords](https://myaccount.google.com/apppasswords)
4. Generate a password for "Mail"
5. Copy the 16-character password to `.env` as `GMAIL_APP_PASSWORD`

## 🔍 Data Sources

### 1. Google Maps
- **Target**: "HOA management" + city searches
- **Coverage**: FL, CA, TX, GA, NC, AZ (5 major cities each)
- **Rate**: ~30-50 leads per state
- **Data**: Name, address, phone

### 2. BBB.org
- **Target**: 3 business categories per state
- **Coverage**: All 50 states
- **Rate**: ~20-40 leads per state
- **Data**: Name, city, state, website

### 3. LinkedIn (Optional)
- **Target**: Company pages with "HOA management" keyword
- **Coverage**: All states
- **Rate**: ~10-30 leads per state
- **Data**: Company name, website, LinkedIn URL
- ⚠️ **Warning**: LinkedIn may block automated access. Use with caution.

### 4. State Licensing
- **Target**: Licensed Community Association Managers
- **Coverage**: FL (complete), CA/TX (placeholders)
- **Rate**: ~50-200 leads per state
- **Data**: Name, license number, city, state

## 🛠️ Customization

### Change Target States

Edit `src/index.ts`:

```typescript
const TARGET_STATES = ['FL', 'CA', 'TX', 'GA', 'NC', 'AZ'];
```

### Change Schedule

Edit `.env`:

```bash
# Every 6 hours (default)
CRON_SCHEDULE=0 */6 * * *

# Daily at 9 AM
CRON_SCHEDULE=0 9 * * *

# Weekdays at 9 AM
CRON_SCHEDULE=0 9 * * 1-5

# Every 12 hours
CRON_SCHEDULE=0 */12 * * *
```

### Disable Email Notifications

Edit `.env`:

```bash
ENABLE_EMAIL=false
```

## 📈 Monitoring

### View Logs

```bash
tail -f logs/agent.log
```

### Check Database Stats

```bash
sqlite3 leads.db "SELECT COUNT(*) as total FROM leads;"
sqlite3 leads.db "SELECT state, COUNT(*) as count FROM leads GROUP BY state ORDER BY count DESC;"
sqlite3 leads.db "SELECT COUNT(*) as high_value FROM leads WHERE signal_score >= 8;"
```

### Export Latest CSV

```bash
ls -lt exports/*.csv | head -1
```

## 🐛 Troubleshooting

### "No leads collected"
- Check internet connection
- Verify target URLs are still valid
- Review logs for specific scraper errors

### "Gmail authentication failed"
- Ensure 2-Step Verification is enabled
- Use App Password, NOT account password
- Check GMAIL_USER and GMAIL_APP_PASSWORD in .env

### "Hunter.io rate limit exceeded"
- Free tier: 25 requests/month
- Paid tier: 500-10,000 requests/month
- Reduce MAX_LEADS_PER_RUN or upgrade plan

### "Puppeteer timeout errors"
- Increase timeout in scraper configs
- Check if target sites have changed structure
- Try running with `RUN_ON_STARTUP=true` to test scrapers individually

## 📜 License

MIT

## 🤝 Contributing

This is a private project, but feel free to fork and adapt for your own use.

## ⚠️ Legal & Ethical Use

- Respect robots.txt and Terms of Service
- Use LinkedIn scraper at your own risk (violates ToS)
- Don't abuse rate limits or overwhelm target servers
- Only use collected data for legitimate business purposes
- Comply with GDPR, CCPA, and other data privacy laws
