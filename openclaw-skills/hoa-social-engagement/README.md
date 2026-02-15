# HOA Social Media Engagement Monitor

**Automated social media monitoring, lead identification, and response drafting for HOA Project Funding**

---

## Quick Start

### 1. Run Setup Script

```bash
cd /home/sjpilche/projects/openclaw-v1
bash /mnt/c/Users/SPilcher/OpenClaw2.0\ for\ linux/openclaw-skills/hoa-social-engagement/setup.sh
```

Creates:
- Agent workspace with organized directories
- SOUL.md and TOOLS.md configuration
- Lead tracking files (hot-leads.json, warm-leads.json)
- Metrics templates
- Example draft responses

### 2. Configure API Credentials

Add to `.env.local` or `~/.config/openclaw/.env`:

```bash
# LinkedIn
LINKEDIN_ACCESS_TOKEN=your_oauth_token
LINKEDIN_ORGANIZATION_ID=12345678

# Twitter/X
TWITTER_BEARER_TOKEN=your_bearer_token
TWITTER_USER_ID=your_user_id

# Facebook
FACEBOOK_PAGE_ACCESS_TOKEN=your_long_lived_token
FACEBOOK_PAGE_ID=your_page_id

# Telegram (for daily digests)
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789
```

**API Setup Instructions**:
- **LinkedIn**: [Create app](https://www.linkedin.com/developers/apps), request `r_organization_social` permission
- **Twitter**: [Developer portal](https://developer.twitter.com/), enable OAuth 2.0, generate Bearer Token
- **Facebook**: [Create app](https://developers.facebook.com/), get long-lived page access token
- **Telegram**: Message [@BotFather](https://t.me/BotFather) to create bot

### 3. Test API Connections

```bash
# Test LinkedIn
curl -H "Authorization: Bearer ${LINKEDIN_ACCESS_TOKEN}" \
  "https://api.linkedin.com/v2/me"

# Test Twitter
curl -H "Authorization: Bearer ${TWITTER_BEARER_TOKEN}" \
  "https://api.twitter.com/2/users/${TWITTER_USER_ID}"

# Test Facebook
curl "https://graph.facebook.com/v18.0/${FACEBOOK_PAGE_ID}?access_token=${FACEBOOK_PAGE_ACCESS_TOKEN}"
```

All should return 200 OK with JSON data.

### 4. Test Engagement Check

```bash
cd /home/sjpilche/projects/openclaw-v1

npx openclaw agent --agent hoa-social-engagement --local \
  --message "Check social media for new engagement and draft responses for high-intent leads"
```

Check:
```bash
# View draft responses
cat workspaces/hoa-social-engagement/drafts/*-responses.md

# View leads captured
cat workspaces/hoa-social-engagement/leads/hot-leads.json
```

### 5. Schedule Automation

**Daily engagement check** (8:00 AM):
```bash
npx openclaw cron add \
  --agent hoa-social-engagement \
  --cron "0 8 * * *" \
  --message "Check all social platforms for new engagement, draft responses, and send daily digest" \
  --tz "America/New_York" \
  --name "HOA Social Engagement - Daily Check"
```

**Weekly metrics report** (Monday 9:00 AM):
```bash
npx openclaw cron add \
  --agent hoa-social-engagement \
  --cron "0 9 * * 1" \
  --message "Generate weekly engagement metrics report and analyze top-performing content" \
  --tz "America/New_York" \
  --name "HOA Social Engagement - Weekly Metrics"
```

---

## What It Does

### 1. Daily Engagement Monitoring

**Runs daily at 8:00 AM EST**:

Checks LinkedIn, Twitter, and Facebook for:
- Comments on company posts
- Mentions of brand/company
- Direct messages
- Replies to content

**For each interaction**:
1. Extracts author, message, timestamp, link
2. Analyzes sentiment (positive, neutral, negative, question)
3. Identifies high-intent keywords (loan, financing, reserve study, etc.)
4. Scores lead quality: 🔥 Hot (3+ keywords), 🌟 Warm (1-2 keywords), 💬 General (0 keywords)
5. Drafts professional response (NEVER posts automatically)
6. Saves to `/drafts/YYYY-MM-DD-responses.md`
7. Logs to lead tracking files

### 2. Lead Identification

**High-Intent Keywords** (Hot Lead if 3+ found):
- Financing inquiries: "loan", "financing", "fund", "borrow", "quote", "rate"
- Project types: "roof replacement", "pool renovation", "elevator repair"
- HOA pain points: "special assessment", "reserve study", "capital improvement"
- Decision-making: "how much", "what are options", "approval process"

**Warm Lead Keywords** (Warm Lead if 1-2 found):
- Roles: "HOA board", "property manager", "treasurer"
- Interest: "considering", "thinking about", "researching"
- General: "help", "advice", "guidance", "budget"

**Lead Scoring Example**:
```
Message: "We need financing for a $400K roof project. What are our options besides special assessments?"

Keywords found: financing, roof project, options, special assessments (4 keywords)
Score: 🔥 HOT LEAD
Priority: HIGH
```

### 3. Response Drafting

**All responses are DRAFTS only** — agent never auto-posts.

**Response Format**:

**Hot Leads** (Direct financing inquiry):
```
Hi [Name],

Great question! For a [project type] in the [$XXX,XXX range], you typically have a few options:

• Reserve fund loans (if you have adequate reserves)
• Assessment-backed bonds (spread costs over 10-15 years)
• Lines of credit (flexible for phased work)

Each has different requirements. Would you like to schedule a quick call to discuss which fits your HOA's situation?

📅 Book a consultation: [link]
📧 Or email us: contact@hoaprojectfunding.com

Happy to help!
HOA Project Funding Team
```

**Warm Leads** (Showing interest):
```
Thanks for [sharing/the comment]! [Acknowledge their specific point.]

If your board ever needs guidance on [relevant topic], feel free to reach out — we help HOA boards navigate financing options every day.

[Link to relevant resource if applicable]

Best,
HOA Project Funding Team
```

**General Engagement**:
```
Thanks for the comment! Appreciate you being part of the conversation. 🙌
```

### 4. Daily Digest (Telegram)

**Sent at 8:30 AM** after engagement check:

```
📊 HOA Social Engagement Digest - Feb 13, 2026

🔥 HIGH-INTENT LEADS (3)
━━━━━━━━━━━━━━━━━━━━━━━━━
1. LinkedIn - Sarah Chen (Property Manager)
   💬 "We need financing for $400K roof project..."
   🔗 https://linkedin.com/...

2. Twitter - @HOABoardPresident
   💬 "Anyone know good financing options..."
   🔗 https://twitter.com/...

3. Facebook - John Miller
   💬 "How do reserve fund loans work?..."
   🔗 https://facebook.com/...

🌟 WARM LEADS (5)
💬 GENERAL ENGAGEMENT (12)
📈 NEW FOLLOWERS/CONNECTIONS (7)

📁 All draft responses saved to:
/workspaces/hoa-social-engagement/drafts/2026-02-13-responses.md

✅ Next: Review and approve responses for posting
```

### 5. Weekly Metrics Report

**Every Monday at 9:00 AM**:

Collects past 7 days of metrics from all platforms:

**Tracked Metrics**:
- Impressions (reach)
- Engagements (likes, comments, shares, clicks)
- Engagement rate (%)
- New followers/connections
- High-intent leads identified
- Warm leads identified
- Top-performing posts

**Saved to**: `metrics/weekly-YYYY-MM-DD.json`

**Telegram Report**:
```
📊 Weekly Social Media Report - Week of Feb 10-17

📈 ENGAGEMENT OVERVIEW
Total Impressions: 15,800
Total Engagements: 450
Avg Engagement Rate: 2.85%

💼 LINKEDIN: 4,500 impressions, 127 engagements (2.82%)
🐦 TWITTER: 8,200 impressions, 234 engagements (2.85%)
📘 FACEBOOK: 3,100 impressions, 89 engagements (2.87%)

🎯 LEAD GENERATION
• 8 high-intent leads identified
• 15 warm leads nurtured
• 23 draft responses created
```

---

## Usage Examples

### Example 1: Manual Daily Check

```bash
npx openclaw agent --agent hoa-social-engagement --local \
  --message "Check social media for new engagement and draft responses"
```

**Output**:
- Drafts saved to `/drafts/2026-02-13-responses.md`
- Leads logged to `/leads/hot-leads.json` and `/leads/warm-leads.json`
- Telegram digest sent

### Example 2: Check Specific Platform

```bash
npx openclaw agent --agent hoa-social-engagement --local \
  --message "Check LinkedIn for new comments and mentions, draft responses for any leads"
```

### Example 3: Weekly Metrics

```bash
npx openclaw agent --agent hoa-social-engagement --local \
  --message "Generate weekly engagement metrics report for the past 7 days"
```

**Output**:
- Metrics saved to `/metrics/weekly-2026-02-17.json`
- Telegram report sent with summary

### Example 4: Review and Post Responses

```bash
# 1. Review drafts
cat workspaces/hoa-social-engagement/drafts/2026-02-13-responses.md

# 2. Edit if needed (use text editor)

# 3. Post manually to each platform (copy & paste)

# 4. Mark as posted (move to posted directory)
mv workspaces/hoa-social-engagement/drafts/2026-02-13-responses.md \
   workspaces/hoa-social-engagement/posted/
```

---

## Directory Structure

```
workspaces/hoa-social-engagement/
├── SOUL.md                           ← Agent instructions
├── TOOLS.md                          ← API usage examples
├── README.md                         ← Workspace guide
├── drafts/
│   ├── 2026-02-13-responses.md      ← Daily draft responses (awaiting approval)
│   ├── 2026-02-14-responses.md
│   └── example-responses.md         ← Template example
├── posted/
│   └── 2026-02-13-responses.md      ← Approved and posted (archived)
├── leads/
│   ├── hot-leads.json               ← High-intent leads (🔥)
│   ├── warm-leads.json              ← Warm leads (🌟)
│   └── 2026-02-13-leads.md          ← Daily lead captures (markdown)
├── metrics/
│   ├── weekly-2026-02-17.json       ← Weekly engagement metrics
│   ├── weekly-2026-02-10.json
│   └── metrics-template.json        ← Template structure
└── logs/
    ├── engagement-log.csv           ← All interactions logged (CSV)
    └── errors.log                   ← API errors
```

---

## Response Approval Workflow

### Option 1: Manual Posting (Recommended for Control)

1. **Receive Telegram digest** (8:30 AM)
2. **Open drafts file**: `/workspaces/hoa-social-engagement/drafts/YYYY-MM-DD-responses.md`
3. **Review each response**:
   - Check for accuracy
   - Verify tone is appropriate
   - Edit if needed (personalize, add details)
4. **Copy & paste** to each platform manually
5. **Mark as posted**: Move file from `drafts/` to `posted/`

### Option 2: Semi-Automated (Mixpost Integration)

1. **Agent creates drafts** and queues to Mixpost (if configured)
2. **Review in Mixpost dashboard**
3. **Approve or edit** responses in bulk
4. **Mixpost posts** automatically at your approval

### Option 3: Bulk Approval Script (Advanced)

Create custom script:
```bash
#!/bin/bash
# Read today's drafts
cat workspaces/hoa-social-engagement/drafts/$(date +%Y-%m-%d)-responses.md

# For each draft, prompt: Approve / Edit / Skip
# If approved, post via API
```

---

## High-Intent Lead Handling

### When a Hot Lead Appears (🔥)

**Immediate Actions** (within 2 hours):
1. **Respond on social media** — Use drafted response (personalize if needed)
2. **Add to CRM** — Log lead with details (name, company, project, amount)
3. **Send follow-up email** — If they provided contact info
4. **Book consultation** — Offer calendar link for call
5. **Track progress** — Monitor for additional engagement

**Example Hot Lead Flow**:
```
8:00 AM → Agent detects hot lead (Sarah Chen asking about $400K roof financing)
8:30 AM → Telegram digest sent, draft response created
9:00 AM → You review draft, personalize slightly
9:15 AM → Post response to LinkedIn
9:20 AM → Add Sarah to CRM with "hot lead - roof financing $400K" tag
9:30 AM → Send follow-up email with consultation calendar link
10:00 AM → Sarah books consultation for tomorrow
```

### When a Warm Lead Appears (🌟)

**Nurture Strategy** (within 24 hours):
1. **Respond helpfully** — Answer their question without being pushy
2. **Provide value** — Share relevant blog post or resource
3. **Soft CTA** — "Let us know if you ever need help with..."
4. **Track** — Add to warm leads list, monitor for repeat engagement
5. **Follow up** — If they engage again, escalate to hot lead

---

## API Rate Limits

**LinkedIn**:
- 100 requests per hour
- Resets hourly

**Twitter**:
- 15 requests per 15 minutes (for mentions endpoint)
- 300 requests per 15 minutes (for tweets endpoint)

**Facebook**:
- 200 requests per hour
- 600 requests per user per rolling hour

**Handling rate limits**:
- Agent checks rate limit headers
- If limit hit, waits and retries after reset
- Logs rate limit errors to `logs/errors.log`

---

## Metrics Tracked

### Engagement Metrics (Weekly)

**Per Platform**:
- **Impressions**: How many people saw posts
- **Engagements**: Total likes + comments + shares + clicks
- **Engagement Rate**: (Engagements / Impressions) × 100
- **New Followers/Connections**: Growth in audience size

**Cross-Platform**:
- Total impressions
- Total engagements
- Average engagement rate
- Top-performing post (highest engagement)

### Lead Metrics

- High-intent leads identified (🔥)
- Warm leads identified (🌟)
- Lead sources (LinkedIn vs Twitter vs Facebook)
- Responses drafted
- Responses approved and posted
- Approval rate (%)

### Content Performance

- Top 3 performing posts by platform
- Best content type (educational, case study, lead gen)
- Best posting times
- Most engaging topics

---

## Best Practices

### Response Timing

**Hot leads** (🔥): Respond within 2 hours (during business hours 8 AM - 6 PM EST)
**Warm leads** (🌟): Respond within 24 hours
**General engagement** (💬): Respond within 48 hours

### Response Quality

**Do**:
- ✅ Personalize with their name and specific situation
- ✅ Answer their question directly
- ✅ Provide value (insight, resource, next step)
- ✅ Use professional but friendly tone
- ✅ Include clear CTA (not pushy)

**Don't**:
- ❌ Copy-paste generic responses
- ❌ Be overly salesy or pushy
- ❌ Ignore negative comments (address them professionally)
- ❌ Auto-post without review
- ❌ Make promises you can't keep

### Lead Follow-Up

**Hot Leads**:
1. Respond on social media
2. Add to CRM immediately
3. Send follow-up email within 24 hours
4. Book consultation call
5. Track progress to close

**Warm Leads**:
1. Respond on social media
2. Add to warm leads list
3. Monitor for repeat engagement
4. Nurture with helpful content
5. Escalate if they become hot

---

## Troubleshooting

### No interactions detected

**Check**:
```bash
# Verify API credentials
echo $LINKEDIN_ACCESS_TOKEN
echo $TWITTER_BEARER_TOKEN
echo $FACEBOOK_PAGE_ACCESS_TOKEN

# Test API endpoints manually
curl -H "Authorization: Bearer ${LINKEDIN_ACCESS_TOKEN}" \
  "https://api.linkedin.com/v2/me"
```

**Fix**:
- Tokens may be expired (LinkedIn: 60 days, Facebook: 60 days, Twitter: no expiry)
- Refresh tokens in platform developer console
- Update `.env.local` with new tokens

### Drafts not generating

**Check**:
- Agent logs: `npx openclaw runs list --agent hoa-social-engagement`
- Workspace permissions: `ls -la workspaces/hoa-social-engagement/drafts/`

**Fix**:
- Ensure workspace has write permissions
- Check SOUL.md template is correct
- Verify agent has LLM access for response generation

### Telegram digest not sending

**Check**:
```bash
# Test Telegram bot manually
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  -d "text=Test message"
```

**Fix**:
- Verify bot token is correct
- Check chat ID is correct (number, not username)
- Ensure bot is started (send /start to bot first)

### Metrics not tracking

**Check**:
- Platform analytics API enabled (may need separate permission)
- Metrics file write permissions
- Cron job running: `npx openclaw cron list`

**Fix**:
- Enable analytics API in platform developer console
- Check `/metrics/` directory exists and is writable
- Verify weekly cron job is scheduled

---

## Security & Privacy

**Data Handling**:
- Social media data accessed via official APIs only
- No credentials stored in workspace files (use `.env.local`)
- Draft responses contain user data — do not share publicly
- Lead data stored locally in workspace (not sent externally)

**API Tokens**:
- Use environment variables (never hardcode)
- Rotate tokens every 60 days (LinkedIn, Facebook)
- Limit token permissions (read-only where possible)
- Monitor for unauthorized access

**Response Review**:
- NEVER auto-post responses (always review first)
- Check for sensitive information before posting
- Ensure compliance with platform terms of service

---

## Integration with Content Pipeline

This skill complements the HOA marketing automation system:

**Content Creation** → **Social Posting** → **Engagement Monitoring** → **Lead Nurture**

```
hoa-content-writer → hoa-social-media → hoa-social-engagement → CRM/Sales
     (Blog posts)      (Social posts)    (Lead identification)   (Follow-up)
```

**Workflow**:
1. `hoa-content-writer` generates blog post (Mon/Wed/Fri 6 AM)
2. `hoa-social-media` converts to social posts (7 AM)
3. Posts go live on LinkedIn/Twitter/Facebook
4. `hoa-social-engagement` monitors comments/replies (8 AM next day)
5. Hot leads identified and drafted responses
6. You approve responses and follow up via CRM

---

## Next Steps

1. **Run setup script** to create workspace ✅ Ready to run
2. **Configure API credentials** for LinkedIn, Twitter, Facebook
3. **Test API connections** to verify access
4. **Run manual test** to verify agent works
5. **Schedule daily cron** for automated monitoring
6. **Set up Telegram** for digest notifications
7. **Review first week** to calibrate response quality
8. **Track weekly metrics** to optimize engagement

---

**Created for**: HOA Project Funding (www.hoaprojectfunding.com)
**Agent ID**: `hoa-social-engagement`
**Schedule**: Daily 8 AM (monitoring), Weekly Mon 9 AM (metrics)
**Integration**: Works with `hoa-social-media` content posting
