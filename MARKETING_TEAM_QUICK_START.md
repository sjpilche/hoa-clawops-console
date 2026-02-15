# 🚀 MARKETING TEAM - QUICK START GUIDE

**Everything you need to activate your marketing automation system**

---

## ✅ CURRENT STATUS: READY TO LAUNCH

### Phase 1: Database Setup ✅ COMPLETE
- ✅ 6 agents registered in ClawOps database
- ✅ 8 cron schedules configured
- ✅ 5 SOUL documents loaded
- ✅ Dashboard fully functional
- ✅ API endpoints ready

### Phase 2: OpenClaw Activation ⏳ READY TO RUN
- ⏳ Run setup script in WSL
- ⏳ Configure API credentials
- ⏳ Test each agent
- ⏳ Verify schedules active

---

## 🎯 ONE-COMMAND ACTIVATION

Open WSL and run:

```bash
bash /mnt/c/Users/SPilcher/OpenClaw2.0\ for\ linux\ -\ Copy/scripts/setup-marketing-openclaw.sh
```

**This creates:**
- All 5 OpenClaw agents
- All 8 cron schedules
- Workspace directories
- SOUL.md documents

**Time:** ~5 minutes

---

## ⚙️ CONFIGURE API CREDENTIALS

Copy environment template:

```bash
cp /mnt/c/Users/SPilcher/OpenClaw2.0\ for\ linux\ -\ Copy/.env.marketing.template \
   ~/.config/openclaw/.env
```

Edit with your credentials:

```bash
nano ~/.config/openclaw/.env
```

**Required services:**
- WordPress (for CMS Publisher)
- LinkedIn API (for Social Media & Engagement)
- Twitter API (for Social Media & Engagement)
- Facebook API (for Social Media & Engagement)
- Mailchimp/ESP (for Email Campaigns)
- Telegram Bot (optional - for notifications)

**Time:** ~10 minutes

---

## 🧪 TEST YOUR AGENTS

Run each agent manually to verify:

```bash
# Content Writer
npx openclaw agent --agent hoa-content-writer --local \
  --message "Generate blog post about HOA pool renovation financing"

# Social Media
npx openclaw agent --agent hoa-social-media --local \
  --message "Convert latest blog to social media posts"

# CMS Publisher
npx openclaw agent --agent hoa-cms-publisher --local \
  --message "Publish approved posts to WordPress"

# Social Engagement
npx openclaw agent --agent hoa-social-engagement --local \
  --message "Check platforms for new engagement"

# Email Campaigns
npx openclaw agent --agent hoa-email-campaigns --local \
  --message "Check for inactive leads needing re-engagement"
```

**Time:** ~10 minutes

---

## 📊 YOUR MARKETING TEAM

### 6 Agents Ready to Work

| Agent | Purpose | Schedule | Output |
|-------|---------|----------|--------|
| **HOA Content Writer** | Generate blog posts | Mon/Wed/Fri 6am | 1200-1500 word posts |
| **HOA Social Media** | Convert to social posts | Mon/Wed/Fri 7am | LinkedIn, Twitter, Facebook |
| **HOA CMS Publisher** | Publish to WordPress | Mon/Wed/Fri 8:30am | WordPress drafts |
| **HOA Social Engagement** | Monitor & respond | Daily 8am + Mon 9am | Response drafts, lead scoring |
| **HOA Email Campaigns** | Nurture sequences | Daily 9am + Tue 10am | Emails, newsletters |
| **HOA Event Hunter** | Find prospects | On-demand | HOA prospect lists |

### 8 Automated Schedules

**Content Days** (Mon/Wed/Fri):
- 6:00 AM - Generate blog post
- 7:00 AM - Convert to social posts
- 8:30 AM - Publish to WordPress

**Every Day:**
- 8:00 AM - Monitor social engagement
- 9:00 AM - Check inactive leads

**Weekly:**
- Monday 9:00 AM - Engagement report
- Tuesday 10:00 AM - Newsletter

---

## 🎯 HOW THEY WORK TOGETHER

```
MONDAY/WEDNESDAY/FRIDAY (Content Days)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

6:00 AM  📝 Content Writer
         └─ Generates 1200-1500 word blog post
            Output: workspaces/hoa-content-writer/posts/

[6:00-8:30 AM: HUMAN REVIEW WINDOW]
         └─ Review post, move to approved/ if good

7:00 AM  📱 Social Media
         └─ Converts blog to LinkedIn, Twitter, Facebook
            Output: workspaces/hoa-social-media/posts/

8:00 AM  👂 Social Engagement
         └─ Monitors all platforms for comments/engagement
            Output: Response drafts + lead scoring

8:30 AM  🌐 CMS Publisher
         └─ Uploads approved posts to WordPress
            Output: WordPress drafts + logs

9:00 AM  ✉️ Email Campaigns
         └─ Checks for inactive leads, creates re-engagement
            Output: Email drafts


TUESDAY SPECIAL (Newsletter Day)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

10:00 AM ✉️ Email Campaigns
         └─ Generates weekly newsletter from recent posts
            Output: Newsletter draft


MONDAY SPECIAL (Reporting Day)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

9:00 AM  👂 Social Engagement
         └─ Creates weekly engagement report
            Output: Metrics, top content, lead quality
```

---

## 👤 YOUR DAILY WORKFLOW

### Content Days (Mon/Wed/Fri) - 10 minutes

1. **6:00-8:30 AM** - Review Content Writer blog post
   - Read the generated post
   - Edit if needed (tone, accuracy, brand)
   - Move to `approved/` folder if good

2. **After 8:30 AM** - Finalize WordPress post
   - Open WordPress drafts
   - Add featured image
   - Publish or schedule

3. **Anytime** - Review social media drafts
   - Check Social Media outputs
   - Post or schedule to platforms

### Every Day - 5 minutes

4. **Check hot lead notifications**
   - Review Telegram alerts
   - Follow up with high-intent leads

5. **Review Social Engagement drafts**
   - Check response drafts
   - Send or edit responses

### Weekly Tasks - 30 minutes

6. **Monday** - Review engagement report
   - Read Social Engagement metrics
   - Adjust strategy based on insights

7. **Tuesday** - Review and send newsletter
   - Check Email Campaigns newsletter draft
   - Send via Mailchimp/ESP

---

## 🔍 MONITORING YOUR TEAM

### Dashboard (ClawOps Console)

Start the dashboard:
```bash
cd "c:\Users\SPilcher\OpenClaw2.0 for linux - Copy"
npm run dev
```

Open in browser: http://localhost:5173

**Pages:**
- [/agents](http://localhost:5173/agents) - View all 6 agents
- [/schedule](http://localhost:5173/schedule) - View 8 schedules
- [/audit](http://localhost:5173/audit) - Activity logs
- [/costs](http://localhost:5173/costs) - AI spending tracker
- [/help](http://localhost:5173/help) - Slash commands

### Command Line

```bash
# List agents
npx openclaw agents list

# Check schedules
npx openclaw cron list

# View recent runs
npx openclaw runs list --limit 10

# Check latest blog post
ls -lt workspaces/hoa-content-writer/posts/ | head -3
```

---

## 📁 WHERE TO FIND OUTPUTS

All agent outputs are in WSL:

```
/home/sjpilche/projects/openclaw-v1/workspaces/

├── hoa-content-writer/posts/       ← Blog posts
├── hoa-social-media/posts/         ← Social media drafts
├── hoa-cms-publisher/content/      ← Published/approved posts
├── hoa-social-engagement/leads/    ← Lead scoring
└── hoa-email-campaigns/sequences/  ← Email drafts
```

**From Windows, access via:**
```bash
\\wsl$\Ubuntu\home\sjpilche\projects\openclaw-v1\workspaces\
```

---

## 🎯 WEEK 1 GOALS

- [ ] Run setup script successfully
- [ ] Test all 5 agents manually
- [ ] Generate and publish 1 blog post
- [ ] Create social media posts for all 3 platforms
- [ ] Set up email sequence in Mailchimp
- [ ] Receive first Telegram notification
- [ ] Review first Monday engagement report

---

## 📚 DOCUMENTATION REFERENCE

**Quick References:**
- [MARKETING_TEAM_STATUS.md](MARKETING_TEAM_STATUS.md) - Current status report
- [MARKETING_ORCHESTRATION.md](MARKETING_ORCHESTRATION.md) - How agents work together
- This file - Quick start guide

**Comprehensive Guides:**
- [MARKETING_TEAM_ACTIVATED.md](MARKETING_TEAM_ACTIVATED.md) - Master activation guide
- [HOA-MARKETING-AUTOMATION.md](openclaw-skills/HOA-MARKETING-AUTOMATION.md) - Full system overview
- Individual SOUL.md files - Agent-specific instructions

**Dashboard Features:**
- [QUICK_WINS_COMPLETE.md](QUICK_WINS_COMPLETE.md) - Dashboard capabilities
- [HIDDEN_FEATURES_EXPOSED.md](HIDDEN_FEATURES_EXPOSED.md) - Slash commands

---

## 🚨 TROUBLESHOOTING

### "Agent not found"
```bash
# List all agents
npx openclaw agents list

# If missing, run setup script again
bash /mnt/c/Users/SPilcher/OpenClaw2.0\ for\ linux\ -\ Copy/scripts/setup-marketing-openclaw.sh
```

### "Schedule not running"
```bash
# Check if gateway is running
npx openclaw gateway status

# Start gateway if needed
npx openclaw gateway run &

# List schedules
npx openclaw cron list
```

### "WordPress connection failed"
```bash
# Test WordPress API
curl -u "${WORDPRESS_USER}:${WORDPRESS_APP_PASSWORD}" \
  "${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=1"

# Check .env file
cat ~/.config/openclaw/.env | grep WORDPRESS
```

### "No blog post generated"
```bash
# Check workspace
ls -la workspaces/hoa-content-writer/posts/

# Check recent runs
npx openclaw runs list --agent hoa-content-writer --limit 5

# Run manually
npx openclaw agent --agent hoa-content-writer --local \
  --message "Generate test blog post"
```

---

## ✅ FINAL CHECKLIST

**Before Launch:**
- [ ] Setup script completed successfully
- [ ] All 5 agents visible in `npx openclaw agents list`
- [ ] All 8 schedules visible in `npx openclaw cron list`
- [ ] API credentials configured in .env
- [ ] Each agent tested manually
- [ ] WordPress connection verified
- [ ] Social media APIs tested
- [ ] Email ESP connected
- [ ] Telegram bot working (optional)

**After Launch:**
- [ ] First blog post generated
- [ ] First social media posts created
- [ ] First WordPress publish successful
- [ ] First engagement report received
- [ ] First email sequence started
- [ ] Dashboard monitoring active
- [ ] Cost tracking enabled

---

## 🚀 READY? LET'S GO!

**Your next command:**

```bash
bash /mnt/c/Users/SPilcher/OpenClaw2.0\ for\ linux\ -\ Copy/scripts/setup-marketing-openclaw.sh
```

Then check your dashboard at http://localhost:5173/agents

**Your marketing team is ready to kick ass! 💪**

---

*Questions? Check the comprehensive docs or review the audit log for any errors.*
