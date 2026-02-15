#!/bin/bash

# HOA Project Funding - Quick Setup Check
# Last Updated: 2026-02-13
#
# Validates OpenClaw pipeline configuration and identifies missing components.
#
# Usage:
#   cd /home/sjpilche/projects/openclaw-v1
#   bash scripts/quick-setup-check.sh

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Color codes
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Header
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${CYAN}HOA Project Funding - Setup Check${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Environment Variables Check
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo -e "${BOLD}${BLUE}1. Environment Variables${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Path to .env.local (check both server/.env.local and root .env.local)
ENV_FILE=""
if [ -f "server/.env.local" ]; then
    ENV_FILE="server/.env.local"
elif [ -f ".env.local" ]; then
    ENV_FILE=".env.local"
fi

if [ -z "$ENV_FILE" ]; then
    echo -e "${RED}❌ .env.local file not found${NC}"
    echo "   Expected location: server/.env.local or .env.local"
    echo ""
else
    echo -e "${GREEN}✓ Found: $ENV_FILE${NC}"
    echo ""

    # Load environment variables
    set -a
    source "$ENV_FILE" 2>/dev/null
    set +a

    # Check each critical variable
    check_var() {
        var_name=$1
        var_value=${!var_name}

        if [ -n "$var_value" ]; then
            echo -e "   ${GREEN}✅ $var_name${NC}"
            return 0
        else
            echo -e "   ${RED}❌ $var_name${NC}"
            return 1
        fi
    }

    # Critical variables
    echo -e "${BOLD}Notifications:${NC}"
    check_var "TELEGRAM_BOT_TOKEN" && telegram_ok=1 || telegram_ok=0
    check_var "TELEGRAM_CHAT_ID" && telegram_chat_ok=1 || telegram_chat_ok=0
    echo ""

    echo -e "${BOLD}WordPress CMS:${NC}"
    check_var "WORDPRESS_URL" && wp_url_ok=1 || wp_url_ok=0
    check_var "WORDPRESS_USER" && wp_user_ok=1 || wp_user_ok=0
    check_var "WORDPRESS_APP_PASSWORD" && wp_pass_ok=1 || wp_pass_ok=0
    echo ""

    echo -e "${BOLD}Email Service Provider (ESP):${NC}"
    esp_ok=0
    if check_var "SENDGRID_API_KEY"; then
        esp_ok=1
        esp_provider="SendGrid"
    elif check_var "MAILCHIMP_API_KEY"; then
        esp_ok=1
        esp_provider="Mailchimp"
    else
        echo -e "   ${RED}❌ SENDGRID_API_KEY${NC}"
        echo -e "   ${RED}❌ MAILCHIMP_API_KEY${NC}"
    fi
    echo ""

    echo -e "${BOLD}Social Media APIs (Optional):${NC}"
    check_var "LINKEDIN_ACCESS_TOKEN" && linkedin_ok=1 || linkedin_ok=0
    check_var "FACEBOOK_PAGE_ACCESS_TOKEN" && fb_ok=1 || fb_ok=0
    echo ""
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Registered Agents
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo -e "${BOLD}${BLUE}2. Registered OpenClaw Agents${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if command -v openclaw &> /dev/null; then
    agents=$(openclaw agents list 2>/dev/null || echo "")

    if [ -z "$agents" ]; then
        echo -e "${YELLOW}⚠️  No agents registered${NC}"
        echo ""
        agents_ok=0
    else
        echo "$agents"
        echo ""

        # Check for critical agents
        content_writer_ok=0
        cms_publisher_ok=0
        social_media_ok=0
        social_engagement_ok=0
        email_campaigns_ok=0

        if echo "$agents" | grep -q "hoa-content-writer"; then
            content_writer_ok=1
        fi
        if echo "$agents" | grep -q "hoa-cms-publisher"; then
            cms_publisher_ok=1
        fi
        if echo "$agents" | grep -q "hoa-social-media"; then
            social_media_ok=1
        fi
        if echo "$agents" | grep -q "hoa-social-engagement"; then
            social_engagement_ok=1
        fi
        if echo "$agents" | grep -q "hoa-email-campaigns"; then
            email_campaigns_ok=1
        fi

        agents_ok=1
    fi
else
    echo -e "${RED}❌ OpenClaw CLI not found${NC}"
    echo ""
    agents_ok=0
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Active Cron Jobs
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo -e "${BOLD}${BLUE}3. Active Cron Jobs${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if command -v openclaw &> /dev/null; then
    cron_list=$(openclaw cron list 2>/dev/null || echo "")

    if [ -z "$cron_list" ]; then
        echo -e "${YELLOW}⚠️  No cron jobs configured${NC}"
        echo "   Run: bash scripts/setup-all-crons.sh"
        echo ""
        crons_ok=0
    else
        echo "$cron_list"
        echo ""
        crons_ok=1
    fi
else
    echo -e "${RED}❌ OpenClaw CLI not found${NC}"
    echo ""
    crons_ok=0
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Gateway Status
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo -e "${BOLD}${BLUE}4. OpenClaw Gateway Status${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if command -v openclaw &> /dev/null; then
    gateway_status=$(openclaw gateway status 2>/dev/null || echo "")

    if [ -z "$gateway_status" ]; then
        echo -e "${YELLOW}⚠️  Gateway status unavailable${NC}"
        echo ""
        gateway_ok=0
    else
        echo "$gateway_status"
        echo ""

        if echo "$gateway_status" | grep -qi "running\|active"; then
            gateway_ok=1
        else
            gateway_ok=0
        fi
    fi
else
    echo -e "${RED}❌ OpenClaw CLI not found${NC}"
    echo ""
    gateway_ok=0
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# File Checks
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo -e "${BOLD}${BLUE}5. Critical Files${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

content_calendar_ok=0
platform_strategy_ok=0
sequences_config_ok=0
lead_scoring_ok=0

if [ -f "workspaces/hoa-content-writer/content-calendar.md" ]; then
    echo -e "${GREEN}✅ content-calendar.md${NC} (Content planning)"
    content_calendar_ok=1
else
    echo -e "${RED}❌ content-calendar.md${NC} (workspaces/hoa-content-writer/)"
fi

if [ -f "workspaces/hoa-social-media/platform-strategy.md" ]; then
    echo -e "${GREEN}✅ platform-strategy.md${NC} (Social media strategy)"
    platform_strategy_ok=1
else
    echo -e "${RED}❌ platform-strategy.md${NC} (workspaces/hoa-social-media/)"
fi

if [ -f "workspaces/hoa-email-campaigns/config/sequences-config.json" ]; then
    echo -e "${GREEN}✅ sequences-config.json${NC} (Email sequences)"
    sequences_config_ok=1
else
    echo -e "${RED}❌ sequences-config.json${NC} (workspaces/hoa-email-campaigns/config/)"
fi

if [ -f "workspaces/hoa-social-engagement/config/lead-scoring.json" ]; then
    echo -e "${GREEN}✅ lead-scoring.json${NC} (Lead scoring rules)"
    lead_scoring_ok=1
else
    echo -e "${RED}❌ lead-scoring.json${NC} (workspaces/hoa-social-engagement/config/)"
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Prioritized Next Steps
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo -e "${BOLD}${MAGENTA}6. Prioritized Next Steps${NC}"
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

has_critical=0
has_high=0
has_medium=0

# CRITICAL: WordPress
if [ "${wp_url_ok:-0}" -eq 0 ] || [ "${wp_user_ok:-0}" -eq 0 ] || [ "${wp_pass_ok:-0}" -eq 0 ]; then
    echo -e "${RED}${BOLD}🔴 CRITICAL: Configure WordPress credentials${NC}"
    echo "   → You can't publish content without this"
    echo "   → Set: WORDPRESS_URL, WORDPRESS_USER, WORDPRESS_APP_PASSWORD in server/.env.local"
    echo ""
    has_critical=1
fi

# CRITICAL: Agents not registered
if [ "${agents_ok:-0}" -eq 0 ]; then
    echo -e "${RED}${BOLD}🔴 CRITICAL: Register OpenClaw agents${NC}"
    echo "   → Run: openclaw agents add hoa-content-writer"
    echo "   → Run: openclaw agents add hoa-social-media"
    echo "   → Run: openclaw agents add hoa-email-campaigns"
    echo "   → Run: openclaw agents add hoa-social-engagement"
    echo ""
    has_critical=1
fi

# HIGH: Telegram
if [ "${telegram_ok:-0}" -eq 0 ] || [ "${telegram_chat_ok:-0}" -eq 0 ]; then
    echo -e "${YELLOW}${BOLD}🟡 HIGH: Set up Telegram bot${NC}"
    echo "   → You need notifications to review content before it publishes"
    echo "   → Set: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID in server/.env.local"
    echo "   → Create bot: https://t.me/BotFather"
    echo ""
    has_high=1
fi

# HIGH: Cron jobs not configured
if [ "${crons_ok:-0}" -eq 0 ]; then
    echo -e "${YELLOW}${BOLD}🟡 HIGH: Configure cron jobs${NC}"
    echo "   → Automation won't run without scheduled jobs"
    echo "   → Run: bash scripts/setup-all-crons.sh"
    echo ""
    has_high=1
fi

# MEDIUM: Email ESP
if [ "${esp_ok:-0}" -eq 0 ]; then
    echo -e "${YELLOW}${BOLD}🟡 MEDIUM: Set up email ESP${NC}"
    echo "   → Needed for follow-up sequences after consults"
    echo "   → Set: SENDGRID_API_KEY or MAILCHIMP_API_KEY in server/.env.local"
    echo "   → SendGrid (recommended): https://sendgrid.com"
    echo ""
    has_medium=1
fi

# LOW: Social APIs
if [ "${linkedin_ok:-0}" -eq 0 ] || [ "${fb_ok:-0}" -eq 0 ]; then
    echo -e "${GREEN}${BOLD}🟢 LOW: Social APIs are optional${NC}"
    echo "   → You can post manually for now"
    echo "   → Set later: LINKEDIN_ACCESS_TOKEN, FACEBOOK_PAGE_ACCESS_TOKEN"
    echo ""
fi

# ALWAYS: Analytics
echo -e "${CYAN}${BOLD}📊 IMPORTANT: Set up analytics${NC}"
echo "   → Google Analytics 4 on www.hoaprojectfunding.com"
echo "   → Google Search Console"
echo "   → You need to measure traffic and conversions"
echo ""

if [ $has_critical -eq 0 ] && [ $has_high -eq 0 ] && [ $has_medium -eq 0 ]; then
    echo -e "${GREEN}${BOLD}✅ All critical setup complete!${NC}"
    echo ""
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Pipeline Status
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo -e "${BOLD}${CYAN}7. Pipeline Status${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Content
if [ "${content_calendar_ok}" -eq 1 ] && [ "${content_writer_ok:-0}" -eq 1 ]; then
    echo -e "   ${GREEN}✅ Content${NC} — Ready"
else
    echo -e "   ${RED}❌ Content${NC} — Not Ready"
    echo -e "      Missing: content-calendar.md or hoa-content-writer agent"
fi

# Publishing
if [ "${wp_url_ok:-0}" -eq 1 ] && [ "${wp_user_ok:-0}" -eq 1 ] && [ "${wp_pass_ok:-0}" -eq 1 ] && [ "${cms_publisher_ok:-0}" -eq 1 ]; then
    echo -e "   ${GREEN}✅ Publishing${NC} — Ready"
else
    echo -e "   ${RED}❌ Publishing${NC} — Not Ready"
    echo -e "      Missing: WordPress credentials or hoa-cms-publisher agent"
fi

# Social
if [ "${social_media_ok:-0}" -eq 1 ] && [ "${platform_strategy_ok}" -eq 1 ]; then
    echo -e "   ${GREEN}✅ Social${NC} — Ready (manual posting)"
else
    echo -e "   ${RED}❌ Social${NC} — Not Ready"
    echo -e "      Missing: hoa-social-media agent or platform-strategy.md"
fi

# Email
if [ "${esp_ok:-0}" -eq 1 ] && [ "${email_campaigns_ok:-0}" -eq 1 ] && [ "${sequences_config_ok}" -eq 1 ]; then
    echo -e "   ${GREEN}✅ Email${NC} — Ready"
else
    echo -e "   ${YELLOW}⚠️  Email${NC} — Partial (ESP or sequences missing)"
fi

# Engagement
if [ "${social_engagement_ok:-0}" -eq 1 ] && [ "${lead_scoring_ok}" -eq 1 ]; then
    echo -e "   ${GREEN}✅ Engagement${NC} — Ready"
else
    echo -e "   ${RED}❌ Engagement${NC} — Not Ready"
    echo -e "      Missing: hoa-social-engagement agent or lead-scoring.json"
fi

# Notifications
if [ "${telegram_ok:-0}" -eq 1 ] && [ "${telegram_chat_ok:-0}" -eq 1 ]; then
    echo -e "   ${GREEN}✅ Notifications${NC} — Ready"
else
    echo -e "   ${RED}❌ Notifications${NC} — Not Ready"
    echo -e "      Missing: Telegram credentials"
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Footer
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Setup Check Complete${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ $has_critical -eq 1 ]; then
    echo -e "${RED}${BOLD}⚠️  Critical items require attention before running the pipeline${NC}"
    echo ""
elif [ $has_high -eq 1 ]; then
    echo -e "${YELLOW}${BOLD}⚠️  High priority items should be addressed soon${NC}"
    echo ""
else
    echo -e "${GREEN}${BOLD}✅ Ready to run the content pipeline!${NC}"
    echo ""
    echo "Next steps:"
    echo "   1. Review content-calendar.md and add topics"
    echo "   2. Test agents manually before enabling cron automation"
    echo "   3. Run: bash scripts/setup-all-crons.sh"
    echo ""
fi

echo "Documentation:"
echo "   • Pipeline schedule: docs/pipeline-schedule.md"
echo "   • Cron commands: docs/cron-commands-reference.md"
echo ""
