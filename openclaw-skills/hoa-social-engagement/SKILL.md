# HOA Social Media Engagement Monitor

Automated social media engagement tracking and response drafting for HOA Project Funding.

## Overview

This skill monitors LinkedIn, X/Twitter, and Facebook for brand mentions, comments, and direct messages. It drafts professional responses, identifies high-intent leads, and sends you a daily digest with suggested actions.

**Important**: All responses are DRAFTS only. The agent never auto-replies — you approve all responses before they're posted.

## What It Does

### 1. Daily Engagement Monitoring

**Checks daily** (8:00 AM EST):
- LinkedIn: Company page comments, post replies, DMs, mentions
- X/Twitter: Replies, mentions, quote tweets, DMs
- Facebook: Page comments, post replies, Messenger messages

**For each interaction**:
- Categorizes by type (comment, reply, DM, mention)
- Identifies sentiment (positive, neutral, negative, question)
- Flags high-intent leads (asking about loans, financing, project funding)
- Drafts suggested response

### 2. Lead Identification

**High-Intent Keywords**:
- "loan", "financing", "fund", "borrow"
- "reserve study", "reserve fund"
- "special assessment", "assessment"
- "capital improvement", "roof replacement", "pool renovation"
- "HOA board", "property manager"
- "quote", "cost", "rate", "terms"
- "how much", "how long", "approval"

**Lead Scoring**:
- 🔥 **Hot Lead** (3+ keywords): Direct inquiry about financing
- 🌟 **Warm Lead** (1-2 keywords): Showing interest, needs nurturing
- 💬 **Engagement** (0 keywords): General comment, question, or mention

### 3. Response Drafting

**Tone**: Friendly, professional, helpful (never salesy or pushy)

**Response Templates**:

**For questions about HOA financing**:
```
Thanks for reaching out! HOA project financing depends on a few factors like your reserve fund balance, project timeline, and community size. We'd be happy to walk through your options — would you like to schedule a quick consultation? You can reach us at [contact link] or reply here with your project details. 🏘️
```

**For mentions/shares of content**:
```
Thanks for sharing! We're glad this was helpful. If you or your board ever need guidance on HOA financing options, feel free to reach out — we're here to help! 📊
```

**For negative sentiment/complaints**:
```
We appreciate you taking the time to share your feedback. We'd love to understand more about your concerns and see how we can help. Could you send us a DM or email us at [contact email]? We're committed to supporting HOA boards with transparent, flexible financing solutions.
```

**For general engagement**:
```
Appreciate the comment! Let us know if you ever have questions about HOA financing — we're always happy to help boards navigate their options. 🙌
```

### 4. Daily Engagement Digest

**Sent via Telegram at 8:30 AM**:

```
📊 HOA Social Engagement Digest - Feb 13, 2026

🔥 HIGH-INTENT LEADS (3)
━━━━━━━━━━━━━━━━━━━━━━━━━
1. LinkedIn - Sarah Chen (Property Manager, ABC HOA)
   💬 "We need financing for a $400K roof project. What are our options besides special assessments?"
   ✏️ Draft response: [view in workspace]
   🔗 https://linkedin.com/...

2. Twitter - @HOABoardPresident
   💬 "Anyone know good financing options for HOA capital improvements? Special assessments are killing us"
   ✏️ Draft response: [view in workspace]
   🔗 https://twitter.com/...

3. Facebook - John Miller
   💬 "How do reserve fund loans work? Our HOA needs $250K for elevator repairs"
   ✏️ Draft response: [view in workspace]
   🔗 https://facebook.com/...

🌟 WARM LEADS (5)
━━━━━━━━━━━━━━━━━━━━━━━━━
4. LinkedIn - Mike Rodriguez (HOA Treasurer)
   💬 "Great article on avoiding special assessments!"
   ✏️ Draft response: [view in workspace]

[... 4 more warm leads]

💬 GENERAL ENGAGEMENT (12)
━━━━━━━━━━━━━━━━━━━━━━━━━
[Summary: 8 likes, 3 shares, 1 general comment]

📈 NEW FOLLOWERS/CONNECTIONS (7)
━━━━━━━━━━━━━━━━━━━━━━━━━
- LinkedIn: 4 new connections (2 property managers, 1 HOA board member, 1 finance professional)
- Twitter: 2 new followers
- Facebook: 1 new page like

📁 All draft responses saved to:
/workspaces/hoa-social-engagement/drafts/2026-02-13-responses.md

✅ To approve and post responses:
Review drafts → Edit if needed → Use manual posting or social media tool
```

### 5. Weekly Metrics Report

**Every Monday at 9:00 AM**:

Analyzes past 7 days and logs to `metrics/weekly-YYYY-MM-DD.json`:

```json
{
  "week_ending": "2026-02-17",
  "platforms": {
    "linkedin": {
      "impressions": 4500,
      "engagements": 127,
      "engagement_rate": 2.82,
      "new_connections": 12,
      "comments": 8,
      "shares": 15,
      "clicks": 42
    },
    "twitter": {
      "impressions": 8200,
      "engagements": 234,
      "engagement_rate": 2.85,
      "new_followers": 18,
      "replies": 12,
      "retweets": 24,
      "likes": 67,
      "clicks": 38
    },
    "facebook": {
      "impressions": 3100,
      "engagements": 89,
      "engagement_rate": 2.87,
      "new_likes": 5,
      "comments": 6,
      "shares": 8,
      "clicks": 21
    }
  },
  "total_high_intent_leads": 8,
  "total_warm_leads": 15,
  "total_responses_drafted": 23,
  "top_performing_post": {
    "platform": "linkedin",
    "title": "5 HOA Roof Replacement Financing Options",
    "engagements": 45,
    "leads_generated": 3
  }
}
```

---

## How to Use

### Daily Monitoring (Automated)

**Set up cron job**:
```bash
npx openclaw cron add \
  --agent hoa-social-engagement \
  --cron "0 8 * * *" \
  --message "Check all social platforms for new engagement, draft responses, and send daily digest" \
  --tz "America/New_York" \
  --name "HOA Social Engagement - Daily Check"
```

**Every morning at 8:30 AM**:
- Receive Telegram digest with flagged leads
- Review draft responses in `/workspaces/hoa-social-engagement/drafts/`
- Approve and post responses manually

### Manual Check

```bash
npx openclaw agent --agent hoa-social-engagement --local \
  --message "Check social media for new engagement and draft responses for high-intent leads"
```

### Weekly Metrics

**Set up cron job**:
```bash
npx openclaw cron add \
  --agent hoa-social-engagement \
  --cron "0 9 * * 1" \
  --message "Generate weekly engagement metrics report and analyze top-performing content" \
  --tz "America/New_York" \
  --name "HOA Social Engagement - Weekly Metrics"
```

**Every Monday at 9:00 AM**:
- Receive Telegram report with weekly metrics
- Check `/workspaces/hoa-social-engagement/metrics/` for detailed JSON

---

## Response Approval Workflow

### Option 1: Manual Posting (Safest)

1. **Receive digest** → Check Telegram for leads
2. **Review drafts** → Open `/drafts/YYYY-MM-DD-responses.md`
3. **Edit if needed** → Adjust tone, add details
4. **Copy & paste** → Post manually to each platform
5. **Mark as posted** → Move to `/posted/` directory

### Option 2: Semi-Automated (Mixpost)

1. **Receive digest** → Check high-intent leads
2. **Review drafts** → Check quality
3. **Queue to Mixpost** → Drafts auto-queued as "pending approval"
4. **Approve in Mixpost** → Bulk approve or edit
5. **Mixpost posts** → Responses go live

### Option 3: Bulk Approval Script (Advanced)

Create approval script that:
- Reads all drafts from today
- Shows each with context
- Prompts: Approve / Edit / Skip
- Posts approved responses via API

---

## High-Intent Lead Handling

### When a Hot Lead Appears (🔥)

**Immediate Actions**:
1. **Respond quickly** (within 2 hours if possible)
2. **Personalize** the draft response with their specific project details
3. **Offer consultation** — always include calendar link or contact info
4. **Follow up** — add to CRM, send email if they provided contact

**Draft Format for Hot Leads**:
```
Hi [Name],

Great question! For a [project type] in the [$XXX,XXX range], you typically have a few financing options:

• Reserve fund loans (if you have adequate reserves)
• Assessment-backed bonds (spread costs over 10-15 years)
• Lines of credit (flexible for phased work)

Each has different requirements and timelines. Would you like to schedule a quick call to discuss which fits your HOA's situation best?

📅 Book a consultation: [link]
📧 Or email us: contact@hoaprojectfunding.com

Happy to help!
```

### When a Warm Lead Appears (🌟)

**Nurture Strategy**:
1. **Respond helpfully** — answer their question without being pushy
2. **Provide value** — share relevant blog post or resource
3. **Soft CTA** — "Let us know if you ever need help with..."
4. **Track** — add to warm leads list, follow up if they engage again

---

## Platform-Specific Notes

### LinkedIn

**Best for**:
- Property managers, HOA board members
- Professional discussions about financing
- B2B lead generation

**Response style**: Professional, advisory, data-driven

**API Endpoints**:
- Comments on company posts
- Mentions in other people's posts
- Direct messages
- Connection requests

### X/Twitter

**Best for**:
- Quick questions, trending topics
- Broad HOA community engagement
- Fast response expected

**Response style**: Punchy, helpful, emoji-friendly

**API Endpoints**:
- Replies to tweets
- Mentions in tweets
- Quote tweets
- Direct messages

### Facebook

**Best for**:
- Community groups, HOA residents
- More personal, emotional discussions
- Longer-form questions

**Response style**: Warm, empathetic, community-focused

**API Endpoints**:
- Comments on page posts
- Private messages
- Mentions in groups (if public)
- Page reviews

---

## Metrics Tracked

**Engagement Metrics**:
- Impressions (how many people saw posts)
- Engagements (likes, comments, shares, clicks)
- Engagement rate (engagements / impressions)
- Click-through rate (clicks / impressions)

**Growth Metrics**:
- New followers/connections
- New likes/follows per week
- Follower growth rate

**Lead Metrics**:
- High-intent leads per week
- Warm leads per week
- Lead sources (LinkedIn vs Twitter vs Facebook)
- Conversion rate (leads → consultations booked)

**Content Performance**:
- Top-performing posts by engagement
- Best-performing content type (educational, case study, lead gen)
- Best posting times by platform

---

## Content That Drives Engagement

**Top Performers** (based on HOA industry trends):

1. **Educational content** (40% of engagement)
   - "5 HOA financing options explained"
   - "Reserve fund loans vs special assessments"
   - "How to budget for capital improvements"

2. **Case studies** (30% of engagement)
   - "How [HOA Name] funded $300K roof project"
   - "Real-world example: Pool renovation without assessments"

3. **Timely/seasonal** (20% of engagement)
   - "Spring roof inspection tips"
   - "Year-end budget planning checklist"

4. **Lead generation** (10% of engagement, but highest conversion)
   - "Free HOA financing consultation"
   - "Download our reserve fund planning guide"

**Engagement Triggers**:
- Ask questions (e.g., "What's your HOA's biggest challenge?")
- Use numbers (e.g., "5 ways to...", "$200K project funded without...")
- Include data/statistics
- Show before/after scenarios
- Address pain points (special assessments, surprise bills)

---

## Files & Logs

**Directory Structure**:
```
workspaces/hoa-social-engagement/
├── drafts/
│   └── YYYY-MM-DD-responses.md       ← Daily draft responses
├── posted/
│   └── YYYY-MM-DD-responses.md       ← Approved and posted
├── leads/
│   ├── hot-leads.json                ← High-intent leads
│   ├── warm-leads.json               ← Warm leads
│   └── YYYY-MM-DD-leads.md           ← Daily lead captures
├── metrics/
│   ├── weekly-YYYY-MM-DD.json        ← Weekly metrics
│   └── monthly-summary.json          ← Monthly rollup
└── logs/
    └── engagement-log.json           ← All interactions logged
```

**Draft Response Format**:
```markdown
# Social Engagement Drafts - 2026-02-13

## 🔥 HOT LEAD #1
**Platform**: LinkedIn
**From**: Sarah Chen (Property Manager, ABC HOA Management)
**Post**: "We need financing for a $400K roof project..."
**Link**: https://linkedin.com/posts/...
**Sentiment**: Question
**Keywords**: financing, roof project, special assessments

**DRAFT RESPONSE**:
Hi Sarah,

Great question! For a $400K roof project, you have several options beyond special assessments:

• Reserve fund loans (if you have adequate reserves as collateral)
• Assessment-backed bonds (spread costs over 10-15 years)
• HOA lines of credit (flexible for phased work)

Each has different approval requirements and timelines. Would you like to schedule a quick call to discuss which fits ABC HOA's situation best?

📅 Book a consultation: https://hoaprojectfunding.com/consult
📧 Or reply here with your reserve balance and project timeline!

Happy to help,
HOA Project Funding Team

---

## 🌟 WARM LEAD #1
[...]
```

---

## Best Practices

### Response Timing

**Respond quickly**:
- Hot leads: Within 2 hours (if during business hours)
- Warm leads: Within 24 hours
- General engagement: Within 48 hours

**Business hours**: Mon-Fri, 8 AM - 6 PM EST

### Response Quality

**Do**:
- ✅ Be helpful and specific
- ✅ Acknowledge their question/concern
- ✅ Provide value (answer, resource, next step)
- ✅ Use their name if available
- ✅ Include clear CTA (but not pushy)

**Don't**:
- ❌ Copy-paste generic responses
- ❌ Be overly salesy or pushy
- ❌ Ignore negative comments
- ❌ Auto-reply without review
- ❌ Make promises you can't keep

### Lead Follow-Up

**Hot leads**:
1. Respond on social media
2. Add to CRM immediately
3. Send follow-up email within 24 hours
4. Book consultation call
5. Track progress

**Warm leads**:
1. Respond on social media
2. Add to warm leads list
3. Monitor for repeat engagement
4. Nurture with helpful content
5. Follow up if they engage again

---

## Troubleshooting

### Not detecting mentions

**Check**:
- Social media API credentials in `.env.local`
- API rate limits (Twitter: 15 requests/15 min)
- Platform permissions (read mentions, read DMs)

**Fix**:
- Verify tokens are valid and not expired
- Check OpenClaw agent logs for API errors
- Test API endpoints manually with curl

### Drafts not generating

**Check**:
- Agent has web_search or LLM access
- SOUL.md template is correct
- Workspace write permissions

**Fix**:
- Test agent manually with sample interaction
- Check logs for errors
- Verify workspace directory exists

### Metrics not tracking

**Check**:
- Platform analytics API access
- Metrics file write permissions
- Cron job is running weekly

**Fix**:
- Enable analytics API in platform developer console
- Check file permissions in /metrics/
- Verify cron job: `npx openclaw cron list`

---

## Next Steps

1. **Run setup script** to create workspace
2. **Configure API credentials** for LinkedIn, Twitter, Facebook
3. **Test manual check** to verify API connections
4. **Schedule daily cron** for automated monitoring
5. **Set up Telegram** for digest notifications
6. **Review first week of drafts** to calibrate tone
7. **Track metrics** to optimize engagement strategy

---

**Created for**: HOA Project Funding (www.hoaprojectfunding.com)
**Agent ID**: `hoa-social-engagement`
**Schedule**: Daily 8 AM (monitoring), Weekly Mon 9 AM (metrics)
**Integration**: Works with `hoa-social-media` for content posting
