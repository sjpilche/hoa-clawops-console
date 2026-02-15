#!/bin/bash

# HOA Project Funding - OpenClaw Cron Job Setup
# Last Updated: 2026-02-13
#
# This script configures all automated agents for the content pipeline.
# All jobs point to www.hoaprojectfunding.com for conversions (application or free consult).
#
# Usage:
#   cd /home/sjpilche/projects/openclaw-v1
#   bash scripts/setup-all-crons.sh

set -e  # Exit on error

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "HOA Project Funding - Cron Job Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if openclaw command exists
if ! command -v openclaw &> /dev/null; then
    echo "❌ Error: 'openclaw' command not found"
    echo "   Make sure you're in the correct environment and OpenClaw is installed."
    exit 1
fi

echo "✅ OpenClaw CLI found"
echo ""

# Optional: Remove all existing cron jobs first (uncomment if you want clean slate)
# echo "🗑️  Removing all existing cron jobs..."
# openclaw cron list --json | jq -r '.[].id' | xargs -I {} openclaw cron remove --id {} 2>/dev/null || true
# echo ""

echo "📅 Setting up cron jobs..."
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CONTENT WRITER - Monday 6:00 AM EST
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "→ Content Writer (Monday 6:00 AM EST)"

openclaw cron add \
  --agent hoa-content-writer \
  --cron "0 6 * * 1" \
  --message "Pick the next unwritten topic from content-calendar.md. Generate a 1500-2000 word SEO-optimized blog post. Include two CTAs: one mid-article for the free consult, one end-of-article for the full application at www.hoaprojectfunding.com." \
  --tz "America/New_York" \
  --name "HOA Content - Weekly Blog Post"

echo "   ✓ Scheduled: Monday 6:00 AM EST"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CMS PUBLISHER - Tuesday 8:00 AM EST
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "→ CMS Publisher (Tuesday 8:00 AM EST)"

openclaw cron add \
  --agent hoa-cms-publisher \
  --cron "0 8 * * 2" \
  --message "Check approved directory and publish all approved posts to WordPress as drafts. Insert CTA blocks pointing to the application form and free consult at www.hoaprojectfunding.com." \
  --tz "America/New_York" \
  --name "HOA CMS - Upload to WordPress"

echo "   ✓ Scheduled: Tuesday 8:00 AM EST"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SOCIAL MEDIA - Tuesday 10:00 AM EST (Facebook Page + LinkedIn)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "→ Social Media - Facebook Page + LinkedIn (Tuesday 10:00 AM EST)"

openclaw cron add \
  --agent hoa-social-media \
  --cron "0 10 * * 2" \
  --message "Convert the latest blog post into a Facebook page share post and LinkedIn thought leadership post. All CTAs drive to www.hoaprojectfunding.com application or free consult." \
  --tz "America/New_York" \
  --name "HOA Social - Facebook Page + LinkedIn"

echo "   ✓ Scheduled: Tuesday 10:00 AM EST"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SOCIAL MEDIA - Wednesday 12:00 PM EST (Facebook Group Discussion)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "→ Social Media - Facebook Group Discussion (Wednesday 12:00 PM EST)"

openclaw cron add \
  --agent hoa-social-media \
  --cron "0 12 * * 3" \
  --message "Create a Facebook group discussion post based on the latest blog post. Value-first, no direct sales CTA. Goal is engagement and credibility." \
  --tz "America/New_York" \
  --name "HOA Social - Facebook Group Discussion"

echo "   ✓ Scheduled: Wednesday 12:00 PM EST"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SOCIAL ENGAGEMENT - Daily 8:00 AM EST
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "→ Social Engagement Monitor (Daily 8:00 AM EST)"

openclaw cron add \
  --agent hoa-social-engagement \
  --cron "0 8 * * *" \
  --message "Check social platforms for new engagement. Score leads per lead-scoring.json. Draft responses for any leads scoring 10+. Include site link only for high-intent leads." \
  --tz "America/New_York" \
  --name "HOA Engagement - Daily Monitor"

echo "   ✓ Scheduled: Daily 8:00 AM EST"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SOCIAL ENGAGEMENT - Weekly Metrics (Monday 9:00 AM EST)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "→ Social Engagement Metrics (Monday 9:00 AM EST)"

openclaw cron add \
  --agent hoa-social-engagement \
  --cron "0 9 * * 1" \
  --message "Generate weekly engagement metrics report. Track: total interactions, leads identified, website clicks from social, and any application form submissions this week." \
  --tz "America/New_York" \
  --name "HOA Engagement - Weekly Metrics"

echo "   ✓ Scheduled: Monday 9:00 AM EST"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# EMAIL CAMPAIGNS - Follow-ups Check (Friday 9:00 AM EST)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "→ Email Follow-ups Check (Friday 9:00 AM EST)"

openclaw cron add \
  --agent hoa-email-campaigns \
  --cron "0 9 * * 5" \
  --message "Check for any pending follow-up emails due in active sequences (abandonment or post-consult). Generate drafts for review." \
  --tz "America/New_York" \
  --name "HOA Email - Follow-ups Check"

echo "   ✓ Scheduled: Friday 9:00 AM EST"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# EMAIL CAMPAIGNS - Monthly Newsletter (First Tuesday 10:00 AM EST)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "→ Monthly Newsletter (First Tuesday 10:00 AM EST)"

openclaw cron add \
  --agent hoa-email-campaigns \
  --cron "0 10 1-7 * 2" \
  --message "Generate monthly newsletter with latest blog highlight, one board tip, and standing CTA to www.hoaprojectfunding.com." \
  --tz "America/New_York" \
  --name "HOA Email - Monthly Newsletter"

echo "   ✓ Scheduled: First Tuesday 10:00 AM EST"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SUMMARY
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All cron jobs configured successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Summary:"
echo "   • Content Writer: Monday 6:00 AM"
echo "   • CMS Publisher: Tuesday 8:00 AM"
echo "   • Social Media (Page + LinkedIn): Tuesday 10:00 AM"
echo "   • Social Media (Group Discussion): Wednesday 12:00 PM"
echo "   • Social Engagement Monitor: Daily 8:00 AM"
echo "   • Social Engagement Metrics: Monday 9:00 AM"
echo "   • Email Follow-ups: Friday 9:00 AM"
echo "   • Monthly Newsletter: First Tuesday 10:00 AM"
echo ""
echo "📁 Documentation: /docs/pipeline-schedule.md"
echo ""
echo "To view active cron jobs:"
echo "   openclaw cron list"
echo ""
echo "To remove all cron jobs:"
echo "   openclaw cron list --json | jq -r '.[].id' | xargs -I {} openclaw cron remove --id {}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
