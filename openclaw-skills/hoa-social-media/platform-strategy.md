# HOA Social Media Platform Strategy

Business: **www.hoaprojectfunding.com** — HOA loan brokerage connecting boards with lenders for capital improvement financing

Conversion Goals:
1. **Primary**: Full loan application (HOA info, financials, project details)
2. **Secondary**: Free 15-minute consult (phone or email, no commitment)

**NO lead magnet. NO downloads. NO email signup.**

---

## Platform Hierarchy

### 1. Facebook (PRIMARY)

**Why Facebook?**
- HOA board members are active in groups: "HOA Board Members," "HOA Management," "Community Association Managers"
- Community-focused conversations happen here
- People seek peer advice before making financial decisions

**Content Strategy:**

Two post types per blog post:

**A. Company Page Post**
- **Purpose**: Drive traffic to blog → conversion to application/consult
- **Format**: Blog summary + direct link + clear CTA
- **CTA options**:
  - "Have a project coming up? Get competitive loan options in days, not months → www.hoaprojectfunding.com"
  - "Free 15-minute consult for boards exploring financing → www.hoaprojectfunding.com"
- **Link**: Always to blog post on www.hoaprojectfunding.com
- **Schedule**: Tuesday 10:00 AM ET (day after blog publishes)

**B. Group Discussion Post**
- **Purpose**: Build credibility, thought leadership, trust
- **Format**: Ask question, share insight, NO direct link
- **Rules**:
  - Provide genuine value first
  - NO sales pitch
  - NO link (only if someone asks in comments)
  - Mention "we wrote about this" naturally if relevant
  - Goal: People visit your site on their own
- **Schedule**: Wednesday 12:00 PM ET

**Engagement Strategy:**
- Respond to EVERY comment within 24 hours
- Be helpful first, mention services only when directly relevant
- Build relationships beyond your own posts (comment on others' questions)
- If someone asks about financing → offer free consult + link

---

### 2. LinkedIn (SECONDARY)

**Why LinkedIn?**
- Property managers, CAMs, and community association attorneys are here
- Professional networking and thought leadership
- Decision-influencers (PMs advise boards on financing)

**Audience:**
- Property management company employees
- Community Association Managers (CAMs)
- Community association attorneys
- NOT primarily HOA board members (they're on Facebook)

**Content Strategy:**

One post per blog post:

**Format**: Professional insight from PM perspective + blog link + CTA
- **Hook**: Question or insight from property manager's point of view
- **Value**: 3-4 bullet points with actionable takeaways
- **CTA**: "We help your boards compare financing options so they can move on projects faster. Free consult at www.hoaprojectfunding.com"
- **Hashtags (ALWAYS)**: #HOA #CommunityAssociation #PropertyManagement #HOAFinancing #CapitalImprovement
- **Schedule**: Thursday 9:00 AM ET

**Engagement Strategy:**
- Engage with property management content (not just HOA boards)
- Comment on PM industry discussions
- Share insights on operational challenges PMs face
- Position as a resource for PMs to recommend to their boards

---

### 3. Twitter/X (REMOVED)

**Reason**: HOA board members and property managers are not active on Twitter. Focus resources on Facebook and LinkedIn instead.

---

## Content Publishing Schedule

**Blog Post Workflow:**

```
Monday
↓
Blog post published on www.hoaprojectfunding.com
(by hoa-cms-publisher agent via Git → Netlify)

Tuesday 10:00 AM ET
↓
Facebook Company Page Post
→ Links to blog
→ CTA to application OR free consult
→ Goal: Drive traffic to site

Wednesday 12:00 PM ET
↓
Facebook Group Discussion Post
→ NO LINK
→ Provide value, ask question
→ Goal: Build credibility, trust

Thursday 9:00 AM ET
↓
LinkedIn Post (Property Manager Audience)
→ Links to blog
→ CTA: help boards compare financing
→ Goal: Reach decision-influencers
```

**Why this schedule?**
- Tuesday: Fresh content after Monday blog publish
- Wednesday: Mid-week engagement in groups (peak activity)
- Thursday: Professional networking day on LinkedIn

---

## Key Performance Indicators (KPIs)

**Primary Metric**: Website clicks from social media
- Track: Traffic from Facebook → www.hoaprojectfunding.com
- Track: Traffic from LinkedIn → www.hoaprojectfunding.com
- Goal: Clicks that convert to application fills or consult bookings

**Secondary Metrics**:
- Application form submissions (attributed to social source)
- Free consult bookings (attributed to social source)
- Blog post engagement (time on page, scroll depth)

**Vanity Metrics (don't prioritize)**:
- Likes, shares, reactions
- Follower count
- Post impressions

**What we DON'T track**:
- Email signups (we don't have them)
- Lead magnet downloads (we don't have them)
- Newsletter subscribers (not a conversion goal)

---

## Engagement Rules by Platform

### Facebook Company Page
- Respond to all comments within 24 hours
- Answer questions about financing directly
- Share link to application/consult when relevant
- Keep replies warm and community-focused

### Facebook Groups
- **CRITICAL**: Be helpful FIRST, never salesy
- Respond to every comment on your posts
- Participate in others' discussions (not just your own posts)
- Only mention your services if:
  - Someone directly asks where to find lenders
  - Someone asks "who do you recommend?"
  - Someone requests more info about financing
- If you mention services, offer free consult + link
- NEVER drop links in group posts (only in comments if asked)

### LinkedIn
- Respond to comments from PMs, CAMs, attorneys
- Engage with property management industry content
- Share insights on operational challenges PMs face
- Position as a resource PMs can recommend to boards
- Maintain professional, peer-to-peer tone

---

## Content Creation Template

**For each blog post, generate:**

1. **Facebook Company Page Post**
   - 100-150 words
   - Blog summary + link
   - CTA to application OR free consult
   - 3-5 hashtags
   - Schedule: Tuesday 10 AM ET

2. **Facebook Group Discussion Post**
   - 80-120 words
   - Ask question, share insight
   - NO LINK
   - 3-5 hashtags
   - Schedule: Wednesday 12 PM ET

3. **LinkedIn Post**
   - 150-200 words
   - PM/CAM perspective
   - Blog link + CTA
   - Required hashtags: #HOA #CommunityAssociation #PropertyManagement #HOAFinancing #CapitalImprovement
   - Schedule: Thursday 9 AM ET

---

## Example Cron Schedule

**Blog publishes Monday evening** → Social media conversion happens Tuesday:

```bash
# Tuesday 10 AM ET: Convert blog to social media
openclaw cron add \
  --agent hoa-social-media \
  --cron "0 10 * * 2" \
  --message "Convert the latest blog post into a Facebook page post with site CTA, a Facebook group discussion post, and a LinkedIn thought leadership post per platform-strategy.md. All CTAs point to the full application or free consult at www.hoaprojectfunding.com." \
  --tz "America/New_York" \
  --name "HOA Social - Convert Latest Blog"
```

---

## Conversion Path

**Facebook Company Page** → Click blog link → Read blog → CTA button → Application OR Free Consult

**Facebook Group** → Provide value → Build trust → User visits site independently → Application OR Free Consult

**LinkedIn** → Click blog link → Read blog → PM recommends to board → Board visits site → Application OR Free Consult

---

**Key Principle**: All social content exists to drive traffic to www.hoaprojectfunding.com where visitors convert to application fills or consult bookings. No lead magnets, no downloads, no email signups — just direct conversion paths.
