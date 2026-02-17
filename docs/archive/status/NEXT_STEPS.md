# 🎯 MARKETING TEAM - YOUR NEXT STEPS

**Current Status:** 66% Complete - Agents created, API configuration ready

---

## ✅ WHAT'S DONE

### Your ClawOps Console (100% Complete)
- ✅ All 6 marketing agents registered and visible
- ✅ All schedules configured in database
- ✅ Dashboard fully functional at http://localhost:5173
- ✅ All SOUL.md documents loaded

### OpenClaw (WSL) (80% Complete)
- ✅ All 5 marketing agents created
- ✅ All SOUL.md documents copied to workspaces
- ✅ All agents visible in `npx openclaw agents list`
- ⚠️ Gateway needs systemd for automated scheduling

---

## 📋 YOUR ACTION ITEMS

### STEP 2: Configure API Credentials (10 minutes)

**File location:**
```
WSL: ~/.config/openclaw/.env
Windows: \\wsl$\Ubuntu\home\sjpilche\.config\openclaw\.env
```

**Edit the file:**
```bash
wsl.exe
nano ~/.config/openclaw/.env
```

**Required fields to fill in:**

1. **WordPress (CRITICAL for publishing):**
   ```env
   WORDPRESS_URL=https://www.hoaprojectfunding.com
   WORDPRESS_USER=your_admin_username
   WORDPRESS_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
   ```

   **Get app password:**
   - Go to https://www.hoaprojectfunding.com/wp-admin
   - Users → Your Profile → Application Passwords
   - Create new with name "OpenClaw"
   - Copy the generated password

2. **Social Media APIs (RECOMMENDED):**
   ```env
   LINKEDIN_ACCESS_TOKEN=your_token
   TWITTER_BEARER_TOKEN=your_token
   FACEBOOK_PAGE_ACCESS_TOKEN=your_token
   ```

3. **Email ESP (RECOMMENDED):**
   ```env
   EMAIL_ESP=mailchimp
   MAILCHIMP_API_KEY=your_api_key
   MAILCHIMP_LIST_ID=your_list_id
   ```

4. **Telegram (OPTIONAL - for notifications):**
   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token
   TELEGRAM_CHAT_ID=your_chat_id
   ```

**When done, save and close (Ctrl+X, Y, Enter)**

---

### STEP 3: Test Your Agents (10 minutes)

Run each agent manually to verify they work:

```bash
# Navigate to OpenClaw directory
cd /home/sjpilche/projects/openclaw-v1

# 1. Test Content Writer (works without APIs)
npx openclaw agent --agent hoa-content-writer --local \
  --message "Generate a 500-word blog post about HOA pool renovation financing"

# 2. Test Social Media (works without APIs - creates drafts)
npx openclaw agent --agent hoa-social-media --local \
  --message "Convert the latest blog post to social media posts for LinkedIn, Twitter, and Facebook"

# 3. Test CMS Publisher (REQUIRES WordPress credentials)
npx openclaw agent --agent hoa-cms-publisher --local \
  --message "Check the approved posts folder and report what you find"

# 4. Test Social Engagement (REQUIRES social media APIs)
npx openclaw agent --agent hoa-social-engagement --local \
  --message "Check all platforms for recent engagement"

# 5. Test Email Campaigns (REQUIRES ESP credentials)
npx openclaw agent --agent hoa-email-campaigns --local \
  --message "Check for leads that have been inactive for more than 14 days"
```

**Expected results:**
- Content Writer: Creates markdown file in `workspaces/hoa-content-writer/posts/`
- Social Media: Creates platform-specific posts in `workspaces/hoa-social-media/posts/`
- CMS Publisher: Reports approved posts status or uploads to WordPress
- Social Engagement: Reports engagement data or drafts responses
- Email Campaigns: Reports inactive leads or creates email drafts

---

### STEP 4: Enable Automated Scheduling (5 minutes)

**The Issue:**
OpenClaw's cron scheduler needs systemd enabled in WSL to run automatically.

**The Fix:**

1. **Edit WSL config:**
   ```bash
   wsl.exe
   sudo nano /etc/wsl.conf
   ```

2. **Add these lines:**
   ```ini
   [boot]
   systemd=true
   ```

3. **Save and exit** (Ctrl+X, Y, Enter)

4. **Shutdown WSL from PowerShell:**
   ```powershell
   wsl --shutdown
   ```

5. **Reopen WSL and verify systemd is running:**
   ```bash
   wsl.exe
   systemctl --user status
   ```

   You should see systemd status output (not an error)

6. **Re-run the setup script to add schedules:**
   ```bash
   cd /home/sjpilche/projects/openclaw-v1
   bash /mnt/c/Users/SPilcher/OpenClaw2.0\ for\ linux\ -\ Copy/scripts/setup-marketing-openclaw.sh
   ```

7. **Verify schedules are active:**
   ```bash
   npx openclaw cron list
   ```

   You should see all 8 schedules listed.

---

## 🔄 ALTERNATIVE: Run Agents Manually (No systemd needed)

If you don't want to enable systemd, you can run agents manually when needed:

### Monday/Wednesday/Friday Morning Routine (15 minutes)

```bash
cd /home/sjpilche/projects/openclaw-v1

# 6:00 AM - Generate blog post
npx openclaw agent --agent hoa-content-writer \
  --message "Generate today's blog post about HOA financing"

# [REVIEW BLOG POST: 6:00-8:30am]
# Read the post in workspaces/hoa-content-writer/posts/
# If good, move to workspaces/hoa-cms-publisher/content/approved/

# 7:00 AM - Convert to social posts
npx openclaw agent --agent hoa-social-media \
  --message "Convert latest blog post to social media posts"

# 8:30 AM - Publish to WordPress
npx openclaw agent --agent hoa-cms-publisher \
  --message "Publish approved posts to WordPress"
```

### Daily Morning Routine (5 minutes)

```bash
cd /home/sjpilche/projects/openclaw-v1

# 8:00 AM - Check social engagement
npx openclaw agent --agent hoa-social-engagement \
  --message "Monitor all platforms for new engagement and draft responses"

# 9:00 AM - Check for inactive leads
npx openclaw agent --agent hoa-email-campaigns \
  --message "Find leads inactive for 14+ days and create re-engagement emails"
```

### Monday Only (Weekly Report)

```bash
# 9:00 AM Monday - Weekly engagement report
npx openclaw agent --agent hoa-social-engagement \
  --message "Generate weekly engagement report with metrics and insights"
```

### Tuesday Only (Newsletter)

```bash
# 10:00 AM Tuesday - Weekly newsletter
npx openclaw agent --agent hoa-email-campaigns \
  --message "Create weekly newsletter from recent blog posts"
```

---

## 🎯 CHECKLIST

**Before you can use the system:**

- [ ] **Step 2: Configure APIs**
  - [ ] WordPress credentials added to `~/.config/openclaw/.env`
  - [ ] At least 1 social media API configured (LinkedIn, Twitter, or Facebook)
  - [ ] Email ESP configured (Mailchimp or SendGrid)
  - [ ] Telegram bot configured (optional)

- [ ] **Step 3: Test Agents**
  - [ ] Content Writer generates a test blog post
  - [ ] Social Media converts blog to social posts
  - [ ] CMS Publisher connects to WordPress successfully
  - [ ] Social Engagement accesses social media APIs
  - [ ] Email Campaigns accesses ESP

- [ ] **Step 4: Enable Automation (Choose One)**
  - [ ] Option A: Enable systemd in WSL + run setup script
  - [ ] Option B: Create manual run schedule (no systemd needed)

---

## 📊 VIEW YOUR DASHBOARD

Your ClawOps Console is fully functional right now!

**Start it:**
```bash
cd "c:\Users\SPilcher\OpenClaw2.0 for linux - Copy"
npm run dev
```

**Then visit:**
- **Agents:** http://localhost:5173/agents
- **Schedule:** http://localhost:5173/schedule
- **Audit:** http://localhost:5173/audit
- **Costs:** http://localhost:5173/costs
- **Help:** http://localhost:5173/help

**You can see all 6 agents right now** even before configuring APIs!

---

## 🚀 QUICK START

**Fastest path to your first blog post (15 minutes):**

1. **Configure WordPress only** (skip social media for now):
   ```bash
   wsl.exe
   nano ~/.config/openclaw/.env
   # Add WordPress credentials only
   ```

2. **Test Content Writer:**
   ```bash
   cd /home/sjpilche/projects/openclaw-v1
   npx openclaw agent --agent hoa-content-writer --local \
     --message "Generate blog post: 5 Ways HOAs Can Finance Pool Renovations"
   ```

3. **Review the post:**
   ```bash
   ls -la workspaces/hoa-content-writer/posts/
   cat workspaces/hoa-content-writer/posts/2026-02-14*.md
   ```

4. **If you like it, move to approved:**
   ```bash
   mkdir -p workspaces/hoa-cms-publisher/content/approved/
   cp workspaces/hoa-content-writer/posts/2026-02-14*.md \
      workspaces/hoa-cms-publisher/content/approved/
   ```

5. **Publish to WordPress:**
   ```bash
   npx openclaw agent --agent hoa-cms-publisher --local \
     --message "Publish approved posts to WordPress"
   ```

**Boom! Your first AI-generated blog post published!** 🎉

---

## 📚 DOCUMENTATION

- **This File:** Next steps and action items
- [ACTIVATION_COMPLETE.md](ACTIVATION_COMPLETE.md) - Current status report
- [README_MARKETING_TEAM.md](README_MARKETING_TEAM.md) - Complete overview
- [MARKETING_TEAM_QUICK_START.md](MARKETING_TEAM_QUICK_START.md) - Quick reference
- [MARKETING_ORCHESTRATION.md](MARKETING_ORCHESTRATION.md) - How agents work together

---

## 🆘 TROUBLESHOOTING

**"Cannot find agent hoa-content-writer"**
- Solution: The agent exists in OpenClaw, use the exact ID from `npx openclaw agents list`

**"WordPress connection failed"**
- Check credentials in `~/.config/openclaw/.env`
- Verify app password is correct (no spaces)
- Test: `curl -u "user:password" "https://www.hoaprojectfunding.com/wp-json/wp/v2/posts?per_page=1"`

**"Gateway not running"**
- The gateway has issues with systemd not being enabled
- For now, use `--local` flag to run agents without gateway
- Example: `npx openclaw agent --agent hoa-content-writer --local --message "..."`

**"Agent produces no output"**
- Check workspace: `ls -la workspaces/hoa-content-writer/posts/`
- Check agent logs: `npx openclaw runs list --agent hoa-content-writer`

---

## ✅ SUCCESS METRICS

**Week 1:**
- [ ] 1 blog post generated and published
- [ ] 3 social media posts created
- [ ] WordPress connection working
- [ ] Email sequence tested

**Month 1:**
- [ ] 12 blog posts published (3 per week)
- [ ] 36 social media posts created
- [ ] 100+ email subscribers in sequences
- [ ] 5+ hot leads identified

---

## 🎉 YOU'RE ALMOST THERE!

**What you've built:**
- ✅ 6 marketing agents in ClawOps Console
- ✅ Complete automation system ready
- ✅ Dashboard fully functional
- ✅ All documentation complete

**What's left:**
1. Configure APIs (10 min)
2. Test agents (10 min)
3. Enable automation OR run manually

**Total time to first blog post: ~30 minutes**

**Let's finish this! 💪**

---

*Your marketing team is ready to kick ass - just need those API credentials!*
