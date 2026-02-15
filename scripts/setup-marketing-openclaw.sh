#!/bin/bash
#
# Setup Marketing Team in OpenClaw
# Run this in WSL: bash /mnt/c/Users/SPilcher/OpenClaw2.0\ for\ linux\ -\ Copy/scripts/setup-marketing-openclaw.sh
#

set -e

echo "================================================================================================"
echo "🚀 SETTING UP MARKETING TEAM IN OPENCLAW"
echo "================================================================================================"
echo ""
echo "This will:"
echo "  1. Create 5 marketing agents in OpenClaw"
echo "  2. Copy SOUL.md documents to workspaces"
echo "  3. Set up 8 cron schedules"
echo ""

SKILLS_DIR="/mnt/c/Users/SPilcher/OpenClaw2.0 for linux - Copy/openclaw-skills"
OPENCLAW_DIR="/home/sjpilche/projects/openclaw-v1"

cd "$OPENCLAW_DIR" || exit 1

echo "================================================================================================"
echo "📦 CREATING AGENTS"
echo "================================================================================================"
echo ""

# 1. HOA Content Writer
echo "1️⃣  HOA Content Writer"
if npx openclaw agents list --json 2>/dev/null | grep -q "hoa-content-writer"; then
    echo "   ✅ Already exists"
else
    npx openclaw agents add hoa-content-writer \
      --workspace "$OPENCLAW_DIR/workspaces/hoa-content-writer" \
      --model claude-sonnet-4-5 \
      --non-interactive || echo "   ⚠️  May already exist"
    echo "   ✅ Created"
fi

if [ -f "$SKILLS_DIR/hoa-content-writer/SOUL.md" ]; then
    cp "$SKILLS_DIR/hoa-content-writer/SOUL.md" "$OPENCLAW_DIR/workspaces/hoa-content-writer/SOUL.md" 2>/dev/null || true
    echo "   ✅ SOUL.md copied"
fi
echo ""

# 2. HOA Social Media
echo "2️⃣  HOA Social Media"
if npx openclaw agents list --json 2>/dev/null | grep -q "hoa-social-media"; then
    echo "   ✅ Already exists"
else
    npx openclaw agents add hoa-social-media \
      --workspace "$OPENCLAW_DIR/workspaces/hoa-social-media" \
      --model claude-sonnet-4-5 \
      --non-interactive || echo "   ⚠️  May already exist"
    echo "   ✅ Created"
fi

if [ -f "$SKILLS_DIR/hoa-social-media/SOUL.md" ]; then
    cp "$SKILLS_DIR/hoa-social-media/SOUL.md" "$OPENCLAW_DIR/workspaces/hoa-social-media/SOUL.md" 2>/dev/null || true
    echo "   ✅ SOUL.md copied"
fi
echo ""

# 3. HOA CMS Publisher
echo "3️⃣  HOA CMS Publisher"
if npx openclaw agents list --json 2>/dev/null | grep -q "hoa-cms-publisher"; then
    echo "   ✅ Already exists"
else
    npx openclaw agents add hoa-cms-publisher \
      --workspace "$OPENCLAW_DIR/workspaces/hoa-cms-publisher" \
      --model claude-sonnet-4-5 \
      --non-interactive || echo "   ⚠️  May already exist"
    echo "   ✅ Created"
fi

if [ -f "$SKILLS_DIR/hoa-cms-publisher/SOUL.md" ]; then
    cp "$SKILLS_DIR/hoa-cms-publisher/SOUL.md" "$OPENCLAW_DIR/workspaces/hoa-cms-publisher/SOUL.md" 2>/dev/null || true
    echo "   ✅ SOUL.md copied"
fi
echo ""

# 4. HOA Social Engagement
echo "4️⃣  HOA Social Engagement Monitor"
if npx openclaw agents list --json 2>/dev/null | grep -q "hoa-social-engagement"; then
    echo "   ✅ Already exists"
else
    npx openclaw agents add hoa-social-engagement \
      --workspace "$OPENCLAW_DIR/workspaces/hoa-social-engagement" \
      --model claude-sonnet-4-5 \
      --non-interactive || echo "   ⚠️  May already exist"
    echo "   ✅ Created"
fi

if [ -f "$SKILLS_DIR/hoa-social-engagement/SOUL.md" ]; then
    cp "$SKILLS_DIR/hoa-social-engagement/SOUL.md" "$OPENCLAW_DIR/workspaces/hoa-social-engagement/SOUL.md" 2>/dev/null || true
    echo "   ✅ SOUL.md copied"
fi
echo ""

# 5. HOA Email Campaigns
echo "5️⃣  HOA Email Campaigns"
if npx openclaw agents list --json 2>/dev/null | grep -q "hoa-email-campaigns"; then
    echo "   ✅ Already exists"
else
    npx openclaw agents add hoa-email-campaigns \
      --workspace "$OPENCLAW_DIR/workspaces/hoa-email-campaigns" \
      --model claude-sonnet-4-5 \
      --non-interactive || echo "   ⚠️  May already exist"
    echo "   ✅ Created"
fi

if [ -f "$SKILLS_DIR/hoa-email-campaigns/SOUL.md" ]; then
    cp "$SKILLS_DIR/hoa-email-campaigns/SOUL.md" "$OPENCLAW_DIR/workspaces/hoa-email-campaigns/SOUL.md" 2>/dev/null || true
    echo "   ✅ SOUL.md copied"
fi
echo ""

echo "================================================================================================"
echo "⏰ SETTING UP CRON SCHEDULES"
echo "================================================================================================"
echo ""

# Remove existing schedules first (to avoid duplicates)
echo "🧹 Cleaning up old schedules..."
npx openclaw cron list --json 2>/dev/null | jq -r '.[] | select(.agent | startswith("hoa-")) | .id' 2>/dev/null | while read -r job_id; do
    npx openclaw cron rm "$job_id" 2>/dev/null || true
done
echo "   ✅ Old schedules removed"
echo ""

# Content Writer (Mon/Wed/Fri 6am)
echo "📅 HOA Content Writer: Mon/Wed/Fri 6am"
npx openclaw cron add \
  --agent hoa-content-writer \
  --name "content-writer-mwf" \
  --cron "0 6 * * 1,3,5" \
  --message "Generate blog post (Mon/Wed/Fri 6am)" \
  --tz "America/New_York" || echo "   ⚠️  Schedule may already exist"
echo ""

# Social Media (Mon/Wed/Fri 7am)
echo "📅 HOA Social Media: Mon/Wed/Fri 7am"
npx openclaw cron add \
  --agent hoa-social-media \
  --name "social-media-mwf" \
  --cron "0 7 * * 1,3,5" \
  --message "Convert latest blog to social posts (Mon/Wed/Fri 7am)" \
  --tz "America/New_York" || echo "   ⚠️  Schedule may already exist"
echo ""

# CMS Publisher (Mon/Wed/Fri 8:30am)
echo "📅 HOA CMS Publisher: Mon/Wed/Fri 8:30am"
npx openclaw cron add \
  --agent hoa-cms-publisher \
  --name "cms-publisher-mwf" \
  --cron "30 8 * * 1,3,5" \
  --message "Publish approved posts to WordPress (Mon/Wed/Fri 8:30am)" \
  --tz "America/New_York" || echo "   ⚠️  Schedule may already exist"
echo ""

# Social Engagement (Daily 8am)
echo "📅 HOA Social Engagement: Daily 8am"
npx openclaw cron add \
  --agent hoa-social-engagement \
  --name "social-engagement-daily" \
  --cron "0 8 * * *" \
  --message "Check platforms for engagement and draft responses (Daily 8am)" \
  --tz "America/New_York" || echo "   ⚠️  Schedule may already exist"
echo ""

# Social Engagement Weekly Report (Monday 9am)
echo "📅 HOA Social Engagement Report: Monday 9am"
npx openclaw cron add \
  --agent hoa-social-engagement \
  --name "social-engagement-report" \
  --cron "0 9 * * 1" \
  --message "Generate weekly engagement report (Monday 9am)" \
  --tz "America/New_York" || echo "   ⚠️  Schedule may already exist"
echo ""

# Email Campaigns Daily (Daily 9am)
echo "📅 HOA Email Campaigns: Daily 9am"
npx openclaw cron add \
  --agent hoa-email-campaigns \
  --name "email-campaigns-daily" \
  --cron "0 9 * * *" \
  --message "Check for inactive leads and create re-engagement emails (Daily 9am)" \
  --tz "America/New_York" || echo "   ⚠️  Schedule may already exist"
echo ""

# Email Newsletter (Tuesday 10am)
echo "📅 HOA Email Newsletter: Tuesday 10am"
npx openclaw cron add \
  --agent hoa-email-campaigns \
  --name "email-newsletter-weekly" \
  --cron "0 10 * * 2" \
  --message "Generate weekly newsletter from recent posts (Tuesday 10am)" \
  --tz "America/New_York" || echo "   ⚠️  Schedule may already exist"
echo ""

echo "================================================================================================"
echo "📊 VERIFICATION"
echo "================================================================================================"
echo ""

echo "🤖 Marketing Agents:"
npx openclaw agents list --json 2>/dev/null | jq -r '.[] | select(.id | startswith("hoa-")) | "   ✅ \(.id)"' || echo "   (Run npx openclaw agents list to verify)"
echo ""

echo "⏰ Active Schedules:"
npx openclaw cron list --json 2>/dev/null | jq -r '.[] | select(.agent | startswith("hoa-")) | "   📅 \(.agent): \(.schedule)"' || echo "   (Run npx openclaw cron list to verify)"
echo ""

echo "================================================================================================"
echo "✅ MARKETING TEAM SETUP COMPLETE!"
echo "================================================================================================"
echo ""
echo "What was done:"
echo "  ✅ 5 marketing agents created in OpenClaw"
echo "  ✅ SOUL.md documents copied to workspaces"
echo "  ✅ 8 cron schedules activated"
echo ""
echo "Next steps:"
echo "  1. Configure environment variables in ~/.config/openclaw/.env"
echo "  2. Test an agent: npx openclaw agent --agent hoa-content-writer --message 'Test run'"
echo "  3. Check your dashboard at /agents to see all agents"
echo "  4. Monitor schedules: npx openclaw cron list"
echo ""
echo "Marketing Pipeline Schedule:"
echo "  Mon/Wed/Fri 6:00am  → Content Writer generates blog post"
echo "  Mon/Wed/Fri 7:00am  → Social Media converts to posts"
echo "  Mon/Wed/Fri 8:30am  → CMS Publisher uploads to WordPress"
echo "  Daily 8:00am        → Social Engagement monitors platforms"
echo "  Daily 9:00am        → Email Campaigns checks for inactive leads"
echo "  Monday 9:00am       → Social Engagement weekly report"
echo "  Tuesday 10:00am     → Email Campaigns weekly newsletter"
echo ""
