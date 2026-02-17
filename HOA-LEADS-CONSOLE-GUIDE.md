# 🎯 HOA Leads - View in ClawOps Console

**Status**: ✅ READY TO USE
**Access**: http://localhost:5174/hoa-leads

---

## 🚀 Quick Start

### 1. Start the Console

```bash
cd "c:\Users\SPilcher\OpenClaw2.0 for linux - Copy"
npm run dev
```

This starts:
- **Frontend**: http://localhost:5174
- **API**: http://localhost:3001
- **Trader**: http://localhost:3002

### 2. Login to Console

1. Open http://localhost:5174
2. Login with:
   - Email: `admin@clawops.local`
   - Password: `changeme123`

### 3. View HOA Leads

- Click **"HOA Contacts"** in the sidebar (Building icon 🏢)
- Or navigate directly to: http://localhost:5174/hoa-leads

---

## 📊 What You'll See

### Stats Dashboard

At the top, you'll see 4 key metrics:

1. **Total Leads**: Total number of HOA management companies in database
2. **With Email**: Number of leads with email addresses (% shown)
3. **High-Value**: Leads with confidence score ≥ 80
4. **Avg Score**: Average confidence score across all leads

### Geographic Distribution

A breakdown showing leads by state (AZ, CA, FL, NC, TX)

### Filters

- **State**: Filter by specific state
- **Min Score**: Show only leads above a certain score (e.g., 80)
- **Has Email Only**: Checkbox to show only leads with email addresses
- **Export CSV**: Download filtered results as CSV file

### Leads Table

Columns:
- **Company**: Company name + website link
- **Contact**: Contact person name and title
- **Email**: Clickable mailto link (or "-" if no email)
- **Location**: City, State (+ ZIP if available)
- **Score**: Confidence score out of 100 (color-coded)

### Pagination

- Shows 50 leads per page
- Previous/Next buttons
- Page counter

---

## 🔧 API Endpoints

The console uses these backend endpoints:

### Get All Leads
```
GET /api/hoa-leads?state=CA&has_email=true&min_score=80&limit=50&offset=0
```

### Get Statistics
```
GET /api/hoa-leads/stats
```

### Export CSV
```
GET /api/hoa-leads/export/csv?state=CA&has_email=true&min_score=80
```

### Get Single Lead
```
GET /api/hoa-leads/123
```

### Update Lead
```
PATCH /api/hoa-leads/123
{
  "status": "contacted",
  "notes": "Sent initial email on 2026-02-17"
}
```

---

## 📈 Current Data

Based on latest sync:

```
Total Contacts: 91
├─ With Email: 56 (62%)
├─ High-Value: 52 (57%)
└─ Avg Score: ~67/100

Geographic Distribution:
├─ Arizona (AZ): 19 leads
├─ California (CA): 18 leads
├─ Florida (FL): 18 leads
├─ North Carolina (NC): 18 leads
└─ Texas (TX): 18 leads

Data Source: Azure SQL (empcapmaster2.hoa_contacts)
Source Type: 'hoa_lead_agent' (auto-collected)
```

---

## 💡 Usage Tips

### Filter for High-Value Leads with Emails

1. Set **Min Score**: 80
2. Check **Has Email Only**
3. Click any state to focus on that region

This shows you the **best prospects** ready for immediate outreach.

### Export for CRM

1. Apply your desired filters
2. Click **Export CSV**
3. Import into your CRM or email marketing tool

### Click-to-Email

- Click any email address in the table
- Opens your default email client
- Pre-fills the recipient address

---

## 🔄 Data Updates

The HOA Lead Agent automatically syncs new leads to Azure SQL every 6 hours. The console queries Azure SQL in real-time, so you always see the latest data.

**No manual refresh needed** - just reload the page or navigate back to the page to see updated stats.

---

## 🐛 Troubleshooting

### "Loading..." Never Finishes

**Issue**: Console can't connect to Azure SQL

**Fix**:
1. Check `.env.local` has Azure SQL credentials
2. Verify agent is running: `cd hoa-lead-agent && npm run dev`
3. Check firewall allows connection to `empirecapital.database.windows.net`

### "No leads found"

**Issue**: Database is empty or filters are too restrictive

**Fix**:
1. Clear all filters
2. Run the lead agent: `cd hoa-lead-agent && npm run dev`
3. Wait for agent to complete (~2-3 minutes)
4. Refresh the console page

### Route not found (404)

**Issue**: Server didn't register the route

**Fix**:
1. Stop server: `Ctrl+C` in console terminal
2. Restart: `npm run dev`
3. Wait for "Server running on port 3001" message
4. Reload browser

### Authentication errors

**Issue**: Not logged in or session expired

**Fix**:
1. Navigate to http://localhost:5174/login
2. Login with `admin@clawops.local` / `changeme123`
3. Navigate back to `/hoa-leads`

---

## 📁 Files Added

### Backend API
- **server/routes/hoaLeads.js** - API routes for HOA leads
- **server/index.js** - Updated to register `/api/hoa-leads` route

### Frontend UI
- **src/pages/HOALeadsPage.jsx** - React component for leads page
- **src/App.jsx** - Updated to add `/hoa-leads` route
- **src/lib/constants.js** - Already had "HOA Contacts" nav item

---

## 🎨 UI Preview

```
┌─────────────────────────────────────────────────────────────┐
│ HOA Lead Agent Results                                      │
├─────────────────────────────────────────────────────────────┤
│  [91]        [56]         [52]         [67]                │
│  Total    With Email   High-Value   Avg Score              │
├─────────────────────────────────────────────────────────────┤
│ Geographic: [AZ: 19] [CA: 18] [FL: 18] [NC: 18] [TX: 18]  │
├─────────────────────────────────────────────────────────────┤
│ Filters: [State▼] [Min Score: __] [☑ Has Email] [Export]  │
├─────────────────────────────────────────────────────────────┤
│ Company            │ Contact      │ Email       │ Score    │
│────────────────────┼──────────────┼─────────────┼──────────│
│ Sentry Management  │ David Disco  │ ddisco@...  │ 80/100   │
│ Cedar Management   │ Vernon Kline │ vkline@...  │ 80/100   │
│ ...                │ ...          │ ...         │ ...      │
└─────────────────────────────────────────────────────────────┘
```

---

## ✅ Next Steps

1. **Start the console**: `npm run dev`
2. **Login**: http://localhost:5174
3. **View leads**: Click "HOA Contacts" in sidebar
4. **Filter for high-value**: Min Score: 80 + Has Email
5. **Export**: Click "Export CSV" to download for CRM
6. **Start outreach**: Click email addresses to compose messages

---

**Your 56 decision-makers with emails are now viewable in a beautiful web interface!** 🎉
