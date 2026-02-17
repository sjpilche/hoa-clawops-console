# HOA Lead Agent - Quick Start Guide

## ✅ Setup Complete!

Your HOA lead generation agent is fully built and ready to run. Here's what you need to do:

## 🚀 Start Using It

### Step 1: Configure Environment

```bash
cd hoa-lead-agent
cp .env.example .env
```

Then edit `.env` with your credentials:

```bash
# Required for email notifications
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

# Required for enrichment (get free API keys)
HUNTER_API_KEY=your_hunter_key       # https://hunter.io/api_keys
CLEARBIT_API_KEY=your_clearbit_key   # https://dashboard.clearbit.com/api

# Optional - configure schedule
CRON_SCHEDULE=0 */6 * * *            # Every 6 hours
ENABLE_EMAIL=true
MAX_LEADS_PER_RUN=100
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Run the Agent

**Test run** (runs once, then exits):
```bash
npm run dev
```

**Production mode** (runs continuously on schedule):
```bash
npm run build
npm start
```

## 📊 What It Does

1. **Scrapes 4 data sources**:
   - Google Maps (HOA management companies)
   - BBB.org (verified businesses)
   - LinkedIn (optional - company pages)
   - State licensing databases (FL, CA, TX)

2. **Enriches leads** with:
   - Email addresses (Hunter.io)
   - Phone numbers (Clearbit)
   - Contact names and titles
   - Company size estimates

3. **Scores leads** 0-10 based on:
   - Email availability (+3)
   - Contact info (+3)
   - Company size (+4)
   - Website/phone/LinkedIn (+1 each)

4. **Stores everything**:
   - `leads.db` - SQLite database (auto-deduplicates)
   - `exports/leads_export_YYYY-MM-DD.csv` - Daily exports
   - `logs/agent.log` - Full activity log

5. **Sends email summary** after each run with:
   - New leads count
   - Total database size
   - High-value leads (score ≥ 8)
   - Breakdown by state
   - CSV export link

## 🎯 Expected Results

**Per 6-hour run**:
- ~150-300 leads collected
- ~30-50 new leads added (after deduplication)
- ~50-80 leads enriched with emails
- ~20-40 high-value leads (score ≥ 8)

**Target states** (configurable in `src/index.ts`):
- Florida (FL)
- California (CA)
- Texas (TX)
- Georgia (GA)
- North Carolina (NC)
- Arizona (AZ)

## 📧 Email Notifications

You'll receive an email after each run that looks like this:

```
🏢 HOA Leads: 42 new, 287 total

RUN STATISTICS
--------------
Leads Found:    156
New Leads:      42
Updated:        114
Enriched:       67

DATABASE OVERVIEW
-----------------
Total Leads:    287
High-Value:     54 (score >= 8)

LEADS BY STATE
--------------
FL: 102
CA: 89
TX: 54
GA: 25
NC: 12
AZ: 5

EXPORT
------
exports/leads_export_2026-02-17.csv
```

## 🛠️ Useful Commands

```bash
# Check setup status
npm run check

# Run once (no cron)
RUN_ON_STARTUP=true CRON_SCHEDULE="" npm run dev

# View live logs
tail -f logs/agent.log

# Check database stats
sqlite3 leads.db "SELECT COUNT(*) FROM leads;"
sqlite3 leads.db "SELECT state, COUNT(*) FROM leads GROUP BY state;"

# Export latest CSV
ls -lt exports/*.csv | head -1
```

## ⚠️ Important Notes

1. **API Costs**:
   - Hunter.io: Free tier = 25 requests/month
   - Clearbit: Free tier = 50 requests/month
   - For production, you'll need paid plans

2. **LinkedIn Scraper**:
   - Disabled by default (requires credentials)
   - Violates LinkedIn ToS - use at your own risk
   - Consider LinkedIn Sales Navigator API instead

3. **Rate Limits**:
   - Agent has built-in delays to avoid overwhelming servers
   - Adjust `MAX_LEADS_PER_RUN` in .env if needed

4. **Gmail App Password**:
   - NOT your regular Gmail password
   - Generate at: https://myaccount.google.com/apppasswords
   - Requires 2-Step Verification enabled

## 🐛 Troubleshooting

**"npm run dev" fails**:
```bash
npm install
npm run check
```

**No leads collected**:
- Check logs: `tail -f logs/agent.log`
- Verify internet connection
- Test individual scrapers

**Email not sending**:
- Verify Gmail App Password (NOT account password)
- Check GMAIL_USER and GMAIL_APP_PASSWORD in .env
- Enable 2-Step Verification on Gmail

**Hunter/Clearbit errors**:
- Verify API keys are correct
- Check free tier limits
- Review logs for specific errors

## 📚 Next Steps

1. Run the agent for a few cycles
2. Review the data quality in `leads.db`
3. Adjust `TARGET_STATES` if needed (edit `src/index.ts`)
4. Set up your outreach workflow
5. Export high-value leads: 
   ```sql
   sqlite3 leads.db "SELECT * FROM leads WHERE signal_score >= 8 ORDER BY signal_score DESC;"
   ```

## 📞 Support

- Full documentation: [README.md](./README.md)
- Project structure: See `src/` directory
- Logs: `logs/agent.log`

---

**Built for HOA Project Funding**  
February 2026
