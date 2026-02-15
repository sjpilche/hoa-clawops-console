# OpenClaw Scripts Reference

Quick reference for all automation and setup scripts.

---

## Setup & Validation

### `quick-setup-check.sh`

**Purpose:** Validate entire pipeline configuration and identify missing components

**What it checks:**
- Environment variables (.env.local)
- Registered OpenClaw agents
- Active cron jobs
- Gateway status
- Critical configuration files
- Pipeline readiness status

**Usage:**
```bash
cd /home/sjpilche/projects/openclaw-v1
bash scripts/quick-setup-check.sh
```

**Output:**
- ✅/❌ for each environment variable
- List of registered agents
- List of active cron jobs
- Prioritized next steps (🔴 Critical, 🟡 High, 🟢 Low)
- Pipeline status (Content, Publishing, Social, Email, Engagement, Notifications)

**Run this first** to understand what needs to be configured.

---

## Cron Job Management

### `setup-all-crons.sh`

**Purpose:** Configure all 8 cron jobs for the content pipeline in one command

**What it configures:**
- Content Writer (Monday 6 AM)
- CMS Publisher (Tuesday 8 AM)
- Social Media - Facebook + LinkedIn (Tuesday 10 AM)
- Social Media - Facebook Groups (Wednesday 12 PM)
- Social Engagement Monitor (Daily 8 AM)
- Social Engagement Metrics (Monday 9 AM)
- Email Follow-ups Check (Friday 9 AM)
- Monthly Newsletter (First Tuesday 10 AM)

**Usage:**
```bash
cd /home/sjpilche/projects/openclaw-v1
bash scripts/setup-all-crons.sh
```

**When to run:**
- Initial setup
- After updating cron schedule
- After removing old/deprecated cron jobs

---

### `remove-old-crons.sh`

**Purpose:** Remove deprecated cron jobs from old schedule (3x/week, HOAReserveWise references)

**What it removes:**
- Jobs referencing "HOAReserveWise"
- Jobs with "3x/week" or "Mon/Wed/Fri" schedule
- Jobs mentioning "lead magnet" or "email signup"
- Any other deprecated patterns

**Usage:**
```bash
cd /home/sjpilche/projects/openclaw-v1
bash scripts/remove-old-crons.sh
```

**When to run:**
- Before setting up new cron jobs (if you had an old schedule)
- When migrating from old pipeline to new pipeline
- To clean up deprecated automation

**Safe to run:** Script validates before removing, won't delete current schedule

---

## Typical Setup Workflow

### First-Time Setup

```bash
cd /home/sjpilche/projects/openclaw-v1

# 1. Check current status
bash scripts/quick-setup-check.sh

# 2. Address critical issues identified (WordPress, Telegram, agents, etc.)

# 3. Remove old cron jobs (if any exist)
bash scripts/remove-old-crons.sh

# 4. Configure new cron jobs
bash scripts/setup-all-crons.sh

# 5. Verify setup
bash scripts/quick-setup-check.sh
```

### After Configuration Changes

If you update agent SOUL.md files or change the pipeline:

```bash
# 1. Remove existing cron jobs
openclaw cron list --json | jq -r '.[].id' | xargs -I {} openclaw cron remove --id {}

# 2. Re-configure with updated settings
bash scripts/setup-all-crons.sh

# 3. Verify
openclaw cron list
```

### Regular Maintenance

**Weekly:**
```bash
# Check pipeline status
bash scripts/quick-setup-check.sh
```

**Monthly:**
```bash
# Review and update content calendar
# Check cron job execution logs
# Verify all automations are running
```

---

## Manual Commands Reference

### List active cron jobs:
```bash
openclaw cron list
```

### List with full JSON details:
```bash
openclaw cron list --json
```

### Remove a specific cron job:
```bash
openclaw cron remove --id <cron-job-id>
```

### Remove ALL cron jobs:
```bash
openclaw cron list --json | jq -r '.[].id' | xargs -I {} openclaw cron remove --id {}
```

### Test an agent manually:
```bash
openclaw agent \
  --agent hoa-content-writer \
  --local \
  --session-id "test-$(date +%s)" \
  --message "Pick the next unwritten topic from content-calendar.md and generate a blog post."
```

### Check gateway status:
```bash
openclaw gateway status
```

### List registered agents:
```bash
openclaw agents list
```

### Register a new agent:
```bash
openclaw agents add <agent-name>
```

---

## Troubleshooting

### "openclaw: command not found"

**Issue:** OpenClaw CLI is not in your PATH

**Fix:**
```bash
# Check if OpenClaw is installed
which openclaw

# If not found, install or add to PATH
export PATH="$PATH:/path/to/openclaw/bin"
```

---

### "No cron jobs found"

**Issue:** Cron jobs haven't been configured yet

**Fix:**
```bash
bash scripts/setup-all-crons.sh
```

---

### "Agent not registered"

**Issue:** Agent hasn't been added to OpenClaw

**Fix:**
```bash
openclaw agents add hoa-content-writer
openclaw agents add hoa-social-media
openclaw agents add hoa-email-campaigns
openclaw agents add hoa-social-engagement
openclaw agents add hoa-cms-publisher
```

---

### "Environment variable not set"

**Issue:** Missing credentials in .env.local

**Fix:**
1. Edit `server/.env.local`
2. Add required variables:
   ```
   TELEGRAM_BOT_TOKEN=your_token_here
   TELEGRAM_CHAT_ID=your_chat_id_here
   WORDPRESS_URL=https://www.hoaprojectfunding.com
   WORDPRESS_USER=your_wordpress_user
   WORDPRESS_APP_PASSWORD=your_app_password
   SENDGRID_API_KEY=your_sendgrid_key
   ```
3. Run `bash scripts/quick-setup-check.sh` to verify

---

### Cron job runs but nothing happens

**Possible causes:**
1. Agent SOUL.md or SKILL.md has errors
2. Environment variables missing
3. File paths incorrect
4. Permissions issue

**Debug:**
```bash
# Test agent manually with same message
openclaw agent \
  --agent <agent-name> \
  --local \
  --session-id "debug-$(date +%s)" \
  --message "<same message from cron job>"

# Check agent logs
openclaw logs --agent <agent-name>
```

---

## Environment Variables Required

**Critical (pipeline won't work without these):**
- `WORDPRESS_URL` - WordPress site URL
- `WORDPRESS_USER` - WordPress username
- `WORDPRESS_APP_PASSWORD` - WordPress application password
- `TELEGRAM_BOT_TOKEN` - Telegram bot token (for notifications)
- `TELEGRAM_CHAT_ID` - Telegram chat ID (for notifications)

**Important (needed for email sequences):**
- `SENDGRID_API_KEY` - SendGrid API key (preferred)
- OR `MAILCHIMP_API_KEY` - Mailchimp API key

**Optional (can post manually):**
- `LINKEDIN_ACCESS_TOKEN` - LinkedIn API token
- `FACEBOOK_PAGE_ACCESS_TOKEN` - Facebook page token

---

## File Locations

**Configuration:**
- Environment variables: `server/.env.local`
- Pipeline schedule: `docs/pipeline-schedule.md`
- Cron commands: `docs/cron-commands-reference.md`

**Agent workspaces:**
- Content Writer: `workspaces/hoa-content-writer/`
- Social Media: `workspaces/hoa-social-media/`
- Email Campaigns: `workspaces/hoa-email-campaigns/`
- Social Engagement: `workspaces/hoa-social-engagement/`
- CMS Publisher: `workspaces/hoa-cms-publisher/`

**Critical files:**
- Content calendar: `workspaces/hoa-content-writer/content-calendar.md`
- Platform strategy: `workspaces/hoa-social-media/platform-strategy.md`
- Email sequences: `workspaces/hoa-email-campaigns/config/sequences-config.json`
- Lead scoring: `workspaces/hoa-social-engagement/config/lead-scoring.json`

---

## Support

**Documentation:**
- Pipeline schedule: `docs/pipeline-schedule.md`
- Cron commands: `docs/cron-commands-reference.md`

**Quick checks:**
```bash
# Full setup validation
bash scripts/quick-setup-check.sh

# List active cron jobs
openclaw cron list

# List registered agents
openclaw agents list

# Check gateway status
openclaw gateway status
```

**For detailed agent behavior:**
- Read individual agent `SOUL.md` files
- Check `SKILL.md` for setup instructions
- Review `platform-strategy.md` and `sequences-config.json` for configuration
