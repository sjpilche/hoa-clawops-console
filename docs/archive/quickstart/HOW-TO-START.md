# 🚀 How to Start Your Dashboard

## The Easy Way (Windows)

### Double-click this file:
```
START-DASHBOARD.bat
```

That's it! The script will:
1. Start the backend API server (port 3001)
2. Start the frontend dashboard (port 5174)
3. Show you the URL to open

### Then open your browser to:
```
http://localhost:5174
```

---

## The Manual Way (Any OS)

Open your terminal in this directory and run:

```bash
npm run dev
```

Then open: **http://localhost:5174**

---

## What You'll See

Once the dashboard loads:

1. **Login** (if not already logged in)
2. **Look in the sidebar** - you'll see:
   - Dashboard
   - Domains
   - Agents
   - Hierarchy
   - Extensions
   - Tools
   - Scheduler
   - Monitor
   - Results
   - **Lead Gen** ← NEW! 👥
   - Audit Log
   - Costs
   - Help
   - Settings

3. **Click "Lead Gen"** to see your Community Engagement dashboard

---

## First Time Setup

The first time you run this:
- ✅ Database migration runs automatically (creates `lg_engagement_queue` and `lg_community_accounts` tables)
- ✅ API routes are registered
- ✅ Dashboard is ready to use

---

## Test It Out

Once you're in the Lead Gen dashboard, you can test it with this curl command:

```bash
curl -X POST http://localhost:3001/api/lead-gen/networker/queue \
  -H "Content-Type: application/json" \
  -d "{\"platform\":\"reddit\",\"community\":\"r/HOA\",\"post_url\":\"https://reddit.com/r/HOA/test123\",\"post_title\":\"Our HOA announced $15K special assessment\",\"post_summary\":\"Need advice on emergency roof repair funding\",\"post_author\":\"test_user\",\"post_age_hours\":2,\"relevance_score\":92,\"recommended_template\":\"special_assessment_distress\",\"draft_response\":\"I completely understand the frustration — special assessments feel like a gut punch. Here are some options your HOA board should consider...\",\"includes_link\":false}"
```

Refresh the dashboard and you'll see the test opportunity appear!

---

## Troubleshooting

### Port 5174 already in use?
Edit `vite.config.js` and change:
```javascript
server: {
  port: 5175, // or any available port
```

### Can't connect to API?
Make sure the backend is running on port 3001:
```bash
curl http://localhost:3001/api/health
```

Should return: `{"status":"healthy"}`

### Database tables not created?
Check if migration ran:
```bash
sqlite3 data/clawops.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'lg_%';"
```

Should show: `lg_engagement_queue` and `lg_community_accounts`

---

## Stop the Servers

Press **Ctrl+C** in the terminal where servers are running.

---

## Files Created

This Lead Gen Networker implementation added:

### Backend:
- `server/db/migrations/007_lead_gen_module.sql` - Database schema
- `server/routes/lead-gen.js` - 6 API endpoints

### Frontend:
- `src/pages/LeadGenPage.jsx` - Dashboard UI
- Updated `src/lib/constants.js` - Added navigation
- Updated `src/components/layout/Sidebar.jsx` - Added icon

### Agent:
- `openclaw-skills/hoa-networker/SOUL.md` - Agent identity (7,000+ words)
- `openclaw-skills/hoa-networker/README.md` - Documentation
- `openclaw-skills/hoa-networker/SKILL.md` - Technical specs
- `openclaw-skills/hoa-networker/schedule.json` - Automation schedules

### Scripts:
- `START-DASHBOARD.bat` - Windows startup script (this file)
- `HOW-TO-START.md` - This guide

---

## Next Steps

See **LEAD-GEN-QUICK-START.md** for:
- Testing the workflow (approve/edit/reject)
- Creating sample data
- Registering the agent
- Setting up community accounts
- Enabling automated scanning

---

**You're all set! Double-click `START-DASHBOARD.bat` and go to http://localhost:5174** 🚀
