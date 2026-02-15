# HOA Networker

**Community Engagement Agent for Lead Generation**

## Overview

The HOA Networker monitors online communities where HOA board members and property managers discuss capital projects, assessments, and financing challenges. It drafts helpful, expert responses that build trust and drive qualified traffic to hoaprojectfunding.com.

## Mission

**Go where the audience already is** — instead of posting content to YOUR channels, engage in conversations happening where HOA decision-makers already gather.

## Target Platforms

1. **Reddit** (Every 2 hours)
   - r/HOA (~100K subscribers)
   - r/condoassociation
   - r/realestate
   - r/legaladvice (HOA threads)
   - r/personalfinance (special assessments)

2. **Facebook Groups** (5x daily: 6am, 10am, 2pm, 6pm, 10pm)
   - HOA board member groups
   - Property manager professional groups
   - Florida condo owner groups
   - State-specific HOA groups

3. **LinkedIn** (2x weekdays: 8am, 4pm)
   - Community association management groups
   - CAI chapter posts
   - Property management professional pages

4. **Other Forums** (Daily 9am)
   - BiggerPockets HOA discussions
   - Quora HOA financing questions
   - Nextdoor neighborhood posts

## Core Principles

- ✅ **Genuinely helpful first** — Answer the actual question thoroughly
- ✅ **Subtle, not salesy** — Lead with value, not pitches
- ✅ **Platform-appropriate** — Follow each community's rules religiously
- ✅ **Quality over quantity** — Better 3 excellent responses than 20 mediocre ones

## Workflow

1. **Agent scans communities** (automated on schedule)
2. **Identifies engagement opportunities** (relevance scored 1-100)
3. **Drafts response using templates** (customized for context)
4. **Queues for manual review** → Dashboard at `/lead-gen`
5. **Human approves/edits/rejects** → You maintain quality control
6. **Agent posts approved responses** (with UTM tracking)
7. **Tracks engagement metrics** (likes, replies, clicks)
8. **Alerts on hot leads** (high engagement + clicked link + decision-maker)

## Response Templates

The agent has 5 core templates (always customized):

1. **Special Assessment Distress** — "Our HOA got hit with huge assessment"
2. **Educational Question** — "How do HOA loans work?"
3. **FL SIRS Compliance** — "Florida milestone inspection costs"
4. **Decision Framework** — "Loan vs assessment debate"
5. **Reserve Funding Gap** — "Reserve study shows underfunding"

See `SOUL.md` for full templates and customization guidelines.

## Success Metrics

### Daily Targets:
- Opportunities found: 10-20
- Responses approved: 3-5
- Engagement received: Track likes, replies
- Clicks to site: UTM tracked
- Hot leads generated: Immediate alerts

### Weekly Review:
- Which communities produce most clicks?
- Which response templates get most engagement?
- Which topics drive most traffic?
- Community reputation scores

### Monthly Optimization:
- Double down on high-performing communities
- Drop dead communities
- Refine response templates based on data
- Expand to new communities

## Database Tables

### `lg_engagement_queue`
Tracks every engagement opportunity from discovery → posting → metrics

**Key Fields**:
- `platform`, `community`, `post_url`, `post_title`, `post_summary`
- `relevance_score` (1-100)
- `recommended_template`
- `draft_response` (AI-generated)
- `status` (pending_review → approved → posted)
- `engagement_likes`, `engagement_replies`, `engagement_clicks`

### `lg_community_accounts`
Tracks which communities we monitor and our reputation in each

**Key Fields**:
- `platform`, `community_name`, `member_count`
- `our_status` (discovered → joined → lurking → active → established)
- `posts_made`, `avg_engagement`
- `last_scanned`

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/lead-gen/networker/queue` | GET | List opportunities (filter by status) |
| `/api/lead-gen/networker/queue/:id` | GET | Get single opportunity |
| `/api/lead-gen/networker/queue/:id` | PATCH | Approve/reject/edit draft |
| `/api/lead-gen/networker/queue/:id/post` | POST | Post approved response |
| `/api/lead-gen/networker/communities` | GET | List tracked communities |
| `/api/lead-gen/networker/stats` | GET | Dashboard metrics |

## Dashboard

Access at: `/lead-gen`

**Features**:
- Engagement Queue (pending review, approved, posted, rejected)
- Community Performance (top communities by clicks)
- Platform Stats (posts, engagement, clicks per platform)
- Quick actions (Approve, Edit, Reject)
- Edit modal for refining drafts

## Integration with Other Agents

The Networker feeds intelligence to:

- **Content Writer**: "People keep asking about SIRS deadlines" → Write detailed guide
- **Social Media**: "This topic trending in r/HOA" → Create posts for your channels
- **Email Campaigns**: "Property manager engaged with Reddit answer" → Add to warm lead nurture
- **Social Engagement**: "Active engagers on LinkedIn" → Monitor for future engagement
- **Telegram (You)**: "🔥 HOT LEAD: Board president needs $2M ASAP"

## Setup

### 1. Manual Community Building (Week 1)

**YOU DO THIS FIRST** (before running agent):

- [ ] Join 5-10 Facebook HOA groups
- [ ] Create/optimize Reddit account → Join r/HOA and related subs
- [ ] Join 2-3 LinkedIn CAI groups
- [ ] Create BiggerPockets account
- [ ] Document all communities (URLs, rules, member counts)

### 2. Database Setup

Migration file: `server/db/migrations/007_lead_gen_module.sql`

Creates 2 tables + 8 indexes. Migration runs automatically when server starts.

### 3. Register Agent

```bash
# Register with OpenClaw
npx openclaw agent create \
  --id hoa-networker \
  --name "HOA Networker" \
  --description "Community engagement specialist for lead generation" \
  --workspace ./openclaw-skills/hoa-networker
```

### 4. Create Schedules

See `schedule.json` for cron schedules:

- `lg-networker-reddit`: Every 2 hours
- `lg-networker-facebook`: 5x daily (6am, 10am, 2pm, 6pm, 10pm)
- `lg-networker-linkedin`: 2x weekdays (8am, 4pm)
- `lg-networker-forums`: Daily 9am
- `lg-networker-post`: Every 30 minutes (check approved queue, post)
- `lg-networker-track`: Daily 8pm (update engagement metrics)

### 5. Test Agent

```bash
# Manual test scan
npx openclaw agent --agent hoa-networker --local \
  --message "Scan r/HOA for engagement opportunities, return top 5"

# Check results
open http://localhost:5173/lead-gen
```

## Golden Rules

### ALWAYS:
- Be genuinely helpful first
- Answer the actual question
- Provide multiple options (not just "hire us")
- Match platform tone
- Disclose affiliation when linking

### NEVER:
- Lead with a pitch
- Use same template in multiple threads
- Respond to posts >72 hours old
- Argue with other commenters
- Make rate/approval promises
- Violate platform guidelines
- Post >3x per day in same community

### WHEN TO LINK:
- ✅ When they explicitly ask for resources/tools
- ✅ When you've provided value first
- ✅ When link adds genuine utility
- ❌ In your first response
- ❌ When it feels forced

## UTM Tracking

All links include UTM parameters:

```
?utm_source=[platform]&utm_medium=community&utm_campaign=networker&utm_content=[thread_id]
```

**Example**:
```
https://www.hoaprojectfunding.com/loan-calculator?utm_source=reddit&utm_medium=community&utm_campaign=networker&utm_content=r_hoa_12345
```

## Hot Lead Detection

Alerts sent to Telegram when:

1. High-value post (relevance >80, large $ amount, decision-maker identified)
2. Strong engagement (clicked link, replied with follow-up, asked for contact)
3. Platform credibility (LinkedIn, property manager title, active member)

**Alert Format**:
```
🔥 HOT LEAD ALERT

Platform: LinkedIn
Post: "Need $2.5M for SIRS compliance, deadline in 90 days"
Author: Maria Chen - Property Manager
Engagement: Clicked link, viewed calculator, replied asking about timeline
Relevance: 95% match
```

## Expected Results

### Month 1:
- 20-30 communities joined
- 50-100 responses posted
- Reputation building phase
- 100-200 site visits from community links

### Month 2:
- 100-150 responses posted
- Established presence in key communities
- 300-500 site visits
- 5-10 warm leads

### Month 3:
- 150-200 responses posted
- "Known expert" status in top communities
- 500-800 site visits
- 15-20 warm leads

### Month 6:
- Self-sustaining lead generation engine
- 1,000+ site visits/month from communities
- 30-50 warm leads/month
- Content Writer informed by real market questions

## Compliance & Ethics

### Disclosure Policy:
- **Reddit**: Include "Disclosure: I work with HOA Project Funding" when linking
- **LinkedIn**: Profile represents company (already disclosed)
- **Facebook**: Follow group rules about business posts
- **Quora**: Bio links to site (no inline disclosure needed)

### Posting Limits (Self-Imposed):
- Max 3 responses per group per day
- Don't respond to posts >72 hours old
- Don't use same response in multiple threads
- If someone else gave great answer, don't pile on

### Account Authenticity:
- Use real accounts (no fake personas)
- Transparent about affiliation
- No sockpuppet accounts
- No vote manipulation

## Files

- `SOUL.md` — Full agent identity, templates, guidelines (7,000+ words)
- `README.md` — This file (project overview)
- `SKILL.md` — Technical implementation details
- `schedule.json` — Cron schedules for automation

## Links

- **Dashboard**: http://localhost:5173/lead-gen
- **API Docs**: See `server/routes/lead-gen.js`
- **Database Schema**: See `server/db/migrations/007_lead_gen_module.sql`
- **Master Spec**: See `LEAD_GEN_NETWORKER_SPEC.md` (full design document)

---

**This agent is the missing piece that turns your marketing stack into a lead generation engine.** 🚀
