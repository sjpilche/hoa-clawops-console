# Lead Generation Networker - Project Index

> **Mission**: Get HOA Project Funding in front of people where they already are
> **Status**: Fully specified, ready for implementation
> **Created**: February 2026

---

## 📋 Executive Summary

The **HOA Networker** is a community engagement agent that monitors online communities (Facebook, Reddit, LinkedIn, forums) where HOA board members and property managers discuss capital projects, assessments, and financing. It drafts helpful, expert responses that build trust and drive traffic to hoaprojectfunding.com.

**Key Insight**: Your 6 marketing agents create content but post it to YOUR channels. The Networker goes WHERE THE AUDIENCE ALREADY IS.

---

## 🎯 The Problem & Solution

### The Problem
Your marketing agents create great content but post it to your own channels. That's like having a billboard in your own backyard - nobody new sees it.

### The Solution
The Networker monitors conversations in:
- Facebook groups (HOA boards, property managers, FL condos)
- Reddit (r/HOA, r/condoassociation, r/realestate)
- LinkedIn (CAI groups, property management professionals)
- BiggerPockets forums
- Quora HOA financing questions
- Nextdoor neighborhood discussions

When someone posts "Our HOA got hit with a $2M roof replacement, what do we do?" - The Networker provides genuinely helpful expertise that naturally positions you as the authority.

---

## 📁 Documentation

### Master Specification
**File**: [`LEAD_GEN_NETWORKER_SPEC.md`](LEAD_GEN_NETWORKER_SPEC.md)

**Contents**:
- Complete agent design and identity
- Platform monitoring strategy (6 platforms)
- Response guidelines and templates
- Database schema (2 new tables)
- API endpoints (6 new)
- Scheduling strategy
- Dashboard mockups
- Build order (6 steps)
- Integration with existing agents

---

## 🏗️ What Needs to Be Built

### Phase 1: Community Access (Manual - Week 1)
**YOU DO THIS FIRST** (before any code):
- [ ] Join 5-10 Facebook groups for HOA boards/managers
- [ ] Create/optimize Reddit account, join r/HOA and related subs
- [ ] Join 2-3 LinkedIn groups for community associations
- [ ] Create BiggerPockets account
- [ ] Document all communities in spreadsheet with URLs and rules

**Why**: Agent needs accounts with access. Some groups require approval.

---

### Phase 2: Database & API (Week 2)

#### 2 New Database Tables

**`lg_engagement_queue`** - Work queue for opportunities found
- Tracks: platform, community, post URL, draft response
- Statuses: pending_review → approved → posted → tracking
- Engagement metrics: likes, replies, clicks

**`lg_community_accounts`** - Tracked communities
- Tracks: platform, community name, member count, our status
- Metrics: posts made, avg engagement, last scanned
- Status flow: discovered → joined → lurking → active → established

**Migration File**:
```sql
-- migrations/007_lead_gen_module.sql
-- See full schema in LEAD_GEN_NETWORKER_SPEC.md lines 400-449
```

#### 6 New API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/lead-gen/networker/queue` | GET | List engagement opportunities |
| `/api/lead-gen/networker/queue/:id` | GET | Get single opportunity |
| `/api/lead-gen/networker/queue/:id` | PATCH | Approve/reject/edit draft |
| `/api/lead-gen/networker/queue/:id/post` | POST | Post approved response |
| `/api/lead-gen/networker/communities` | GET | List tracked communities |
| `/api/lead-gen/networker/stats` | GET | Dashboard metrics |

---

### Phase 3: Agent Creation (Week 3)

#### Create Agent Files

**Directory**: `openclaw-skills/hoa-networker/`

**Files**:
1. **`SOUL.md`** - Agent identity, mission, response guidelines
   - Full template provided in spec (lines 129-303)
   - Identity: Community engagement specialist
   - Guidelines: Be helpful, not salesy
   - Response templates for common scenarios

2. **`README.md`** - Agent documentation
3. **`SKILL.md`** - Technical implementation details
4. **`schedule.json`** - Cron schedules (6 schedules)

#### Register Agent
```bash
npx openclaw agent create \
  --id hoa-networker \
  --name "HOA Networker" \
  --description "Community engagement agent" \
  --workspace ./openclaw-skills/hoa-networker
```

---

### Phase 4: Scheduling (Week 3)

#### 6 Automated Schedules

| Schedule | Frequency | What |
|----------|-----------|------|
| `lg-networker-reddit` | Every 2 hours | Scan Reddit subs |
| `lg-networker-facebook` | 5x daily (6am, 10am, 2pm, 6pm, 10pm) | Scan FB groups |
| `lg-networker-linkedin` | 2x weekdays (8am, 4pm) | Scan LinkedIn |
| `lg-networker-forums` | Daily 9am | Scan BiggerPockets, Quora |
| `lg-networker-post` | Every 30 min | Post approved responses |
| `lg-networker-track` | Daily 8pm | Update engagement metrics |

---

### Phase 5: Dashboard UI (Week 4)

#### New Dashboard Page: Lead Gen

**Route**: `/lead-gen`

**Components**:

1. **Engagement Queue** (main view)
   - Pending review items with relevance scores
   - Draft responses with approve/edit/reject buttons
   - Platform badges (Reddit, Facebook, LinkedIn)

2. **Community Performance Table**
   - Posts per community
   - Avg engagement
   - Clicks tracked
   - Leads generated

3. **Stats Overview**
   - Pending review count
   - Posted today count
   - Total clicks
   - Hot lead alerts

**Mockup**: See spec lines 480-522

---

### Phase 6: Integration with Existing Agents (Week 5)

#### Data Flow

```
HOA Networker
    ├─> hoa-content-writer (trending topics → blog posts)
    ├─> hoa-social-media (trending topics → social posts)
    ├─> hoa-email-campaigns (engaged contacts → warm leads)
    ├─> hoa-social-engagement (active engagers → watch list)
    └─> Telegram (hot leads → immediate alert)
```

#### Integration Points

| From | To | Data Passed | How |
|------|-----|-------------|-----|
| Networker | Content Writer | Topic + questions + platform | Content queue entry |
| Networker | Social Media | Topic + angle + hashtags | Social queue entry |
| Networker | Email Campaigns | Name + platform + interaction | Contact record |
| Networker | Social Engagement | Platform profiles | Watch list |
| Networker | You (Telegram) | Hot lead context | Immediate notification |

---

## 📊 Platform Strategy

### Target Platforms (Prioritized)

#### 1. Facebook Groups (Highest Volume)
**Groups to Join**:
- HOA board members groups
- Property manager professional groups
- Florida condo owner groups
- California HOA groups
- HOA homeowner help groups

**Approach**: Lurk 1 week, build reputation over 2-4 weeks before linking

#### 2. Reddit (High Intent)
**Subreddits**:
- r/HOA (~100K subscribers)
- r/condoassociation
- r/realestate (~1M subscribers)
- r/personalfinance (~18M subscribers)
- r/legaladvice (~3M subscribers)

**Approach**: Build karma first. Reddit hates self-promotion. Lead with knowledge.

#### 3. LinkedIn (Professional - Highest Quality)
**Targets**:
- Community association management groups
- CAI chapter posts
- Property management company posts
- Reserve study firm posts
- HOA attorney articles

**Approach**: Comment thoughtfully, share content professionally, connect with engagers

#### 4. Other Platforms
- BiggerPockets (real estate investors)
- Quora (SEO benefit + answers rank on Google)
- Nextdoor (hyperlocal HOA complaints)
- CAI Connect forums (industry-specific)

---

## ✍️ Response Strategy

### Golden Rules

**ALWAYS**:
- Be genuinely helpful
- Answer the actual question first
- Show expertise without jargon
- Acknowledge frustration
- Provide actionable steps

**WHEN APPROPRIATE** (not every response):
- Mention multi-lender comparison concept
- Reference relevant hoaprojectfunding.com content
- Suggest HOA loans as assessment alternative

**NEVER**:
- Lead with a pitch
- Use same template in multiple threads
- Respond to posts >72 hours old
- Argue with other commenters
- Make rate/approval promises
- Violate platform guidelines
- Post >3 responses/day in same group
- Use fake accounts

### Response Templates

**5 Core Templates** (always customize):
1. "Our HOA got hit with huge assessment" - Empathy + alternatives
2. "How do HOA loans work?" - Educational, factual
3. "Florida SIRS/milestone costs" - Compliance + funding pathway
4. "Loan vs assessment?" - Decision framework (not recommendation)
5. "Reserve study shows funding gap" - Reassuring + options

**Full templates**: See spec lines 222-257

---

## 📈 Success Metrics

### Daily Targets
- Engagement opportunities found: 10-20
- Responses approved and posted: 3-5
- Engagement received: Track likes, replies, follows
- Click-throughs to site: UTM tracked
- Hot leads generated: Immediate alerts

### Weekly Review
- Which communities produce most clicks?
- Which response templates get most engagement?
- Which topics drive most traffic?
- Community reputation scores

### Monthly Optimization
- Double down on high-performing communities
- Drop dead communities
- Refine response templates based on data
- Expand to new communities

---

## 🔄 Daily Workflow (30 min/day)

### Morning (10 minutes)
1. Open dashboard → Lead Gen → Engagement Queue
2. Review 3-8 pending drafts from overnight
3. Approve good ones, edit tweaks, reject irrelevant
4. Approved responses auto-post within 30 min

### Midday (5 minutes)
1. Check Telegram for hot lead alerts
2. Quick scan new opportunities
3. Approve any good ones

### Evening (5 minutes)
1. Check engagement metrics on today's posts
2. Note best-performing communities
3. Flag trending topics for Content Writer

### Weekly (15 minutes)
1. Review community performance table
2. Decide: join new? leave dead?
3. Check which templates perform best
4. Feed insights to Content Writer

---

## 🛠️ Setup Script

**File**: `scripts/setup-lead-gen.sh`

**What It Does**:
1. Runs database migration (2 tables)
2. Registers hoa-networker agent
3. Creates 6 cron schedules
4. Copies SOUL.md to workspace

**Usage**:
```bash
chmod +x scripts/setup-lead-gen.sh
./scripts/setup-lead-gen.sh
```

**Full script**: See spec lines 640-698

---

## 🔗 Integration Architecture

### How Networker Feeds Everything Else

```
THE NETWORKER (finds conversations)
    │
    ├──► Content Writer
    │    "People keep asking about SIRS deadlines"
    │    → Write detailed guide for responses
    │
    ├──► Social Media
    │    "This topic trending in HOA groups"
    │    → Create posts for our channels
    │
    ├──► Email Campaigns
    │    "Property manager engaged with Reddit answer"
    │    → Add to warm lead nurture
    │
    ├──► Social Engagement
    │    "Monitor these engagers"
    │    → They're warm prospects
    │
    └──► YOU (Telegram)
         "🔥 HOT LEAD: Board president needs $2M ASAP"
```

---

## 📋 Implementation Checklist

### Week 1: Community Access (Manual)
- [ ] Join 5-10 Facebook HOA groups
- [ ] Create optimized Reddit account
- [ ] Join r/HOA, r/condoassociation, r/realestate
- [ ] Join 2-3 LinkedIn CAI groups
- [ ] Create BiggerPockets account
- [ ] Document all communities with URLs/rules
- [ ] Read each community's posting guidelines

### Week 2: Database & API
- [ ] Create migration file: `migrations/007_lead_gen_module.sql`
- [ ] Run migration to create 2 tables
- [ ] Create 6 API endpoints in Express
- [ ] Test endpoints with curl/Postman
- [ ] Add Lead Gen nav item to dashboard
- [ ] Build Engagement Queue UI component

### Week 3: Agent Setup
- [ ] Create `openclaw-skills/hoa-networker/` directory
- [ ] Write `SOUL.md` using template from spec
- [ ] Write `README.md` and `SKILL.md`
- [ ] Register agent with OpenClaw
- [ ] Test: Scan r/HOA and return 5 opportunities
- [ ] Review draft quality, iterate on SOUL.md
- [ ] Create 6 cron schedules

### Week 4: Start Posting
- [ ] Activate Reddit scanning (every 2 hours)
- [ ] Review and approve manually for 3-5 days
- [ ] Track engagement on posted responses
- [ ] Activate Facebook scanning
- [ ] Activate LinkedIn scanning
- [ ] Continue manual review before posting

### Week 5: Integration
- [ ] Wire trending topics → Content Writer queue
- [ ] Wire engaged contacts → Email Campaigns
- [ ] Wire platform trends → Social Media
- [ ] Setup hot lead → Telegram alerts
- [ ] Track full funnel: response → visit → lead

### Week 6+: Optimize
- [ ] Analyze which communities perform best
- [ ] Test different response templates
- [ ] Expand to new high-performing communities
- [ ] Drop low-performing communities
- [ ] Refine based on data

---

## 🎯 Key Success Factors

### 1. Genuine Helpfulness
This ONLY works if responses are actually helpful. Not sales pitches.

### 2. Platform Rules Compliance
Each platform has guidelines. Follow them religiously or get banned.

### 3. Patience & Reputation Building
Takes 2-4 weeks to build community reputation. Don't rush.

### 4. Data-Driven Optimization
Track everything. Double down on what works. Kill what doesn't.

### 5. Integration with Existing Agents
Networker makes all 6 existing agents more effective by providing market intelligence.

---

## 📊 Expected Results

### Month 1
- 20-30 communities joined
- 50-100 responses posted
- Reputation building phase
- 100-200 site visits from community links

### Month 2
- 100-150 responses posted
- Established presence in key communities
- 300-500 site visits
- 5-10 warm leads

### Month 3
- 150-200 responses posted
- "Known expert" status in top communities
- 500-800 site visits
- 15-20 warm leads

### Month 6
- Self-sustaining lead generation engine
- 1,000+ site visits/month from communities
- 30-50 warm leads/month
- Content Writer informed by real market questions
- Social Media posting trending topics
- Email Campaigns nurturing community-sourced leads

---

## 🔐 Compliance & Ethics

### Disclosure Policy
- **Reddit**: Include "Disclosure: I work with HOA Project Funding" when linking
- **LinkedIn**: Profile represents company (already disclosed)
- **Facebook**: Follow group rules about business posts
- **Quora**: Bio links to site (no inline disclosure needed)
- **General**: When in doubt, disclose

### Posting Limits (Self-Imposed)
- Max 3 responses per group per day
- Don't respond to posts >72 hours old
- Don't use same response in multiple threads
- Don't argue or be defensive
- If someone else gave great answer, don't pile on

### Account Authenticity
- Use real accounts (no fake personas)
- Use company name/profile where appropriate
- Transparent about affiliation
- No sockpuppet accounts
- No vote manipulation

---

## 💾 Files to Create

### New Files
```
migrations/007_lead_gen_module.sql          (Database schema)
server/routes/lead-gen.js                   (6 API endpoints)
openclaw-skills/hoa-networker/SOUL.md       (Agent identity)
openclaw-skills/hoa-networker/README.md     (Documentation)
openclaw-skills/hoa-networker/SKILL.md      (Technical specs)
openclaw-skills/hoa-networker/schedule.json (Cron schedules)
client/src/pages/LeadGenPage.jsx            (Dashboard UI)
client/src/components/EngagementQueue.jsx   (Queue component)
scripts/setup-lead-gen.sh                   (Setup script)
LEAD-GEN-NETWORKER-INDEX.md                 (This file)
```

### Modified Files
```
server/index.js                             (Add lead-gen routes)
client/src/App.jsx                          (Add /lead-gen route)
client/src/components/Sidebar.jsx           (Add nav item)
```

---

## 🚀 Quick Start Command

Once all files are created:

```bash
# 1. Setup (creates tables, registers agent, schedules)
./scripts/setup-lead-gen.sh

# 2. Test manual scan
npx openclaw agent --agent hoa-networker --local \
  --message "Scan r/HOA for engagement opportunities"

# 3. View results
open http://localhost:5173/lead-gen

# 4. Approve a draft and watch it post
# (Use dashboard UI)

# 5. Check engagement after 24 hours
curl http://localhost:3001/api/lead-gen/networker/stats
```

---

## 📞 Support & Resources

### Documentation
- **Full Spec**: `LEAD_GEN_NETWORKER_SPEC.md`
- **This Index**: `LEAD-GEN-NETWORKER-INDEX.md`
- **Setup Script**: `scripts/setup-lead-gen.sh`

### Platform Guidelines
- Facebook Community Standards
- Reddit Content Policy & Reddiquette
- LinkedIn Professional Community Policies
- BiggerPockets Forum Rules
- Quora Be Nice, Be Respectful policy

### Analytics
- Google Analytics with UTM tracking
- Platform-native insights (Reddit karma, FB engagement)
- ClawOps dashboard metrics

---

## 🔄 Relationship to Other Projects

### HOA Agent Fleet (Separate Project)
- **HOA Fleet**: Processes workflows (lending, compliance, documents)
- **Lead Gen Networker**: Finds and nurtures leads BEFORE they become workflows
- **Integration**: Networker feeds warm leads → Fleet processes them

### Existing Marketing Agents
- **Content Writer**: Creates content; Networker tells it WHAT to write
- **Social Media**: Posts to YOUR channels; Networker posts WHERE AUDIENCE IS
- **Email Campaigns**: Nurtures leads; Networker FINDS the leads to nurture
- **Social Engagement**: Monitors your channels; Networker monitors ALL channels
- **CMS Publisher**: Publishes to your site; Networker drives traffic TO your site

**Bottom Line**: Networker makes all 6 existing agents more effective by providing market intelligence and warm leads.

---

**Status**: ✅ Fully specified, ready for implementation
**Estimated Effort**: 5-6 weeks (manual community building + coding)
**Expected ROI**: 30-50 warm leads/month by Month 6

**This is THE missing piece that turns your marketing stack into a lead generation engine! 🚀**
