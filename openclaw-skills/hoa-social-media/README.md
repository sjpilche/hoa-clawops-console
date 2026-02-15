# HOA Social Media Marketing Skill

**Automated social media content generation and scheduling for HOA Project Funding**

---

## Quick Start

### 1. Run Setup Script

```bash
cd /home/sjpilche/projects/openclaw-v1
bash /mnt/c/Users/SPilcher/OpenClaw2.0\ for\ linux/openclaw-skills/hoa-social-media/setup.sh
```

Creates:
- Agent workspace with organized directories
- SOUL.md and TOOLS.md configuration
- Example templates for each platform
- Sample calendar structure

### 2. Choose Integration Method

**Option A: Mixpost (Recommended)**
- Self-hosted social media dashboard
- Queue posts for approval
- Schedule across multiple platforms
- Analytics and reporting

**Option B: Direct APIs**
- Post directly to platforms
- Requires API credentials for each
- More setup, but no extra tools needed

### 3. Test Conversion

```bash
cd /home/sjpilche/projects/openclaw-v1

# Convert latest blog post to social content
npx openclaw agent --agent hoa-social-media --local \
  --message "Convert the latest blog post from hoa-content-writer to social media content for LinkedIn, Twitter, and Facebook"
```

Check output:
```bash
ls -la workspaces/hoa-social-media/posts/
```

### 4. Generate Monthly Calendar

```bash
npx openclaw agent --agent hoa-social-media --local \
  --message "Generate March 2026 social media content calendar with themed weeks"
```

View calendar:
```bash
cat workspaces/hoa-social-media/calendars/2026-03-calendar.md
```

---

## What It Does

### 1. Blog-to-Social Conversion

Takes published blog posts and creates platform-optimized content:

**LinkedIn**:
- Professional, advisory tone
- 150-200 words
- 3-5 bullet points with insights
- Targets HOA boards and property managers
- 3-5 hashtags

**Twitter/X**:
- 2-3 tweet thread
- Hook → Value → CTA format
- Under 280 chars per tweet
- 2-3 hashtags

**Facebook**:
- Warm, community-focused tone
- 100-150 words
- Empathetic opening
- 3-5 hashtags

### 2. Monthly Content Calendar

Generates themed weekly content:

**Week 1**: Educational
- HOA financing basics
- How-to guides
- Explainers

**Week 2**: Case Studies
- Success stories
- Customer testimonials
- Real-world examples

**Week 3**: Seasonal/Timely
- Spring maintenance tips
- Year-end budget planning
- Current events

**Week 4**: Lead Generation
- Direct CTAs
- Service highlights
- Free consultation offers

### 3. Smart Scheduling

Posts at optimal times per platform:

**LinkedIn**: Tue/Wed/Thu, 8-10 AM ET
- Business professionals checking feed before meetings

**Twitter**: Mon-Fri, 12-3 PM ET
- Lunch and afternoon browsing

**Facebook**: Wed/Thu/Fri, 1-4 PM ET
- Afternoon community engagement

### 4. Hashtag Strategy

Always includes 2-3 primary hashtags:
- `#HOA`
- `#HOAmanagement`
- `#PropertyManagement`
- `#CommunityAssociation`
- `#HOAboard`

Plus 1-2 topic-specific hashtags:
- `#HOAbudget`
- `#ReserveFunds`
- `#SpecialAssessment`
- `#HOAfinancing`

---

## Usage Examples

### Example 1: Convert Specific Blog Post

```bash
npx openclaw agent --agent hoa-social-media --local \
  --message "Convert blog post '2026-02-13-hoa-roof-replacement-financing-options.md' to social content for all platforms"
```

**Output**:
- `posts/2026-02-13-hoa-roof-financing-linkedin.md`
- `posts/2026-02-13-hoa-roof-financing-twitter.md`
- `posts/2026-02-13-hoa-roof-financing-facebook.md`
- `batches/2026-02-13-hoa-roof-financing-all.json`

### Example 2: Generate Full Month Calendar

```bash
npx openclaw agent --agent hoa-social-media --local \
  --message "Generate April 2026 content calendar. Week 1: Educational focus on reserve funds. Week 2: Case studies of successful HOA projects. Week 3: Spring maintenance financing tips. Week 4: Lead gen with consultation CTAs."
```

**Output**:
- `calendars/2026-04-calendar.json`
- `calendars/2026-04-calendar.md`

### Example 3: Daily Posting

```bash
npx openclaw agent --agent hoa-social-media --local \
  --message "Check today's calendar and create social posts for all scheduled platforms. Queue to Mixpost for approval."
```

---

## Automation Setup

### Daily Social Queue (Recommended)

Creates today's posts based on calendar and queues for approval:

```bash
npx openclaw cron add \
  --agent hoa-social-media \
  --cron "0 7 * * *" \
  --message "Check today's social media calendar and create scheduled posts. Queue to Mixpost for approval." \
  --tz "America/New_York" \
  --name "HOA Social - Daily Queue"
```

### Weekly Calendar Planning

Generates next week's calendar every Friday:

```bash
npx openclaw cron add \
  --agent hoa-social-media \
  --cron "0 16 * * 5" \
  --message "Generate next week's social media content calendar with appropriate weekly theme" \
  --tz "America/New_York" \
  --name "HOA Social - Weekly Planning"
```

### Monthly Calendar Generation

First day of each month, generate full calendar:

```bash
npx openclaw cron add \
  --agent hoa-social-media \
  --cron "0 8 1 * *" \
  --message "Generate this month's complete social media calendar with all four themed weeks" \
  --tz "America/New_York" \
  --name "HOA Social - Monthly Calendar"
```

---

## Platform Integration

### Mixpost Setup (Recommended)

1. **Install Mixpost**:
   ```bash
   # Follow Mixpost installation: https://mixpost.app/
   ```

2. **Connect accounts**:
   - LinkedIn company page
   - Twitter/X account
   - Facebook page

3. **Test queue**:
   ```bash
   mixpost queue --platform linkedin --content "Test post" --schedule "2026-03-15T09:00:00-05:00"
   mixpost dashboard  # View queued posts
   ```

### Direct API Setup (Alternative)

Add to `.env.local` or `~/.config/openclaw/.env`:

```bash
# LinkedIn
LINKEDIN_ACCESS_TOKEN=your_token_here
LINKEDIN_ORGANIZATION_ID=your_org_id

# Twitter
TWITTER_API_KEY=your_key
TWITTER_API_SECRET=your_secret
TWITTER_ACCESS_TOKEN=your_token
TWITTER_ACCESS_SECRET=your_token_secret

# Facebook
FACEBOOK_PAGE_ACCESS_TOKEN=your_page_token
FACEBOOK_PAGE_ID=your_page_id
```

See `TOOLS.md` for detailed API setup instructions.

---

## Content Quality Standards

Every post must have:

✅ **Platform-appropriate length**
- LinkedIn: 150-200 words
- Twitter: <280 chars/tweet
- Facebook: 100-150 words

✅ **Clear value proposition**
- What does the audience learn?
- Why should they care?

✅ **Relevant hashtags**
- 2-5 per platform
- Mix of broad + specific

✅ **Call-to-action**
- Link, question, or action step
- Natural, not pushy

✅ **Professional tone**
- Helpful, not salesy
- Authoritative but approachable

---

## File Structure

```
openclaw-skills/hoa-social-media/
├── README.md          ← You are here
├── SKILL.md           ← User documentation
├── SOUL.md            ← Agent instructions
└── setup.sh           ← Setup script

workspaces/hoa-social-media/  (created by setup)
├── SOUL.md
├── TOOLS.md
├── posts/
│   ├── 2026-03-04-reserve-funds-linkedin.md
│   ├── 2026-03-04-reserve-funds-twitter.md
│   ├── 2026-03-04-reserve-funds-facebook.md
│   └── ...
├── calendars/
│   ├── 2026-03-calendar.json
│   ├── 2026-03-calendar.md
│   └── ...
├── batches/
│   ├── 2026-03-04-reserve-funds-all.json
│   └── ...
└── drafts/
    ├── example-calendar.json
    ├── example-linkedin.md
    ├── example-twitter.md
    └── example-facebook.md
```

---

## Integration with HOA Content Writer

This skill works seamlessly with `hoa-content-writer`:

1. **Blog post published** → `hoa-content-writer` creates markdown post
2. **Social conversion triggered** → `hoa-social-media` reads blog post
3. **Platform content generated** → LinkedIn, Twitter, Facebook posts created
4. **Queue for approval** → Posts sent to Mixpost or saved as drafts
5. **Scheduled publishing** → Posts go live at optimal times

### Automated Workflow

```bash
# 1. Content Writer generates blog (Mon/Wed/Fri 6am)
# 2. Social Media converts to posts (7am same day)
# 3. Review in Mixpost dashboard
# 4. Approve or edit posts
# 5. Posts publish automatically at scheduled times
```

---

## Troubleshooting

### Posts not generating

**Issue**: Agent doesn't create posts from blog

**Check**:
```bash
# Verify blog posts exist
ls workspaces/hoa-content-writer/posts/

# Test read access
npx openclaw agent --agent hoa-social-media --local \
  --message "List all available blog posts from hoa-content-writer workspace"
```

### Mixpost queue failing

**Issue**: Posts not appearing in Mixpost

**Check**:
```bash
# Verify Mixpost is running
mixpost status

# Test queue manually
mixpost queue --platform linkedin --content "Test" --schedule "$(date -d '+1 hour' -Iseconds)"
```

### Wrong posting times

**Issue**: Scheduled times are off

**Check**:
- Verify timezone: `America/New_York` (EST/EDT auto-adjusts)
- Calendar JSON uses ISO format: `2026-03-15T09:00:00-05:00`
- Mixpost timezone setting matches

### Hashtags not working

**Issue**: Hashtags missing or incorrectly formatted

**Fix**:
- Ensure hashtags at end of post
- No spaces in hashtags (#HOA not #H OA)
- Platform limits respected (Twitter: 280 chars total)

---

## Performance Metrics

Track success via:

- **Posting consistency**: Daily/weekly targets met
- **Engagement rate**: Likes, comments, shares per post
- **Click-through rate**: Links to blog/services clicked
- **Lead generation**: Form fills from social traffic
- **Platform growth**: Follower/connection increases

---

## Next Steps

1. **Run Setup**: Execute `setup.sh` to create workspace
2. **Choose Integration**: Mixpost or direct APIs
3. **Test Conversion**: Convert one blog post to social
4. **Generate Calendar**: Create current month's calendar
5. **Schedule Automation**: Set up daily/weekly cron jobs
6. **Monitor Performance**: Track engagement and leads

---

**Questions?** Check `SKILL.md` for detailed documentation or contact steve.j.pilcher@gmail.com
