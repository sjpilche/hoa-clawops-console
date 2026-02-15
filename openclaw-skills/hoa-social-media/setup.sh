#!/bin/bash
# Setup script for HOA Social Media Marketing skill

set -e

WORKSPACE_DIR="/home/sjpilche/projects/openclaw-v1/workspaces/hoa-social-media"
AGENT_ID="hoa-social-media"

echo "🏗️  Setting up HOA Social Media Marketing skill..."
echo ""

# 1. Create workspace directory structure
echo "📁 Creating workspace directories..."
mkdir -p "$WORKSPACE_DIR/posts"
mkdir -p "$WORKSPACE_DIR/calendars"
mkdir -p "$WORKSPACE_DIR/batches"
mkdir -p "$WORKSPACE_DIR/drafts"
cd "$WORKSPACE_DIR"

# 2. Copy SOUL.md
echo "📝 Creating SOUL.md..."
if [ -f "/mnt/c/Users/SPilcher/OpenClaw2.0 for linux/openclaw-skills/hoa-social-media/SOUL.md" ]; then
  cp "/mnt/c/Users/SPilcher/OpenClaw2.0 for linux/openclaw-skills/hoa-social-media/SOUL.md" SOUL.md
else
  echo "⚠️  SOUL.md not found at expected location"
fi

# 3. Create TOOLS.md
echo "🔧 Creating TOOLS.md..."
cat > TOOLS.md << 'ENDTOOLS'
# TOOLS.md - HOA Social Media Marketing

## Platform APIs & Credentials

### Mixpost (Recommended)

Mixpost is a self-hosted social media management tool. If installed:

**Check status**:
```bash
which mixpost
mixpost status
```

**Queue posts**:
```bash
mixpost queue --platform linkedin --content "Post content" --schedule "2026-03-15T09:00:00-05:00"
mixpost queue --platform twitter --content "Tweet text" --schedule "2026-03-15T13:00:00-05:00"
mixpost queue --platform facebook --content "Post content" --schedule "2026-03-15T14:00:00-05:00"
```

### Direct Platform APIs (Fallback)

If Mixpost is not installed, use direct APIs.

#### LinkedIn API

**Required env variables**:
- `LINKEDIN_ACCESS_TOKEN` - OAuth access token
- `LINKEDIN_ORGANIZATION_ID` - Company page ID

**Setup**:
1. Create LinkedIn app: https://www.linkedin.com/developers/apps
2. Request `w_organization_social` permission
3. Generate access token
4. Get organization ID from company page

**Post via curl**:
```bash
curl -X POST "https://api.linkedin.com/v2/ugcPosts" \
  -H "Authorization: Bearer ${LINKEDIN_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "author": "urn:li:organization:'"${LINKEDIN_ORGANIZATION_ID}"'",
    "lifecycleState": "PUBLISHED",
    "specificContent": {
      "com.linkedin.ugc.ShareContent": {
        "shareCommentary": {"text": "Your post content here"},
        "shareMediaCategory": "NONE"
      }
    },
    "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"}
  }'
```

#### Twitter/X API

**Required env variables**:
- `TWITTER_API_KEY`
- `TWITTER_API_SECRET`
- `TWITTER_ACCESS_TOKEN`
- `TWITTER_ACCESS_SECRET`

**Setup**:
1. Create Twitter app: https://developer.twitter.com/
2. Enable OAuth 1.0a
3. Generate API keys and access tokens

**Post via curl** (requires OAuth signature):
```bash
# Easier: use twitter CLI tool
npm install -g twitter-api-v2-cli
twitter post "Your tweet here"
```

#### Facebook API

**Required env variables**:
- `FACEBOOK_PAGE_ACCESS_TOKEN` - Long-lived page token
- `FACEBOOK_PAGE_ID` - Page ID

**Setup**:
1. Create Facebook app: https://developers.facebook.com/
2. Get page access token via Graph API Explorer
3. Exchange for long-lived token (60 days)

**Post via curl**:
```bash
curl -X POST "https://graph.facebook.com/v18.0/${FACEBOOK_PAGE_ID}/feed" \
  -d "message=Your post content here" \
  -d "access_token=${FACEBOOK_PAGE_ACCESS_TOKEN}"
```

## Content Sources

### Blog Posts Directory

Read from HOA Content Writer agent:
```bash
ls /home/sjpilche/projects/openclaw-v1/workspaces/hoa-content-writer/posts/
```

### Web Search

For seasonal trends and timely topics:
```bash
web_search "HOA [month] [year] trends"
web_search "HOA seasonal maintenance [season]"
```

## Output Directories

**Posts**: `./posts/YYYY-MM-DD-[topic]-[platform].md`
**Calendars**: `./calendars/YYYY-MM-calendar.json`
**Batches**: `./batches/YYYY-MM-DD-[topic]-all.json`

## Scheduling Times (America/New_York)

**LinkedIn**: Tue/Wed/Thu, 8:00-10:00 AM
**Twitter**: Mon-Fri, 12:00-3:00 PM
**Facebook**: Wed/Thu/Fri, 1:00-4:00 PM

## Hashtag Reference

**Always include 2-3**:
- #HOA
- #HOAmanagement
- #PropertyManagement
- #CommunityAssociation
- #HOAboard

**Topic-specific (1-2)**:
- #HOAbudget
- #ReserveFunds
- #SpecialAssessment
- #HOArepairs
- #HOAfinancing
ENDTOOLS

# 4. Create example calendar
echo "📅 Creating example calendar template..."
cat > drafts/example-calendar.json << 'ENDCALENDAR'
{
  "month": "2026-03",
  "generated_date": "2026-02-28",
  "theme_weeks": {
    "week1": {
      "dates": ["2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07"],
      "theme": "Educational - HOA Financing Basics",
      "days": {
        "2026-03-04": {
          "topic": "Reserve Fund Loans Explained",
          "type": "educational",
          "platforms": ["linkedin", "twitter"],
          "content_brief": "Explain what reserve fund loans are, how they work, benefits vs special assessments"
        }
      }
    }
  }
}
ENDCALENDAR

# 5. Create example posts
echo "📄 Creating example post templates..."
cat > drafts/example-linkedin.md << 'ENDLINKEDIN'
Is your HOA board considering a major capital project but worried about special assessments?

Many associations face this challenge: critical repairs are needed, but residents are already stretched financially. Special assessments create stress and financial hardship for homeowners.

Here's what forward-thinking boards are doing instead:
• Reserve fund loans that preserve cash flow
• Assessment-backed bonds with 10-15 year terms
• Lines of credit for flexible, phased projects
• Manufacturer financing bundled with installation

Each option protects homeowners while ensuring quality work gets completed on schedule.

Learn which financing option fits your HOA's unique situation:
👉 https://www.hoaprojectfunding.com/blog/financing-options

#HOA #HOAmanagement #PropertyManagement #CommunityAssociation #HOAboard
ENDLINKEDIN

cat > drafts/example-twitter.md << 'ENDTWITTER'
Tweet 1:
Special assessments aren't your only option for funding HOA capital projects.

Here are 5 financing alternatives that protect homeowners from surprise bills:

🧵 Thread 👇

Tweet 2:
1. Reserve fund loans - leverage reserves without depletion
2. Assessment-backed bonds - 10-15 year payment terms
3. HOA lines of credit - flexibility for phased work
4. Manufacturer financing - bundled with installation
5. Gov't assistance - low-interest or grant programs

Tweet 3:
Which financing method is right for your HOA?

Our guide breaks down when to use each option:
👉 https://www.hoaprojectfunding.com/blog/financing-options

#HOA #PropertyManagement
ENDTWITTER

cat > drafts/example-facebook.md << 'ENDFACEBOOK'
Facing a big HOA capital project? We understand the stress! 😰

Special assessments are the default for many associations, but there are better alternatives. Modern financing options let you spread costs over time and keep monthly assessments predictable for your community.

From reserve fund loans to manufacturer financing programs, the right solution depends on your community's needs, timeline, and financial health.

👉 Check out our guide to 5 financing alternatives that could save your HOA from financial stress: https://www.hoaprojectfunding.com/blog/financing-options

Let's help your board make the best decision for your community! 💪

#HOAboard #CommunityAssociation #HOAmanagement #PropertyManagement
ENDFACEBOOK

# 6. Register agent with OpenClaw
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
echo "1. (Optional) Install Mixpost for easier social queue management"
echo "2. OR configure platform API credentials in .env.local:"
echo "   LINKEDIN_ACCESS_TOKEN=..."
echo "   TWITTER_API_KEY=..."
echo "   FACEBOOK_PAGE_ACCESS_TOKEN=..."
echo ""
echo "3. Test blog-to-social conversion:"
echo "   npx openclaw agent --agent $AGENT_ID --local \\"
echo "     --message 'Convert the latest blog post to social media content'"
echo ""
echo "4. Generate monthly calendar:"
echo "   npx openclaw agent --agent $AGENT_ID --local \\"
echo "     --message 'Generate March 2026 content calendar'"
echo ""
echo "5. Set up daily posting cron:"
echo "   npx openclaw cron add \\"
echo "     --agent $AGENT_ID \\"
echo "     --cron '0 7 * * *' \\"
echo "     --message 'Check calendar and create today\\'s social posts' \\"
echo "     --tz 'America/New_York'"
echo ""
echo "Workspace: $WORKSPACE_DIR"
