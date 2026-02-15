#!/bin/bash
# Setup script for HOA Content Writer skill

set -e

WORKSPACE_DIR="/home/sjpilche/projects/openclaw-v1/workspaces/hoa-content-writer"
AGENT_ID="hoa-content-writer"

echo "🏗️  Setting up HOA Content Writer skill..."
echo ""

# 1. Create workspace directory
echo "📁 Creating workspace directory..."
mkdir -p "$WORKSPACE_DIR/posts"
mkdir -p "$WORKSPACE_DIR/drafts"
cd "$WORKSPACE_DIR"

# 2. Copy SOUL.md
echo "📝 Creating SOUL.md..."
if [ -f "../../OpenClaw2.0 for linux/openclaw-skills/hoa-content-writer/SOUL.md" ]; then
  cp "../../OpenClaw2.0 for linux/openclaw-skills/hoa-content-writer/SOUL.md" SOUL.md
else
  echo "⚠️  SOUL.md not found, you'll need to copy it manually"
fi

# 3. Create TOOLS.md
echo "🔧 Creating TOOLS.md..."
cat > TOOLS.md << 'ENDTOOLS'
# TOOLS.md - HOA Content Writer

## Web Search

Primary tool for topic research and keyword discovery.

**Use cases**:
- Finding trending HOA financing topics
- Researching competitor content
- Validating keyword search volume
- Getting current statistics and data

**Example queries**:
```bash
# Topic research
web_search "HOA financing trends 2026"
web_search "site:hoaleader.com OR site:condomanagerusa.com financing"

# Keyword validation
web_search "allintitle:HOA roof replacement financing"

# Data gathering
web_search "average HOA roof replacement cost 2026"
```

## Output Directory

Posts are saved to: `./posts/YYYY-MM-DD-slug.md`

Use the `write` tool to create files with proper frontmatter.

## Notification Commands

### Telegram Notification

```bash
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  -d "text=Your message here" \
  -d "parse_mode=Markdown"
```

### WhatsApp Notification (if wacli installed)

```bash
wacli send "${WHATSAPP_PHONE}" "Your message here"
```

## Topic History Tracking

Track covered topics to avoid repetition:

```bash
# Read history
cat .topic_history

# Add new topic
echo "YYYY-MM-DD: Topic title here" >> .topic_history
```

## Environment Variables Needed

- `TELEGRAM_BOT_TOKEN` - Telegram bot API token
- `TELEGRAM_CHAT_ID` - Your Telegram chat ID
- `WHATSAPP_PHONE` - WhatsApp number (optional, if using wacli)

Check if set:
```bash
echo $TELEGRAM_BOT_TOKEN
echo $TELEGRAM_CHAT_ID
```
ENDTOOLS

# 4. Create topic history file
echo "📋 Creating topic history tracker..."
touch .topic_history
echo "# HOA Content Writer - Topic History" > .topic_history
echo "# Format: YYYY-MM-DD: Topic title" >> .topic_history
echo "" >> .topic_history

# 5. Create example post template
echo "📄 Creating example post template..."
cat > drafts/example-post-template.md << 'ENDTEMPLATE'
---
title: "How to Finance HOA Roof Replacement Without Special Assessments"
slug: "hoa-roof-replacement-financing-options"
date: "2026-02-13"
keywords:
  - "HOA roof replacement financing"
  - "HOA roof loan"
  - "avoid special assessments"
  - "HOA capital improvement loan"
  - "HOA reserve fund loan"
meta_title: "HOA Roof Replacement Financing: 5 Alternatives to Special Assessments"
meta_description: "Discover 5 proven financing options for HOA roof replacement that avoid special assessments. Compare rates, terms, and approval requirements."
category: "Capital Improvements"
internal_links:
  - "/services/reserve-fund-loans"
  - "/services/capital-improvement-financing"
  - "/blog/hoa-financing-guide"
status: "draft"
author: "HOA Project Funding Team"
---

# HOA Roof Replacement Financing: 5 Alternatives to Special Assessments

[Introduction - 150 words]

## Understanding HOA Roof Financing Challenges

[Context section - 200 words]

## 5 Options for Financing Your HOA's Roof Replacement

### 1. Reserve Fund Loans

[Details...]

### 2. HOA Lines of Credit

[Details...]

### 3. Assessment-Backed Bonds

[Details...]

### 4. Manufacturer Financing Programs

[Details...]

### 5. Community Development Loans

[Details...]

## How to Choose the Right Financing Option

[Decision framework - 250 words]

## Case Study: Sunset Ridge HOA Roof Replacement

[Real example - 200 words]

## Getting Started with HOA Roof Financing

[Action steps - 150 words]

## Conclusion

[Summary and CTA - 100 words]
ENDTEMPLATE

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
echo "1. Add environment variables to .env.local:"
echo "   TELEGRAM_BOT_TOKEN=your_bot_token"
echo "   TELEGRAM_CHAT_ID=your_chat_id"
echo ""
echo "2. Test the agent:"
echo "   npx openclaw agent --agent $AGENT_ID --local --message 'Research one trending HOA financing topic and generate a blog post'"
echo ""
echo "3. Set up cron schedule:"
echo "   npx openclaw cron add \\"
echo "     --agent $AGENT_ID \\"
echo "     --cron '0 6 * * 1,3,5' \\"
echo "     --message 'Run weekly content generation: research trending topics and generate one SEO blog post' \\"
echo "     --tz 'America/New_York' \\"
echo "     --name 'HOA Content - Mon/Wed/Fri 6am'"
echo ""
echo "Workspace: $WORKSPACE_DIR"
