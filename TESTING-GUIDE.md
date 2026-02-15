# Lead Gen Networker - Testing Guide

## 🚀 Quick Test

### Step 1: Start the Dashboard
```
Double-click: START-DASHBOARD.bat
```

Wait for:
```
✅ Server running on http://localhost:3001
   Frontend:  http://localhost:5174
```

### Step 2: Create Test Data
```
Double-click: TEST-LEAD-GEN.bat
```

This creates:
- 3 sample engagement opportunities (Reddit, Facebook, LinkedIn)
- 1 sample tracked community
- Various relevance scores to test filtering

### Step 3: View in Dashboard
```
Open: http://localhost:5174/lead-gen
```

You should see:
- **Stats**: 3 Pending Review, 0 Posted Today, 0 Total Clicks
- **Queue**: 3 opportunities with different platforms
- **Communities**: 1 tracked community (r/HOA)

### Step 4: Test Workflow

**Approve an opportunity:**
1. Click green "Approve" button
2. Switch to "Approved" tab
3. See it moved from Pending

**Edit a response:**
1. Click "Edit" button on an opportunity
2. Modify text in the right sidebar
3. Add notes
4. Click "Save Changes"
5. See updates reflected

**Reject an opportunity:**
1. Click red "Reject" button (X icon)
2. Switch to "Rejected" tab
3. Confirm it's there

**Post a response:**
1. Go to "Approved" tab
2. Click "Post Now" button
3. Switch to "Posted" tab
4. Confirm status changed

---

## 📊 About Schedules

You mentioned **"no schedule shows up in the dashboard"** - here's why and how to fix it:

### Why Schedules Aren't Showing

The `schedule.json` file in `openclaw-skills/hoa-networker/` is a **specification template**, not active schedules.

Schedules need to be **created manually** in the dashboard or via API.

### How to Add Schedules (Manual)

1. **Open Dashboard** → Navigate to **/schedule**

2. **Add New Schedule** for each automation:

   **Schedule 1: Reddit Scanning**
   - **Name**: Reddit HOA Scan
   - **Cron**: `0 */2 * * *` (every 2 hours)
   - **Agent**: hoa-networker
   - **Prompt**: "Scan r/HOA, r/condoassociation, r/realestate for engagement opportunities. Score relevance 1-100 and return top 10."

   **Schedule 2: Facebook Scanning**
   - **Name**: Facebook Groups Scan
   - **Cron**: `0 6,10,14,18,22 * * *` (5x daily)
   - **Agent**: hoa-networker
   - **Prompt**: "Scan Facebook HOA groups for engagement opportunities. Return top 10 by relevance."

   **Schedule 3: LinkedIn Scanning**
   - **Cron**: `0 8,16 * * 1-5` (8am, 4pm weekdays)
   - **Agent**: hoa-networker
   - **Prompt**: "Scan LinkedIn CAI groups for engagement opportunities."

   **Schedule 4: Post Approved Responses**
   - **Cron**: `*/30 * * * *` (every 30 minutes)
   - **Agent**: hoa-networker
   - **Prompt**: "Check for approved responses in queue. Post to platforms and update status."

   **Schedule 5: Track Engagement**
   - **Cron**: `0 20 * * *` (daily 8pm)
   - **Agent**: hoa-networker
   - **Prompt**: "Update engagement metrics (likes, replies, clicks) for posted responses. Flag hot leads."

   **Schedule 6: Forums Scanning**
   - **Cron**: `0 9 * * *` (daily 9am)
   - **Agent**: hoa-networker
   - **Prompt**: "Scan BiggerPockets and Quora for HOA financing questions."

### Automated Schedule Creation Script (Future)

You could create a script to auto-import schedules from `schedule.json`:

```bash
# Would need to be built - not currently implemented
npm run schedules:import openclaw-skills/hoa-networker/schedule.json
```

---

## 🧪 API Testing (Advanced)

### Test Endpoints Directly

**List Opportunities:**
```bash
curl http://localhost:3001/api/lead-gen/networker/queue
```

**Filter by Status:**
```bash
curl http://localhost:3001/api/lead-gen/networker/queue?status=pending_review
```

**Get Stats:**
```bash
curl http://localhost:3001/api/lead-gen/networker/stats
```

**List Communities:**
```bash
curl http://localhost:3001/api/lead-gen/networker/communities
```

**Approve an Opportunity:**
```bash
curl -X PATCH http://localhost:3001/api/lead-gen/networker/queue/1 \
  -H "Content-Type: application/json" \
  -d '{"action":"approve"}'
```

**Post an Approved Response:**
```bash
curl -X POST http://localhost:3001/api/lead-gen/networker/queue/1/post
```

---

## 🎯 What's Working vs What's Not

### ✅ Working Now:
- Database tables (lg_engagement_queue, lg_community_accounts)
- 6 API endpoints (all functional)
- Dashboard UI (queue, stats, communities, approve/edit/reject)
- Navigation integration
- Manual workflow (create → review → approve → post)

### ⚠️ Not Working Yet (By Design):
- **Agent Registration**: hoa-networker not registered with OpenClaw
- **Automated Scanning**: No schedules running (need manual creation in dashboard)
- **Platform APIs**: Reddit, Facebook, LinkedIn not connected
- **Actual Posting**: POST endpoint marks as "posted" but doesn't actually post
- **Engagement Tracking**: No automated metrics collection

### 🔧 Next Steps to Make It Fully Functional:

1. **Register Agent** (required before schedules work)
   ```bash
   npx openclaw agent create \
     --id hoa-networker \
     --name "HOA Networker" \
     --workspace ./openclaw-skills/hoa-networker
   ```

2. **Add Platform API Credentials**
   - Reddit API (PRAW): client_id, client_secret
   - Facebook Graph API: page_access_token
   - LinkedIn API: OAuth credentials

3. **Create Schedules** (via dashboard /schedule page)

4. **Implement Posting Logic**
   - Update POST endpoint to actually call platform APIs
   - Handle rate limiting, errors, retries

5. **Implement Tracking**
   - Scheduled job to fetch engagement metrics
   - UTM tracking for clicks

---

## 🐛 Troubleshooting

### Dashboard shows empty queue
- Run `TEST-LEAD-GEN.bat` to create sample data
- Check API: `curl http://localhost:3001/api/lead-gen/networker/queue`
- Check database: Tables created in schema.sql

### API returns errors
- Check server logs in terminal
- Verify database connection
- Ensure server is running on port 3001

### Changes not reflected
- Hard refresh browser (Ctrl+Shift+R)
- Check browser console for errors
- Restart server if needed

### Port 5174 already in use
- Edit `vite.config.js` and change port
- Update `START-DASHBOARD.bat` with new port

---

## 📈 Success Criteria

After running tests, you should have:

- [x] Dashboard accessible at http://localhost:5174/lead-gen
- [x] "Lead Gen" visible in sidebar
- [x] 3 opportunities in Pending Review tab
- [x] Stats showing: 3 pending, 0 posted, 0 clicks
- [x] 1 community in "Tracked Communities" section
- [x] Ability to approve/edit/reject opportunities
- [x] Status changes reflected immediately

---

**You're all set for manual testing!** The system works end-to-end for manual workflow. Automation requires agent registration and schedule creation.
