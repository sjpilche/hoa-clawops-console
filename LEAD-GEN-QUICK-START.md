# Lead Gen Networker - Quick Start Guide

## ✅ What's Been Built (Phase 2 Complete!)

### Database Layer
- ✅ Migration file: `server/db/migrations/007_lead_gen_module.sql`
- ✅ Two tables created:
  - `lg_engagement_queue` - Tracks all engagement opportunities
  - `lg_community_accounts` - Tracks monitored communities
- ✅ 8 performance indexes created

### API Layer
- ✅ Route file: `server/routes/lead-gen.js`
- ✅ 6 endpoints implemented:
  - `GET /api/lead-gen/networker/queue` - List opportunities
  - `GET /api/lead-gen/networker/queue/:id` - Get single opportunity
  - `PATCH /api/lead-gen/networker/queue/:id` - Approve/reject/edit
  - `POST /api/lead-gen/networker/queue/:id/post` - Post response
  - `GET /api/lead-gen/networker/communities` - List communities
  - `GET /api/lead-gen/networker/stats` - Dashboard metrics
- ✅ Routes registered in `server/index.js`

### Frontend Layer
- ✅ Dashboard page: `src/pages/LeadGenPage.jsx`
- ✅ Features:
  - Engagement Queue with status filtering
  - Quick stats overview (pending, posted today, total clicks)
  - Approve/Edit/Reject actions
  - Edit modal for customizing responses
  - Community performance tracking
  - Platform stats visualization
- ✅ Navigation:
  - Added "Lead Gen" to sidebar (`src/lib/constants.js`)
  - Route registered at `/lead-gen` (`src/App.jsx`)
  - Users icon added to sidebar

### Agent Layer
- ✅ Agent directory: `openclaw-skills/hoa-networker/`
- ✅ Files created:
  - `SOUL.md` (7,000+ words) - Full agent identity, response templates, guidelines
  - `README.md` - Project overview and documentation
  - `SKILL.md` - Technical implementation details
  - `schedule.json` - 6 cron schedules for automation

---

## 🚀 Getting Started

### Step 1: Start the Server

```bash
# Navigate to project directory
cd "c:/Users/SPilcher/OpenClaw2.0 for linux - Copy"

# Install dependencies (if not already done)
npm install

# Start the development server
npm run dev
```

The server will:
- Automatically run the migration (creates lg_* tables)
- Register all API endpoints
- Start on http://localhost:3001

### Step 2: Access the Dashboard

Open your browser to:
```
http://localhost:5173/lead-gen
```

You should see:
- Engagement Queue (currently empty)
- Stats Overview (all zeros - no data yet)
- Status filter tabs
- Community performance section

### Step 3: Test with Sample Data

Let's create a test opportunity to verify everything works:

```bash
# Test API endpoint - Create sample opportunity
curl -X POST http://localhost:3001/api/lead-gen/networker/queue \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "reddit",
    "community": "r/HOA",
    "post_url": "https://reddit.com/r/HOA/test123",
    "post_title": "Our HOA announced $15K special assessment per unit",
    "post_summary": "Need advice on emergency roof repair funding without breaking residents",
    "post_author": "test_user",
    "post_age_hours": 2,
    "relevance_score": 92,
    "recommended_template": "special_assessment_distress",
    "draft_response": "I completely understand the frustration — special assessments feel like a gut punch...",
    "includes_link": false
  }'
```

Refresh the dashboard - you should now see:
- 1 pending review item
- The opportunity card with all details
- Approve/Edit/Reject buttons

### Step 4: Test Workflow

**Approve the opportunity:**
1. Click the "Approve" button (green checkmark)
2. Click "Approved" tab to see it moved
3. Click "Post Now" to mark it as posted

**Edit a response:**
1. Create another test opportunity
2. Click the "Edit" button
3. Modify the response text in the right sidebar
4. Add notes
5. Click "Save Changes"

**Reject an opportunity:**
1. Create another test opportunity
2. Click "Reject" button (red X)
3. Click "Rejected" tab to see it

---

## 📊 Dashboard Features

### Engagement Queue

**Status Filters:**
- **Pending Review** - New opportunities waiting for your approval
- **Approved** - Ready to post, awaiting scheduled posting
- **Posted** - Live on platforms, tracking engagement
- **Rejected** - Declined opportunities (learning data)

**Opportunity Cards Show:**
- Platform badge (Reddit, Facebook, LinkedIn, etc.)
- Relevance score (color-coded: green >80, yellow >60, gray <60)
- Post title and summary
- Draft response preview
- External link to original post
- Quick action buttons

**Right Sidebar:**
- Edit modal (when opportunity selected)
- Top Communities by clicks
- Platform Performance stats

### Stats Overview

**Three Key Metrics:**
1. **Pending Review** - How many need your attention
2. **Posted Today** - Daily activity level
3. **Total Clicks** - Cumulative UTM-tracked clicks

---

## 🤖 Agent Setup (Next Step)

The agent files are created but not yet registered with OpenClaw.

### Register the Agent

```bash
# Register hoa-networker with OpenClaw
npx openclaw agent create \
  --id hoa-networker \
  --name "HOA Networker" \
  --description "Community engagement specialist for lead generation" \
  --workspace ./openclaw-skills/hoa-networker
```

### Test Agent Manually

```bash
# Test scan (without posting)
npx openclaw agent --agent hoa-networker --local \
  --message "Scan r/HOA for the top 5 engagement opportunities related to HOA financing. Return as JSON with relevance scores."
```

### Enable Scheduled Scans

The `schedule.json` file defines 6 automated tasks:

1. **Reddit Scan** - Every 2 hours
2. **Facebook Scan** - 5x daily (6am, 10am, 2pm, 6pm, 10pm)
3. **LinkedIn Scan** - 2x weekdays (8am, 4pm)
4. **Forums Scan** - Daily 9am
5. **Post Approved** - Every 30 minutes
6. **Track Engagement** - Daily 8pm

To enable these, the schedules need to be imported into your scheduler system.

---

## 🎯 What's Left to Do

### Phase 1: Manual Setup (Your Tasks)

Before the agent can post to communities, you need to:

- [ ] **Join Facebook Groups**
  - Search: "HOA board members", "Property managers", "Florida condo owners"
  - Join 5-10 relevant groups
  - Read each group's rules about business posts

- [ ] **Setup Reddit Account**
  - Create account or optimize existing
  - Join r/HOA, r/condoassociation, r/realestate
  - Build karma with helpful (non-promotional) comments first

- [ ] **Join LinkedIn Groups**
  - Search: "Community Association Institute", "CAI", "Property Management"
  - Join 2-3 professional groups
  - Engage with posts before promoting

- [ ] **Create BiggerPockets Account**
  - Sign up at biggerpockets.com
  - Locate HOA/Condo forums
  - Read posting guidelines

- [ ] **Document Communities**
  - Create spreadsheet with: Platform, Community Name, URL, Member Count, Rules Summary
  - Track "Our Status" (discovered → joined → lurking → active → established)

**Why Manual Setup Matters:**
- Many groups require approval to join
- Building reputation takes time (don't promote immediately)
- Each platform has different posting etiquette
- Agent needs valid accounts with access

### Phase 3: Agent Testing

Once communities are joined:

1. **Test Reddit Scanning**
   - Run agent to scan r/HOA
   - Review opportunities in dashboard
   - Approve 1-2 high-quality drafts
   - Manually post them (screenshot proof)
   - Track engagement over 24 hours

2. **Refine Templates**
   - Based on real responses, adjust templates in SOUL.md
   - Test different response styles
   - Monitor which templates get best engagement

3. **Enable Automation**
   - Once comfortable with quality, enable scheduled scans
   - Start with Reddit only (every 2 hours)
   - Review queue 2x daily, approve best drafts
   - Gradually add other platforms

---

## 🔧 Troubleshooting

### "Cannot find module" errors
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Database tables not created
```bash
# Check if migration ran
sqlite3 data/clawops.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'lg_%';"

# Should show: lg_engagement_queue, lg_community_accounts

# If not, manually run migration
sqlite3 data/clawops.db < server/db/migrations/007_lead_gen_module.sql
```

### Dashboard shows blank page
- Check browser console for errors
- Verify API endpoint is accessible: `curl http://localhost:3001/api/lead-gen/networker/queue`
- Check that server is running on port 3001

### API returns 404
- Verify routes are registered in `server/index.js`
- Check that `const leadGenRoutes = require('./routes/lead-gen');` is present
- Restart server after adding routes

---

## 📈 Success Metrics to Track

### Week 1 Targets:
- [ ] Dashboard accessible and functional
- [ ] Create 5 test opportunities manually
- [ ] Test approve/edit/reject workflow
- [ ] Join first 5 communities

### Week 2 Targets:
- [ ] Agent registered and tested
- [ ] First real Reddit scan completed
- [ ] 3-5 responses approved and posted manually
- [ ] Track engagement on posted responses

### Week 4 Targets:
- [ ] 20+ communities joined and documented
- [ ] 10-20 opportunities identified per week
- [ ] 3-5 responses posted per week
- [ ] First UTM-tracked clicks recorded

### Month 3 Targets:
- [ ] Established presence in 10+ key communities
- [ ] 100+ responses posted total
- [ ] 500+ site visits from community links
- [ ] 10-15 warm leads generated

---

## 🎓 Learning Resources

### Platform-Specific Guides

**Reddit Best Practices:**
- Don't promote in first 2-3 weeks (build karma first)
- Always disclose affiliation when linking
- Match subreddit tone (r/HOA is frustrated, r/realestate is analytical)
- Upvote others' helpful answers too

**Facebook Groups:**
- Read rules FIRST (many ban business links)
- Engage with others' posts before posting your own
- Keep tone friendly, not corporate
- Private message follow-ups if rules prohibit public promotion

**LinkedIn:**
- Professional tone expected
- Data and insights valued over anecdotes
- Tag relevant people when appropriate
- Can be more promotional than Reddit/Facebook

**BiggerPockets:**
- Investor-focused audience (ROI matters most)
- Show detailed financial analysis
- Respect veteran members
- Provide value before asking for attention

### Response Quality Guidelines

**Great responses have:**
- ✅ Empathy and acknowledgment of frustration
- ✅ Multiple options (not just your solution)
- ✅ Specific, actionable steps
- ✅ Bullet points and structure (easy to scan)
- ✅ Disclosure when linking

**Avoid:**
- ❌ Leading with a pitch
- ❌ Generic template responses (customize!)
- ❌ Arguing with other commenters
- ❌ Making promises about rates/approval
- ❌ Legal/financial advice beyond your expertise

---

## 🔗 Quick Links

- **Dashboard**: http://localhost:5173/lead-gen
- **API Docs**: `server/routes/lead-gen.js`
- **Agent Identity**: `openclaw-skills/hoa-networker/SOUL.md`
- **Database Schema**: `server/db/migrations/007_lead_gen_module.sql`
- **Full Spec**: `LEAD_GEN_NETWORKER_SPEC.md`
- **Project Index**: `LEAD-GEN-NETWORKER-INDEX.md`

---

## ✨ What Makes This Different

Traditional marketing agents post content to YOUR channels (blog, social media, email).

**The Networker goes WHERE THE AUDIENCE ALREADY IS.**

Instead of hoping HOA boards find your content, you meet them where they're asking questions RIGHT NOW:
- Reddit threads about emergency assessments
- Facebook groups discussing roof repairs
- LinkedIn posts about reserve funding
- Quora questions about HOA loans

**The Result:**
- Warm leads instead of cold traffic
- Trust built through helpfulness, not ads
- Market intelligence (what are they REALLY struggling with?)
- Content ideas from real questions
- Direct conversations with decision-makers

**This is the missing piece that completes your marketing automation stack.** 🚀

---

**Status**: Phase 2 Complete ✅
**Ready for**: Manual community building (Phase 1) + Agent testing (Phase 3)
**Time to First Post**: 1-2 weeks (after community reputation built)
**Expected ROI**: 30-50 warm leads/month by Month 6
