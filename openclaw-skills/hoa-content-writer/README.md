# HOA Content Writer Skill

**Automated SEO content generation for HOA Project Funding**

Website: [www.hoaprojectfunding.com](https://www.hoaprojectfunding.com)

---

## Quick Start

### 1. Run Setup Script

```bash
cd /home/sjpilche/projects/openclaw-v1
bash /mnt/c/Users/SPilcher/OpenClaw2.0\ for\ linux/openclaw-skills/hoa-content-writer/setup.sh
```

This creates:
- ✅ Agent workspace at `/workspaces/hoa-content-writer`
- ✅ `posts/` and `drafts/` directories
- ✅ SOUL.md and TOOLS.md files
- ✅ Topic history tracker
- ✅ Example post template
- ✅ Registers agent with OpenClaw

### 2. Configure Environment Variables

Add to `/home/sjpilche/projects/openclaw-v1/.env` (or `~/.config/openclaw/.env`):

```bash
# Telegram (recommended)
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789

# OR WhatsApp (optional)
WHATSAPP_PHONE=+12345678900
```

**Get Telegram credentials**:
1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow prompts
3. Copy the bot token
4. Message your new bot
5. Get your chat ID: `https://api.telegram.org/bot<TOKEN>/getUpdates`

### 3. Test Run

```bash
cd /home/sjpilche/projects/openclaw-v1

# Generate one blog post
npx openclaw agent \
  --agent hoa-content-writer \
  --local \
  --message "Research one trending HOA financing topic and generate an SEO-optimized blog post"
```

Check output:
```bash
ls -lah workspaces/hoa-content-writer/posts/
cat workspaces/hoa-content-writer/posts/2026-02-13-*.md
```

### 4. Schedule Automation

```bash
# Monday, Wednesday, Friday at 6:00 AM EST
npx openclaw cron add \
  --agent hoa-content-writer \
  --cron "0 6 * * 1,3,5" \
  --message "Run weekly content generation: research trending topics and generate one SEO blog post" \
  --tz "America/New_York" \
  --name "HOA Content - Mon/Wed/Fri 6am"
```

Verify:
```bash
npx openclaw cron list --json | jq '.jobs[] | select(.agent == "hoa-content-writer")'
```

---

## How It Works

### Workflow

```
┌─────────────────────┐
│  1. Topic Research  │  Uses web_search to find trending HOA financing topics
│     (15 min)        │  Checks Google Trends, competitor blogs, news
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ 2. Keyword Research │  Identifies primary long-tail keyword + 5 secondaries
│     (5 min)         │  Example: "HOA roof replacement financing options"
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  3. Outline Creation│  Builds H1/H2/H3 structure (1200-1500 words)
│     (5 min)         │  Includes intro, options, case study, CTA
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ 4. Content Writing  │  Generates full SEO-optimized blog post
│    (25 min)         │  Professional tone, data-driven, actionable
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ 5. Meta Data        │  Creates title (50-60 chars), description (140-160)
│     (5 min)         │  Slug, keywords, internal linking suggestions
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ 6. Save & Notify    │  Saves to posts/YYYY-MM-DD-slug.md
│     (2 min)         │  Sends Telegram/WhatsApp notification
└─────────────────────┘

Total: ~60 minutes per post
```

### Output Format

Each post is saved as a markdown file with YAML frontmatter:

**File**: `posts/2026-02-13-hoa-roof-financing.md`

```yaml
---
title: "5 HOA Roof Replacement Financing Options (2026 Guide)"
slug: "hoa-roof-replacement-financing"
date: "2026-02-13"
keywords:
  - "HOA roof replacement financing"
  - "HOA roof loan"
  - "avoid special assessments"
meta_title: "HOA Roof Financing: 5 Alternatives to Special Assessments"
meta_description: "Compare 5 proven HOA roof replacement financing options. Avoid special assessments with reserve fund loans, lines of credit & more."
category: "Capital Improvements"
internal_links:
  - "/services/reserve-fund-loans"
  - "/services/capital-improvement-financing"
status: "draft"
---

# 5 HOA Roof Replacement Financing Options (2026 Guide)

[1200-1500 word SEO-optimized content]
```

---

## Target Keywords

The skill targets these high-value long-tail keywords:

### Primary Patterns

- `HOA [project] financing [qualifier]`
  - "HOA roof replacement financing without special assessment"
  - "HOA pool renovation financing options"
  - "HOA parking lot financing alternatives"

### Secondary Patterns

- `HOA [financing type] for [project]`
  - "HOA reserve fund loan for roof replacement"
  - "HOA line of credit for emergency repairs"

### Question-Based

- `How to finance [HOA project] without [pain point]`
  - "How to finance HOA repairs without raising dues"
  - "How to pay for HOA roof without special assessment"

### Location-Based

- `[City/State] HOA [project] financing`
  - "California HOA roof replacement financing"
  - "Florida HOA pool renovation loans"

---

## Content Themes

Posts rotate through these categories:

### 1. Financing Options (40%)
- Reserve fund loans
- Lines of credit
- Bond financing
- Assessment alternatives
- Vendor financing

### 2. Project Guides (30%)
- Roof replacement
- Pool renovation
- Siding/exterior
- Parking lots
- Emergency repairs
- Common area upgrades

### 3. Decision Resources (20%)
- Comparison guides
- Cost calculators
- ROI analysis
- Board decision frameworks

### 4. Case Studies (10%)
- Real HOA examples
- Before/after scenarios
- Cost breakdowns
- Lessons learned

---

## Integration with ClawOps Console

This skill is designed to integrate with your ClawOps dashboard:

### Current Setup

- Agent registered in ClawOps database
- Runs tracked via `/api/runs` endpoint
- Posts saved to OpenClaw workspace
- Notifications via Telegram/WhatsApp

### Future Dashboard Features

- [ ] View generated posts in ClawOps UI
- [ ] Approve/reject from dashboard
- [ ] Publish to WordPress directly
- [ ] Track keyword rankings
- [ ] Analytics: traffic, conversions, ROI
- [ ] Content calendar view
- [ ] Topic queue management

---

## File Structure

```
openclaw-skills/hoa-content-writer/
├── README.md           ← You are here
├── SKILL.md            ← Skill documentation (user-facing)
├── SOUL.md             ← Agent personality and instructions
├── setup.sh            ← Setup script

workspaces/hoa-content-writer/  (created by setup.sh)
├── SOUL.md             ← Copied from skill
├── TOOLS.md            ← Tool usage guide
├── posts/              ← Generated blog posts
│   ├── 2026-02-13-hoa-roof-financing.md
│   ├── 2026-02-14-hoa-pool-renovation.md
│   └── ...
├── drafts/             ← Templates and work-in-progress
│   └── example-post-template.md
└── .topic_history      ← Tracks covered topics
```

---

## Customization

### Adjust Word Count Target

Edit `SOUL.md`, find the section:

```markdown
**Length**: 1200-1500 words (1200 target, 1500 max)
```

Change to your preferred range.

### Add Custom Keywords

Edit `SOUL.md`, update the keyword patterns section with your high-priority terms.

### Change Notification Method

Edit `SOUL.md`, modify the notification section:

- For email: Add SMTP curl command
- For Slack: Add webhook URL
- For Discord: Add webhook URL

### Modify Schedule

```bash
# Remove existing schedule
npx openclaw cron list --json | jq '.jobs[] | select(.agent == "hoa-content-writer")'
npx openclaw cron rm <job-id>

# Add new schedule (example: daily at 9am)
npx openclaw cron add \
  --agent hoa-content-writer \
  --cron "0 9 * * *" \
  --message "Run daily content generation" \
  --tz "America/New_York"
```

---

## Troubleshooting

### Posts are too short

**Issue**: Generated posts are <1000 words

**Fix**: The agent may be getting interrupted. Increase timeout or simplify the task message.

### Topics are repetitive

**Issue**: Same topics appearing multiple times

**Fix**: Clear topic history and explicitly mention variety:
```bash
rm workspaces/hoa-content-writer/.topic_history
# Then in your next run, add to message: "...and avoid topics from the last 30 days"
```

### Telegram notifications not working

**Issue**: No message received

**Checks**:
1. Verify bot token: `echo $TELEGRAM_BOT_TOKEN`
2. Test manually:
   ```bash
   curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
   ```
3. Verify chat ID:
   ```bash
   curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | jq
   ```

### Web search failing

**Issue**: Topic research returns empty results

**Fix**: Check OpenClaw web_search tool is working:
```bash
npx openclaw agent --agent hoa-content-writer --local --message "Search web for 'HOA financing trends'"
```

---

## Examples

### Example 1: Generate Single Post

```bash
npx openclaw agent \
  --agent hoa-content-writer \
  --local \
  --session-id content-$(date +%s) \
  --message "Write an SEO blog post targeting the keyword 'HOA emergency repair funding options'"
```

### Example 2: Research + Generate

```bash
npx openclaw agent \
  --agent hoa-content-writer \
  --local \
  --message "Research trending HOA topics this week, pick the best one, and generate a complete SEO blog post"
```

### Example 3: Specific Project Type

```bash
npx openclaw agent \
  --agent hoa-content-writer \
  --local \
  --message "Create a blog post about HOA pool renovation financing, targeting boards who want to avoid special assessments"
```

---

## Performance Metrics

Track success via:

- **Output Quality**: 1200+ word posts, proper formatting, SEO metadata
- **Keyword Targeting**: Primary keyword in H1, meta, first paragraph
- **Topic Variety**: No duplicate topics within 30 days
- **Delivery Rate**: 3 posts/week on schedule (Mon/Wed/Fri)
- **Approval Rate**: % of drafts approved without major edits

---

## Next Steps

1. **Run Setup**: Execute `setup.sh` to create workspace
2. **Configure Notifications**: Add Telegram credentials to env
3. **Test Generation**: Run one manual post to verify
4. **Schedule Automation**: Set up cron for 3x/week
5. **Monitor Output**: Check `posts/` directory after each run
6. **Integrate with CMS**: Set up WordPress auto-publish (optional)

---

**Questions?** Check `SKILL.md` for detailed documentation or message Steve at steve.j.pilcher@gmail.com
