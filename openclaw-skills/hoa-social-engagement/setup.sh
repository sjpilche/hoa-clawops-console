#!/bin/bash
# Setup script for HOA Social Media Engagement Monitor skill

set -e

WORKSPACE_DIR="/home/sjpilche/projects/openclaw-v1/workspaces/hoa-social-engagement"
AGENT_ID="hoa-social-engagement"

echo "🏗️  Setting up HOA Social Media Engagement Monitor skill..."
echo ""

# 1. Create workspace directory structure
echo "📁 Creating workspace directories..."
mkdir -p "$WORKSPACE_DIR/drafts"
mkdir -p "$WORKSPACE_DIR/posted"
mkdir -p "$WORKSPACE_DIR/leads"
mkdir -p "$WORKSPACE_DIR/metrics"
mkdir -p "$WORKSPACE_DIR/logs"
cd "$WORKSPACE_DIR"

# 2. Copy SOUL.md
echo "📝 Creating SOUL.md..."
if [ -f "/mnt/c/Users/SPilcher/OpenClaw2.0 for linux/openclaw-skills/hoa-social-engagement/SOUL.md" ]; then
  cp "/mnt/c/Users/SPilcher/OpenClaw2.0 for linux/openclaw-skills/hoa-social-engagement/SOUL.md" SOUL.md
else
  echo "⚠️  SOUL.md not found at expected location"
fi

# 3. Create TOOLS.md
echo "🔧 Creating TOOLS.md..."
cat > TOOLS.md << 'ENDTOOLS'
# TOOLS.md - HOA Social Media Engagement Monitor

## Platform APIs & Credentials

### LinkedIn API

**Required env variables**:
- `LINKEDIN_ACCESS_TOKEN` - OAuth access token
- `LINKEDIN_ORGANIZATION_ID` - Company page ID (e.g., 12345678)

**Setup**:
1. Create LinkedIn app: https://www.linkedin.com/developers/apps
2. Request permissions: `r_organization_social`, `w_organization_social`, `r_basicprofile`
3. Generate OAuth 2.0 access token
4. Get organization ID from company page URL

**Check mentions**:
```bash
curl -H "Authorization: Bearer ${LINKEDIN_ACCESS_TOKEN}" \
  "https://api.linkedin.com/v2/socialActions?q=mentions&mentionedEntity=urn:li:organization:${LINKEDIN_ORGANIZATION_ID}&count=50"
```

**Get comments on posts**:
```bash
curl -H "Authorization: Bearer ${LINKEDIN_ACCESS_TOKEN}" \
  "https://api.linkedin.com/v2/socialActions/${POST_URN}/comments?count=50"
```

**Get page analytics**:
```bash
curl -H "Authorization: Bearer ${LINKEDIN_ACCESS_TOKEN}" \
  "https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:${LINKEDIN_ORGANIZATION_ID}"
```

---

### Twitter/X API

**Required env variables**:
- `TWITTER_BEARER_TOKEN` - OAuth 2.0 Bearer Token
- `TWITTER_USER_ID` - Your account user ID
- `TWITTER_API_KEY` - API Key (for posting)
- `TWITTER_API_SECRET` - API Secret

**Setup**:
1. Create Twitter app: https://developer.twitter.com/en/portal/dashboard
2. Enable OAuth 2.0 with Read + Write permissions
3. Generate Bearer Token
4. Get your user ID from profile

**Check mentions**:
```bash
curl -H "Authorization: Bearer ${TWITTER_BEARER_TOKEN}" \
  "https://api.twitter.com/2/users/${TWITTER_USER_ID}/mentions?max_results=50&tweet.fields=created_at,public_metrics,conversation_id"
```

**Check replies to your tweets**:
```bash
curl -H "Authorization: Bearer ${TWITTER_BEARER_TOKEN}" \
  "https://api.twitter.com/2/tweets/search/recent?query=conversation_id:${TWEET_ID}&max_results=50"
```

**Get tweet analytics**:
```bash
curl -H "Authorization: Bearer ${TWITTER_BEARER_TOKEN}" \
  "https://api.twitter.com/2/tweets?ids=${TWEET_IDS}&tweet.fields=public_metrics,non_public_metrics,organic_metrics"
```

---

### Facebook API

**Required env variables**:
- `FACEBOOK_PAGE_ACCESS_TOKEN` - Long-lived page access token
- `FACEBOOK_PAGE_ID` - Page ID

**Setup**:
1. Create Facebook app: https://developers.facebook.com/apps
2. Add "Pages" permission
3. Generate long-lived page access token (60 days)
4. Get page ID from page settings

**Get comments on posts**:
```bash
curl "https://graph.facebook.com/v18.0/${FACEBOOK_PAGE_ID}/feed?fields=comments{from,message,created_time,id}&access_token=${FACEBOOK_PAGE_ACCESS_TOKEN}"
```

**Get page mentions**:
```bash
curl "https://graph.facebook.com/v18.0/${FACEBOOK_PAGE_ID}/tagged?fields=from,message,created_time&access_token=${FACEBOOK_PAGE_ACCESS_TOKEN}"
```

**Get Messenger conversations**:
```bash
curl "https://graph.facebook.com/v18.0/${FACEBOOK_PAGE_ID}/conversations?fields=messages{from,message,created_time}&access_token=${FACEBOOK_PAGE_ACCESS_TOKEN}"
```

**Get page insights (weekly)**:
```bash
curl "https://graph.facebook.com/v18.0/${FACEBOOK_PAGE_ID}/insights?metric=page_impressions,page_engaged_users,page_followers,page_post_engagements&period=week&access_token=${FACEBOOK_PAGE_ACCESS_TOKEN}"
```

---

## High-Intent Keyword Detection

**Use grep or pattern matching to identify keywords**:

```bash
# Check for hot lead keywords (3+ = hot lead)
echo "$message" | grep -iE "(loan|financing|fund|borrow|reserve study|special assessment|capital improvement|quote|rate|how much)"
```

**Hot Lead Keywords** (if 3+ found in message):
- loan, loans, financing, fund, funding, borrow
- reserve study, reserve fund, reserves
- special assessment, assessment
- capital improvement, capital project
- roof replacement, pool renovation, elevator repair
- quote, cost, rate, rates, terms, approval
- how much, how long, what are, do you offer

**Warm Lead Keywords** (if 1-2 found):
- HOA board, board member, property manager
- homeowner, community, association
- budget, budgeting, planning
- interested, considering, thinking about
- help, advice, guidance

---

## Response Drafting

**Format response with markdown**:

```bash
cat > drafts/YYYY-MM-DD-responses.md << EOF
# Social Engagement Drafts - $(date +%Y-%m-%d)

## 🔥 HOT LEAD #1
**Platform**: LinkedIn
**From**: [Name]
**Message**: "[Original message]"
**Link**: [URL]
**Keywords**: [list]

**DRAFT RESPONSE**:
Hi [Name],

[Personalized response based on their question]

[Call to action with consultation link]

Best,
HOA Project Funding Team

---
EOF
```

---

## Telegram Notifications

**Send daily digest**:
```bash
DIGEST="📊 HOA Social Engagement Digest - $(date +%Y-%m-%d)

🔥 HIGH-INTENT LEADS (${HOT_COUNT})
━━━━━━━━━━━━━━━━━━━━━━━━━
[Lead summaries]

🌟 WARM LEADS (${WARM_COUNT})
━━━━━━━━━━━━━━━━━━━━━━━━━
[Lead summaries]

📁 Drafts: /workspaces/hoa-social-engagement/drafts/$(date +%Y-%m-%d)-responses.md"

curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  -d "text=${DIGEST}" \
  -d "parse_mode=Markdown"
```

---

## File Operations

**Save draft responses**:
```bash
write "workspaces/hoa-social-engagement/drafts/YYYY-MM-DD-responses.md" [content]
```

**Log leads to JSON**:
```bash
jq '.leads += [{"id": "lead-001", "date": "2026-02-13", ...}]' leads/hot-leads.json > leads/hot-leads.tmp.json
mv leads/hot-leads.tmp.json leads/hot-leads.json
```

**Save weekly metrics**:
```bash
write "workspaces/hoa-social-engagement/metrics/weekly-YYYY-MM-DD.json" [metrics data]
```

---

## Sentiment Analysis

**Simple keyword-based sentiment**:

**Positive keywords**:
- great, excellent, helpful, thanks, appreciate, love, perfect, amazing

**Negative keywords**:
- bad, terrible, awful, disappointed, frustrated, angry, horrible, worst

**Question keywords**:
- how, what, when, where, why, can you, do you, is it, are there

```bash
if echo "$message" | grep -iE "(great|excellent|helpful|thanks)"; then
  sentiment="positive"
elif echo "$message" | grep -iE "(bad|terrible|disappointed)"; then
  sentiment="negative"
elif echo "$message" | grep -iE "(how|what|when|why|can you)"; then
  sentiment="question"
else
  sentiment="neutral"
fi
```

---

## Logging

**Append to engagement log**:
```bash
echo "$(date -Iseconds),${platform},${from},${message},${lead_type},${response_id}" >> logs/engagement-log.csv
```

**JSON log format**:
```json
{
  "timestamp": "2026-02-13T08:45:00-05:00",
  "platform": "linkedin",
  "interaction_type": "comment",
  "from": "Sarah Chen",
  "profile": "https://linkedin.com/in/sarahchen",
  "message": "We need financing for a $400K roof project...",
  "sentiment": "question",
  "lead_type": "hot",
  "keywords": ["financing", "roof project"],
  "draft_response_id": "draft-20260213-001",
  "status": "draft_created"
}
```

---

## Error Handling

**Check API rate limits**:
```bash
# LinkedIn: 100 requests per hour
# Twitter: 15 requests per 15 minutes for mentions
# Facebook: 200 requests per hour

# If rate limit hit, wait and retry
if [ "$http_status" = "429" ]; then
  echo "Rate limit hit, waiting 60 seconds..."
  sleep 60
  # Retry request
fi
```

**Handle API errors**:
```bash
# Check HTTP status
STATUS=$(curl -w "%{http_code}" -s -o response.json [url])

if [ "$STATUS" -eq 200 ]; then
  echo "Success"
elif [ "$STATUS" -eq 401 ]; then
  echo "Authentication failed - check access token"
elif [ "$STATUS" -eq 429 ]; then
  echo "Rate limit - wait and retry"
else
  echo "Error: HTTP $STATUS"
fi
```
ENDTOOLS

# 4. Initialize lead tracking files
echo "📋 Creating lead tracking files..."
cat > leads/hot-leads.json << 'ENDJSON'
{
  "leads": []
}
ENDJSON

cat > leads/warm-leads.json << 'ENDJSON'
{
  "leads": []
}
ENDJSON

# 5. Initialize metrics file
echo "📊 Creating metrics structure..."
cat > metrics/metrics-template.json << 'ENDMETRICS'
{
  "week_ending": "YYYY-MM-DD",
  "generated_at": "YYYY-MM-DDTHH:MM:SS-05:00",
  "platforms": {
    "linkedin": {
      "impressions": 0,
      "engagements": 0,
      "engagement_rate": 0,
      "new_connections": 0,
      "comments": 0,
      "shares": 0,
      "clicks": 0
    },
    "twitter": {
      "impressions": 0,
      "engagements": 0,
      "engagement_rate": 0,
      "new_followers": 0,
      "replies": 0,
      "retweets": 0,
      "likes": 0,
      "clicks": 0
    },
    "facebook": {
      "impressions": 0,
      "engagements": 0,
      "engagement_rate": 0,
      "new_likes": 0,
      "comments": 0,
      "shares": 0,
      "clicks": 0
    }
  },
  "total_high_intent_leads": 0,
  "total_warm_leads": 0,
  "total_responses_drafted": 0
}
ENDMETRICS

# 6. Create example draft response
echo "📝 Creating example draft response..."
cat > drafts/example-responses.md << 'ENDEXAMPLE'
# Social Engagement Drafts - Example

## 🔥 HOT LEAD #1
**Platform**: LinkedIn
**From**: Sarah Chen (Property Manager, ABC HOA Management)
**Profile**: https://linkedin.com/in/sarahchen
**Original Message**: "We need financing for a $400K roof project. What are our options besides special assessments?"
**Post Link**: https://linkedin.com/posts/hoaprojectfunding/abc123
**Timestamp**: 2026-02-13 07:42 AM EST
**Sentiment**: Question
**Keywords Found**: financing, roof project, special assessments, options (4 keywords)
**Priority**: HIGH

**DRAFT RESPONSE**:
Hi Sarah,

Great question! For a $400K roof project, you have several options beyond special assessments:

• Reserve fund loans — Borrow against your existing reserves without depleting them (ideal if ABC HOA has healthy reserves)
• Assessment-backed bonds — Spread costs over 10-15 years with predictable monthly payments
• HOA lines of credit — Flexible financing for phased work if you're doing the project in stages

Each option has different approval requirements and timelines. Would you like to schedule a quick call to discuss which fits ABC HOA's specific situation?

📅 Book a free consultation: https://hoaprojectfunding.com/consult
📧 Or email us at: contact@hoaprojectfunding.com

Happy to help!
HOA Project Funding Team

---

## 🔥 HOT LEAD #2
**Platform**: Twitter
**From**: @HOABoardPresident (John Miller)
**Profile**: https://twitter.com/HOABoardPresident
**Original Tweet**: "Anyone know good financing options for HOA capital improvements? Special assessments are killing us 😩"
**Tweet Link**: https://twitter.com/HOABoardPresident/status/123456789
**Timestamp**: 2026-02-13 08:15 AM EST
**Sentiment**: Negative (frustrated with special assessments)
**Keywords Found**: financing options, HOA, capital improvements, special assessments (4 keywords)
**Priority**: HIGH

**DRAFT RESPONSE**:
Hi John! You have several alternatives to special assessments for capital improvements:

• Reserve fund loans (fast approval)
• Assessment-backed bonds (10-15 year terms)
• Lines of credit (flexible for phased work)

Happy to walk through which fits your HOA's situation. DM us or check out our guide: [link]

We help boards avoid special assessments every day!

---

## 🌟 WARM LEAD #1
**Platform**: LinkedIn
**From**: Mike Rodriguez (HOA Treasurer)
**Profile**: https://linkedin.com/in/mikerodriguez
**Original Comment**: "Great article on avoiding special assessments! Sharing with my board."
**Post Link**: https://linkedin.com/posts/hoaprojectfunding/def456
**Timestamp**: 2026-02-13 09:20 AM EST
**Sentiment**: Positive
**Keywords Found**: special assessments, board (2 keywords)
**Priority**: MEDIUM

**DRAFT RESPONSE**:
Thanks for sharing, Mike! We're glad it was helpful. If your board ever needs guidance on specific financing options for a capital project, feel free to reach out — we're here to help! 📊

---

## 🌟 WARM LEAD #2
**Platform**: Facebook
**From**: Lisa Johnson
**Profile**: https://facebook.com/lisajohnson
**Original Comment**: "This is really useful information! Our HOA is considering a pool renovation next year."
**Post Link**: https://facebook.com/hoaprojectfunding/posts/789
**Timestamp**: 2026-02-13 10:05 AM EST
**Sentiment**: Positive
**Keywords Found**: HOA, pool renovation (2 keywords)
**Priority**: MEDIUM

**DRAFT RESPONSE**:
Thanks, Lisa! Pool renovations are a big investment, but there are great financing options that can spread costs over time and avoid hitting homeowners with a large assessment all at once.

If you'd like to explore options as you plan for next year, we'd be happy to chat: https://hoaprojectfunding.com/consult

Best of luck with the project! 🏊

---

## 💬 GENERAL ENGAGEMENT

**Total**: 15 interactions
- 10 likes on LinkedIn post about reserve fund loans
- 4 shares on Twitter thread about HOA financing
- 1 general "thanks for the info!" comment on Facebook

**No draft responses needed** — general positive engagement
ENDEXAMPLE

# 7. Create logs directory structure
echo "📁 Creating logs..."
touch logs/engagement-log.csv
echo "timestamp,platform,from,message_snippet,lead_type,response_id,status" > logs/engagement-log.csv

# 8. Create README in workspace
echo "📄 Creating workspace README..."
cat > README.md << 'ENDREADME'
# HOA Social Engagement Workspace

## Directory Structure

### drafts/
Draft responses awaiting approval. Check these daily after the agent runs.

**Format**: `YYYY-MM-DD-responses.md`

Review, edit if needed, then post manually or via social media tool.

### posted/
Archive of approved and posted responses.

After posting, move from `drafts/` to `posted/` for record-keeping.

### leads/
Lead tracking files.

- `hot-leads.json` — High-intent leads (3+ keywords)
- `warm-leads.json` — Warm leads (1-2 keywords)
- `YYYY-MM-DD-leads.md` — Daily lead captures

### metrics/
Weekly and monthly engagement metrics.

- `weekly-YYYY-MM-DD.json` — Weekly metrics report
- `monthly-summary.json` — Monthly rollup

### logs/
Interaction logs for all platforms.

- `engagement-log.csv` — All interactions logged
- `errors.log` — API errors and issues

## Workflow

1. **Daily (8:00 AM)** — Agent checks platforms, drafts responses, sends Telegram digest
2. **Review (8:30 AM - 10:00 AM)** — Review drafts in `drafts/YYYY-MM-DD-responses.md`
3. **Approve & Post** — Edit if needed, post to platforms manually
4. **Move to Posted** — Archive in `posted/` directory
5. **Follow Up Hot Leads** — Add to CRM, send email, book consultation

## High-Intent Lead Flags

🔥 **HOT LEAD** — Direct financing inquiry (3+ keywords)
- Priority: HIGH
- Response time: Within 2 hours
- Action: Respond + follow up via email/CRM

🌟 **WARM LEAD** — Showing interest (1-2 keywords)
- Priority: MEDIUM
- Response time: Within 24 hours
- Action: Respond + track for future engagement

💬 **GENERAL ENGAGEMENT** — No specific ask (0 keywords)
- Priority: LOW
- Response time: Within 48 hours
- Action: Respond if meaningful, otherwise just like/acknowledge
ENDREADME

# 9. Register agent with OpenClaw
echo "🦞 Registering agent with OpenClaw..."
cd /home/sjpilche/projects/openclaw-v1
npx openclaw agents add $AGENT_ID \
  --workspace "$WORKSPACE_DIR" \
  --non-interactive \
  --json

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Configure social media API credentials in .env.local:"
echo "   # LinkedIn"
echo "   LINKEDIN_ACCESS_TOKEN=your_token"
echo "   LINKEDIN_ORGANIZATION_ID=your_org_id"
echo ""
echo "   # Twitter/X"
echo "   TWITTER_BEARER_TOKEN=your_token"
echo "   TWITTER_USER_ID=your_user_id"
echo ""
echo "   # Facebook"
echo "   FACEBOOK_PAGE_ACCESS_TOKEN=your_token"
echo "   FACEBOOK_PAGE_ID=your_page_id"
echo ""
echo "   # Telegram (for notifications)"
echo "   TELEGRAM_BOT_TOKEN=your_bot_token"
echo "   TELEGRAM_CHAT_ID=your_chat_id"
echo ""
echo "2. Test API connections:"
echo "   curl -H 'Authorization: Bearer \${LINKEDIN_ACCESS_TOKEN}' \\"
echo "     'https://api.linkedin.com/v2/me'"
echo ""
echo "3. Test engagement check:"
echo "   npx openclaw agent --agent $AGENT_ID --local \\"
echo "     --message 'Check social media for new engagement and draft responses'"
echo ""
echo "4. Set up daily cron job:"
echo "   npx openclaw cron add \\"
echo "     --agent $AGENT_ID \\"
echo "     --cron '0 8 * * *' \\"
echo "     --message 'Check all social platforms, draft responses, send daily digest' \\"
echo "     --tz 'America/New_York' \\"
echo "     --name 'HOA Social Engagement - Daily Check'"
echo ""
echo "5. Set up weekly metrics cron:"
echo "   npx openclaw cron add \\"
echo "     --agent $AGENT_ID \\"
echo "     --cron '0 9 * * 1' \\"
echo "     --message 'Generate weekly engagement metrics report' \\"
echo "     --tz 'America/New_York' \\"
echo "     --name 'HOA Social Engagement - Weekly Metrics'"
echo ""
echo "Workspace: $WORKSPACE_DIR"
echo "Drafts: $WORKSPACE_DIR/drafts/"
echo "Leads: $WORKSPACE_DIR/leads/"
echo "Metrics: $WORKSPACE_DIR/metrics/"
