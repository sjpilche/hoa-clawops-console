# HOA Content Writer Skill

Automated content generation skill for HOA Project Funding business (www.hoaprojectfunding.com).

## Overview

This skill researches trending HOA financing topics, generates SEO-optimized blog posts, and delivers drafts for approval via messaging channels.

## What It Does

1. **Weekly Topic Research**: Uses web search to find trending topics in:
   - Reserve fund loans
   - Special assessment alternatives
   - Capital improvement financing
   - HOA repair funding
   - Community property financing

2. **SEO-Optimized Content Generation**: Creates 1000-1500 word blog posts with:
   - Long-tail keyword targeting (e.g., "HOA roof replacement financing")
   - Proper H1/H2/H3 structure
   - Meta titles and descriptions
   - Internal linking suggestions
   - Frontmatter metadata (title, slug, keywords, meta description)

3. **Output Format**: Saves posts as markdown files with YAML frontmatter

4. **Approval Workflow**: Sends draft summary via Telegram/WhatsApp for review

## How to Use

### Basic Usage

```bash
# Research topics and generate a single post
openclaw agent --agent hoa-content-writer --local --message "Research trending HOA financing topics and generate one blog post"

# Generate post on specific topic
openclaw agent --agent hoa-content-writer --local --message "Write an SEO blog post about 'HOA roof replacement financing options'"

# Weekly batch generation
openclaw agent --agent hoa-content-writer --local --message "Run the weekly content generation: research 3 trending topics and generate posts for each"
```

### Scheduled Automation

The skill is configured to run automatically:
- **Schedule**: Monday, Wednesday, Friday at 6:00 AM EST
- **Task**: Research trends + generate 1 post per run
- **Delivery**: Telegram/WhatsApp summary with draft link

## Configuration

### Required Environment Variables

Add to your `.env.local`:

```bash
# Telegram notification (recommended)
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# OR WhatsApp (if using wacli)
WHATSAPP_PHONE=+1234567890
```

### Output Directory

Posts are saved to:
```
/home/sjpilche/projects/openclaw-v1/workspaces/hoa-content-writer/posts/
```

Each file is named: `YYYY-MM-DD-slug-name.md`

## Post Structure

Each generated post includes:

```markdown
---
title: "How to Finance HOA Roof Replacement Without Special Assessments"
slug: "hoa-roof-replacement-financing-options"
date: "2026-02-13"
keywords:
  - "HOA roof replacement financing"
  - "HOA roof loan"
  - "avoid special assessments"
  - "HOA capital improvement loan"
meta_title: "HOA Roof Replacement Financing: 5 Alternatives to Special Assessments"
meta_description: "Discover 5 proven financing options for HOA roof replacement that avoid special assessments. Compare rates, terms, and approval requirements."
category: "Capital Improvements"
internal_links:
  - "/blog/reserve-fund-loans"
  - "/services/hoa-project-financing"
status: "draft"
---

# [H1 Title Here]

[1000-1500 word SEO-optimized content]
```

## Target Keywords

The skill targets these long-tail keyword patterns:

- "HOA [project type] financing" (roof, pool, siding, etc.)
- "alternatives to HOA special assessments"
- "HOA reserve fund loan for [project]"
- "how to finance [HOA project] without raising dues"
- "HOA capital improvement financing [city/state]"
- "emergency HOA repair funding"

## Content Themes

Posts cover:

1. **Financing Options**:
   - Reserve fund loans
   - Lines of credit
   - Bond financing
   - Assessment-free alternatives

2. **Project Types**:
   - Roof replacement
   - Pool renovation
   - Siding/exterior repairs
   - Parking lot resurfacing
   - Emergency repairs

3. **Decision Guides**:
   - When to use special assessments vs loans
   - How to calculate financing costs
   - Board approval processes
   - Vendor selection

4. **Local Targeting**:
   - State-specific HOA laws
   - Regional market trends
   - City/county case studies

## Approval Workflow

After each post is generated:

1. Post saved to `posts/` directory
2. Message sent via Telegram/WhatsApp with:
   - Post title and target keywords
   - Word count and readability score
   - Link to draft file
   - Suggested publish date
3. Respond "approve [filename]" to mark ready for publishing
4. Respond "edit [filename]" for manual review

## Cron Schedule

Configured to run automatically via OpenClaw cron:

```bash
# Monday, Wednesday, Friday at 6:00 AM EST
0 6 * * 1,3,5 America/New_York
```

To modify schedule:
```bash
openclaw cron list --json  # Find job ID
openclaw cron rm <job-id>  # Remove old schedule
openclaw cron add --agent hoa-content-writer --cron "0 6 * * 1,3,5" --message "Run weekly content generation" --tz "America/New_York"
```

## Tips

- **Topic Variety**: The agent automatically cycles through different financing angles to avoid repetition
- **Keyword Research**: Before each post, it searches Google Trends and competitor sites
- **Freshness**: Includes recent data, case studies, and market trends
- **CTA Integration**: Each post includes natural calls-to-action pointing to your services page
- **Image Suggestions**: Provides image/infographic ideas in post comments

## Troubleshooting

**Posts are too short**: Increase word count target in SOUL.md (default: 1200 words)

**Topics are repetitive**: Clear the topic history file:
```bash
rm /home/sjpilche/projects/openclaw-v1/workspaces/hoa-content-writer/.topic_history
```

**Telegram not working**: Verify bot token and chat ID:
```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" | jq
```

**WhatsApp not working**: Check wacli installation and authentication

## Integration with ClawOps

This skill integrates with your ClawOps Console:

- View generated posts in the ClawOps UI (new "Content" tab)
- Approve/reject from dashboard
- Analytics: track topics, keywords, engagement
- Scheduling: managed via ClawOps cron interface

## Future Enhancements

Planned features:

- [ ] Auto-publish to WordPress via API
- [ ] Generate social media snippets (Twitter, LinkedIn)
- [ ] A/B test headlines
- [ ] Competitor content gap analysis
- [ ] Image generation via DALL-E
- [ ] Email newsletter compilation

---

**Created for**: HOA Project Funding (www.hoaprojectfunding.com)
**Agent ID**: `hoa-content-writer`
**Workspace**: `/home/sjpilche/projects/openclaw-v1/workspaces/hoa-content-writer`
