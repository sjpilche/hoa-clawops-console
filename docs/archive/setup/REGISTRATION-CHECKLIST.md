# Registration & Setup Checklist - HOA Marketing Agents

After completing the HOA Content Writer + Social Media skills setup, here's where you need to register/configure:

---

## ✅ Completed

### Content Writer Agent
- [x] OpenClaw agent registered (`hoa-content-writer`)
- [x] Workspace created at `/workspaces/hoa-content-writer`
- [x] SOUL.md and TOOLS.md configured
- [x] Test post generated successfully

### Social Media Agent
- [x] OpenClaw agent registered (`hoa-social-media`)
- [x] Workspace created at `/workspaces/hoa-social-media`
- [x] SOUL.md and TOOLS.md configured
- [x] Test conversion successful (blog → LinkedIn/Twitter/Facebook)

### CMS Publisher Agent
- [x] OpenClaw agent registered (`hoa-cms-publisher`)
- [x] Workspace created at `/workspaces/hoa-cms-publisher`
- [x] SOUL.md and TOOLS.md configured
- [x] Directory structure created (approved/, published/, failed/, logs/)
- [x] Example post created in drafts/

### Social Engagement Monitor Agent
- [x] OpenClaw agent registered (`hoa-social-engagement`)
- [x] Workspace created at `/workspaces/hoa-social-engagement`
- [x] SOUL.md and TOOLS.md configured
- [x] Directory structure created (drafts/, posted/, leads/, metrics/, logs/)
- [x] Example draft responses created

### Email Marketing Campaigns Agent
- [x] OpenClaw agent registered (`hoa-email-campaigns`)
- [x] Workspace created at `/workspaces/hoa-email-campaigns`
- [x] SOUL.md and TOOLS.md configured
- [x] Directory structure created (sequences/, newsletters/, templates/, metrics/, logs/)
- [x] Email sequence templates created (6-email nurture, newsletter, re-engagement)

---

## 🔔 Notification Setup (REQUIRED)

### Option 1: Telegram (Recommended)

**What you get**: Instant notifications when posts are ready for review

**Steps**:
1. [ ] Create Telegram bot
   - Open Telegram, message [@BotFather](https://t.me/BotFather)
   - Send `/newbot`
   - Choose a name: "HOA Content Bot" (or similar)
   - Choose username: `hoa_content_bot` (or similar)
   - Copy the bot token (looks like: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)

2. [ ] Get your Chat ID
   - Message your new bot (send any message)
   - Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   - Find the `"chat":{"id":123456789}` number
   - Copy that number

3. [ ] Add to `.env.local`:
   ```bash
   TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
   TELEGRAM_CHAT_ID=123456789
   ```

4. [ ] Test notification:
   ```bash
   curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
     -d "chat_id=${TELEGRAM_CHAT_ID}" \
     -d "text=Test from HOA Content Writer"
   ```

### Option 2: WhatsApp (Alternative)

**What you get**: WhatsApp messages when posts are ready

**Requirements**: `wacli` CLI tool installed

**Steps**:
1. [ ] Install wacli (if not installed)
   ```bash
   # Installation instructions: https://wacli.sh
   ```

2. [ ] Authenticate wacli with your phone

3. [ ] Add to `.env.local`:
   ```bash
   WHATSAPP_PHONE=+12345678900
   ```

4. [ ] Test:
   ```bash
   wacli send "${WHATSAPP_PHONE}" "Test from HOA Content Writer"
   ```

---

## 🌐 Netlify + Git Setup (REQUIRED for CMS Publisher)

### Configure Git Repository & Netlify Deployment

**What you get**: Automated blog post publishing to www.hoaprojectfunding.com via Git commits

**Steps**:

#### 1. Set Up Git Repository (if not already done)

1. [ ] Clone your Netlify site repository to WSL:
   ```bash
   wsl.exe bash -c "cd /home/sjpilche/projects && \
     git clone git@github.com:YOUR-USERNAME/hoaprojectfunding-site.git"
   ```
   Replace `YOUR-USERNAME` with your actual GitHub username/org

2. [ ] Configure SSH keys for GitHub (if not already done):
   ```bash
   # Generate SSH key in WSL
   wsl.exe bash -c "ssh-keygen -t ed25519 -C 'your_email@example.com'"

   # Copy public key
   wsl.exe bash -c "cat ~/.ssh/id_ed25519.pub"
   # Add this to GitHub → Settings → SSH and GPG keys → New SSH key
   ```

3. [ ] Test Git authentication:
   ```bash
   wsl.exe bash -c "ssh -T git@github.com"
   # Should see: "Hi username! You've successfully authenticated..."
   ```

#### 2. Add Environment Variables

1. [ ] Add to `.env.local` (in `/home/sjpilche/projects/openclaw-v1/`):
   ```bash
   # Git Repository for Netlify Publishing
   CONTENT_REPO_PATH=/home/sjpilche/projects/hoaprojectfunding-site
   ```

2. [ ] Verify repository path is correct:
   ```bash
   wsl.exe bash -c "ls -la \${CONTENT_REPO_PATH}/content/blog/ 2>&1"
   # Should show your blog content directory (or whatever path your SSG uses)
   ```

#### 3. Connect Repository to Netlify (if not already done)

1. [ ] Log into Netlify dashboard: https://app.netlify.com
2. [ ] Click "**Add new site**" → "**Import an existing project**"
3. [ ] Connect to GitHub and select your `hoaprojectfunding-site` repo
4. [ ] Configure build settings (Netlify usually auto-detects):
   - **Branch**: `main` (or `master`)
   - **Build command**: (auto-detected for most SSGs)
   - **Publish directory**: (e.g., `dist/`, `public/`, `.next/`)
5. [ ] Click "**Deploy site**"
6. [ ] Note your Netlify site name (e.g., `hoaprojectfunding.netlify.app`)

#### 4. Test Git Publishing Workflow

1. [ ] Create test post in approved directory:
   ```bash
   wsl.exe bash -c "cat > /home/sjpilche/projects/openclaw-v1/workspaces/hoa-cms-publisher/content/approved/2026-02-13-test-post.md << 'EOF'
   ---
   title: Test Post
   slug: test-post
   date: 2026-02-13
   meta_description: Test post for Git publishing
   category: Board Resources
   keywords: [test]
   ---

   # Test Post

   This is a test post to verify Git publishing works.
   EOF"
   ```

2. [ ] Trigger publish agent:
   ```bash
   wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && \
     npx openclaw agent --agent hoa-cms-publisher --local \
     --message 'Publish all approved posts to Git'"
   ```

3. [ ] Verify Git commit:
   ```bash
   wsl.exe bash -c "cd \${CONTENT_REPO_PATH} && git log --oneline -1"
   # Should show: "Publish: Test Post"
   ```

4. [ ] Check Netlify deploy:
   - Go to: https://app.netlify.com/sites/YOUR-SITE-NAME/deploys
   - Should see new deploy triggered by Git push
   - Wait ~2-3 minutes for build to complete
   - Visit: https://hoaprojectfunding.com/blog/test-post/
   - Should see test post live

5. [ ] Clean up test post (optional):
   ```bash
   wsl.exe bash -c "cd \${CONTENT_REPO_PATH} && \
     git rm content/blog/2026-02-13-test-post.md && \
     git commit -m 'Remove test post' && \
     git push origin main"
   ```

---

## 📱 Social Media API Setup (REQUIRED for Engagement Monitor)

### Configure Social Media Credentials

**What you get**: Automated engagement monitoring, lead identification, and response drafting for LinkedIn, Twitter, and Facebook

**Steps**:

#### LinkedIn API Setup

1. [ ] Create LinkedIn app:
   - Go to: https://www.linkedin.com/developers/apps
   - Click "Create app"
   - Fill in app details (Company page required)
   - Request permissions: `r_organization_social`, `w_organization_social`

2. [ ] Generate OAuth 2.0 token:
   - Use LinkedIn OAuth 2.0 flow or Postman
   - Save access token (60-day expiration)

3. [ ] Get organization ID:
   - Find in company page URL: `linkedin.com/company/YOUR-ORG-ID`
   - Or use API: `curl -H "Authorization: Bearer TOKEN" https://api.linkedin.com/v2/organizations`

#### Twitter/X API Setup

1. [ ] Create Twitter app:
   - Go to: https://developer.twitter.com/en/portal/dashboard
   - Click "Create Project" → "Create App"
   - Enable OAuth 2.0 with Read + Write permissions

2. [ ] Generate Bearer Token:
   - In app settings → "Keys and tokens"
   - Generate Bearer Token
   - Save token (no expiration)

3. [ ] Get your user ID:
   - Use API: `curl -H "Authorization: Bearer TOKEN" https://api.twitter.com/2/users/by/username/YOUR_USERNAME`
   - Save the `id` field

#### Facebook API Setup

1. [ ] Create Facebook app:
   - Go to: https://developers.facebook.com/apps
   - Click "Create App" → "Business" type
   - Add "Pages" product

2. [ ] Generate long-lived page access token:
   - Use Graph API Explorer: https://developers.facebook.com/tools/explorer
   - Get page access token
   - Exchange for long-lived token (60 days)

3. [ ] Get page ID:
   - Settings → About → Page ID

#### Add All Credentials to `.env.local`

```bash
# Social Media APIs (for Engagement Monitor)
LINKEDIN_ACCESS_TOKEN=your_oauth_token_here
LINKEDIN_ORGANIZATION_ID=12345678

TWITTER_BEARER_TOKEN=your_bearer_token_here
TWITTER_USER_ID=your_user_id_here

FACEBOOK_PAGE_ACCESS_TOKEN=your_long_lived_token_here
FACEBOOK_PAGE_ID=your_page_id_here
```

#### Test API Connections

```bash
# Test LinkedIn
wsl.exe bash -c "curl -H 'Authorization: Bearer \${LINKEDIN_ACCESS_TOKEN}' 'https://api.linkedin.com/v2/me'"

# Test Twitter
wsl.exe bash -c "curl -H 'Authorization: Bearer \${TWITTER_BEARER_TOKEN}' 'https://api.twitter.com/2/users/\${TWITTER_USER_ID}'"

# Test Facebook
wsl.exe bash -c "curl 'https://graph.facebook.com/v18.0/\${FACEBOOK_PAGE_ID}?access_token=\${FACEBOOK_PAGE_ACCESS_TOKEN}'"
```

All should return 200 OK with JSON data.

### Alternative: Skip API Setup (Manual Monitoring)

If you don't want to set up APIs immediately:
- Agent can still function with manual input
- You provide engagement data manually
- Agent drafts responses based on your input
- Set up APIs later when ready for full automation

---

## 📧 Email Service Provider Setup (REQUIRED for Email Campaigns)

### Configure ESP Credentials

**What you get**: Automated email nurture sequences, weekly newsletters, and re-engagement campaigns

**Choose Your ESP**: Mailchimp (recommended for beginners), SendGrid (developer-friendly), ConvertKit (simple automation), or ActiveCampaign (most powerful)

**Steps**:

#### Mailchimp Setup (Recommended)

1. [ ] Create Mailchimp account:
   - Go to: https://mailchimp.com/
   - Sign up for free account (up to 500 contacts free)

2. [ ] Get API credentials:
   - Account → Extras → API Keys
   - Create new API key
   - Note your server prefix (e.g., us1, us2) from Mailchimp URL

3. [ ] Create audience (list):
   - Audience → All contacts → Create Audience
   - Save the List ID (Account → Audience → Settings → Audience name and defaults)

4. [ ] Add to `.env.local`:
   ```bash
   # Email Service Provider (Mailchimp)
   EMAIL_ESP=mailchimp
   MAILCHIMP_API_KEY=your_api_key_here
   MAILCHIMP_SERVER_PREFIX=us1
   MAILCHIMP_LIST_ID=your_list_id_here
   ```

5. [ ] Test connection:
   ```bash
   wsl.exe bash -c "curl -u 'anystring:\${MAILCHIMP_API_KEY}' 'https://\${MAILCHIMP_SERVER_PREFIX}.api.mailchimp.com/3.0/lists/\${MAILCHIMP_LIST_ID}'"
   ```

#### Alternative ESPs

**SendGrid**:
- API Keys in Settings → API Keys
- Add to `.env.local`: `EMAIL_ESP=sendgrid`, `SENDGRID_API_KEY=...`

**ConvertKit**:
- API Secret in Account → Settings → Show API Secret
- Add to `.env.local`: `EMAIL_ESP=convertkit`, `CONVERTKIT_API_SECRET=...`

**ActiveCampaign**:
- API URL and Key in Settings → Developer
- Add to `.env.local`: `EMAIL_ESP=activecampaign`, `ACTIVECAMPAIGN_API_URL=...`, `ACTIVECAMPAIGN_API_KEY=...`

See `openclaw-skills/hoa-email-campaigns/TOOLS.md` for detailed API setup

---

## ⏰ Scheduling Setup

### Full Content Pipeline Automation

The five agents work together in sequence:
1. **6:00 AM** (Mon/Wed/Fri) - Content Writer generates blog post
2. **7:00 AM** (Mon/Wed/Fri) - Social Media converts blog to social posts
3. **8:00 AM** (Daily) - Social Engagement Monitor checks platforms for interactions
4. **8:30 AM** (Mon/Wed/Fri) - CMS Publisher commits approved posts to Git (triggers Netlify build)
5. **9:00 AM** (Daily) - Email Campaigns checks for re-engagement opportunities
6. **10:00 AM** (Tuesday) - Email Campaigns sends weekly newsletter

**Steps**:

#### 1. Schedule Content Writer (Mon/Wed/Fri 6:00 AM EST)
```bash
wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && \
  npx openclaw cron add \
    --agent hoa-content-writer \
    --cron '0 6 * * 1,3,5' \
    --message 'Research trending HOA financing topics and generate one SEO-optimized blog post with frontmatter' \
    --tz 'America/New_York' \
    --name 'HOA Content Writer - Mon/Wed/Fri 6am'"
```

#### 2. Schedule Social Media Converter (Mon/Wed/Fri 7:00 AM EST)
```bash
wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && \
  npx openclaw cron add \
    --agent hoa-social-media \
    --cron '0 7 * * 1,3,5' \
    --message 'Convert the latest blog post from hoa-content-writer to LinkedIn, Twitter, and Facebook posts with optimal scheduling' \
    --tz 'America/New_York' \
    --name 'HOA Social Media - Mon/Wed/Fri 7am'"
```

#### 3. Schedule CMS Publisher (Mon/Wed/Fri 8:30 AM EST)
```bash
wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && \
  npx openclaw cron add \
    --agent hoa-cms-publisher \
    --cron '30 8 * * 1,3,5' \
    --message 'Check approved directory and publish all approved posts to Git (triggers Netlify build). Send confirmation.' \
    --tz 'America/New_York' \
    --name 'HOA CMS Publisher - Mon/Wed/Fri 8:30am'"
```

#### 4. Schedule Social Engagement Monitor (Daily 8:00 AM EST)
```bash
wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && \
  npx openclaw cron add \
    --agent hoa-social-engagement \
    --cron '0 8 * * *' \
    --message 'Check all social platforms for new engagement, draft responses for leads, and send daily digest' \
    --tz 'America/New_York' \
    --name 'HOA Social Engagement - Daily 8am'"
```

#### 5. Schedule Weekly Metrics Report (Monday 9:00 AM EST)
```bash
wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && \
  npx openclaw cron add \
    --agent hoa-social-engagement \
    --cron '0 9 * * 1' \
    --message 'Generate weekly engagement metrics report and analyze top-performing content' \
    --tz 'America/New_York' \
    --name 'HOA Social Engagement - Weekly Metrics'"
```

#### 6. Schedule Email Re-engagement Check (Daily 9:00 AM EST)
```bash
wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && \
  npx openclaw cron add \
    --agent hoa-email-campaigns \
    --cron '0 9 * * *' \
    --message 'Check for leads inactive 30+ days and create re-engagement email drafts' \
    --tz 'America/New_York' \
    --name 'HOA Email Campaigns - Daily Re-engagement'"
```

#### 7. Schedule Weekly Newsletter (Tuesday 10:00 AM EST)
```bash
wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && \
  npx openclaw cron add \
    --agent hoa-email-campaigns \
    --cron '0 10 * * 2' \
    --message 'Generate weekly newsletter from recent blog posts and create ESP draft campaign' \
    --tz 'America/New_York' \
    --name 'HOA Email Campaigns - Weekly Newsletter'"
```

#### 8. Verify all cron jobs registered
```bash
wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && npx openclaw cron list"
```

#### 9. Ensure OpenClaw gateway is running
```bash
wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && npx openclaw gateway status"
```
- If not running, start it:
  ```bash
  wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && npx openclaw gateway run &"
  ```

---

## 📊 Social Media Publishing Platforms (Optional)

### Mixpost (Recommended for Social Media)

If you want to queue social media posts for approval before publishing:

**What you get**: Dashboard to review, edit, and schedule social posts to LinkedIn/Twitter/Facebook

**Steps**:
1. [ ] Install Mixpost (self-hosted social media management):
   ```bash
   # Follow installation: https://mixpost.app/
   ```

2. [ ] Connect social accounts in Mixpost dashboard:
   - LinkedIn company page
   - Twitter/X account
   - Facebook business page

3. [ ] Test queue:
   ```bash
   mixpost queue --platform linkedin --content "Test post" --schedule "2026-03-15T09:00:00-05:00"
   mixpost dashboard  # View queued posts
   ```

### Direct Social Media APIs (Alternative)

If you want to skip Mixpost and post directly to platforms:

**LinkedIn**:
- Create LinkedIn app: https://www.linkedin.com/developers/apps
- Get access token and organization ID
- Add to `.env.local`: `LINKEDIN_ACCESS_TOKEN` and `LINKEDIN_ORGANIZATION_ID`

**Twitter/X**:
- Create Twitter app: https://developer.twitter.com/
- Generate API keys and tokens
- Add to `.env.local`: `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET`

**Facebook**:
- Create Facebook app: https://developers.facebook.com/
- Get long-lived page access token
- Add to `.env.local`: `FACEBOOK_PAGE_ACCESS_TOKEN` and `FACEBOOK_PAGE_ID`

See `openclaw-skills/hoa-social-media/TOOLS.md` for detailed API setup

---

## 📈 SEO & Analytics Tools (Optional)

### Google Search Console

**Why**: Track keyword rankings and organic traffic

1. [ ] Verify domain ownership at [search.google.com/search-console](https://search.google.com/search-console)
2. [ ] Submit sitemap: `https://www.hoaprojectfunding.com/sitemap.xml`
3. [ ] Monitor performance weekly

### Google Analytics 4

**Why**: Track post performance and conversions

1. [ ] Set up GA4 property for hoaprojectfunding.com
2. [ ] Add tracking code to site template/layout file
3. [ ] Create custom events for "Contact Form Submit" from blog pages

### Ahrefs / SEMrush (Paid)

**Why**: Keyword research and competitor analysis

1. [ ] Sign up for Ahrefs or SEMrush (optional)
2. [ ] Add hoaprojectfunding.com as tracked domain
3. [ ] Use for advanced keyword research before content creation

---

## 🗂️ Project Management (Optional)

### Trello / Notion Content Calendar

**Why**: Plan topics, track drafts, schedule publishing

1. [ ] Create board/database for "HOA Blog Content"
2. [ ] Columns: Ideas → In Progress → Draft Ready → Published
3. [ ] Link generated posts from OpenClaw workspace

---

## 🔐 Access & Credentials Summary

**Required**:
- [ ] Telegram Bot Token (for notifications)
- [ ] Telegram Chat ID (for notifications)

**Optional**:
- [ ] WhatsApp Phone Number (alternative notifications)
- [ ] Git Repository Path (auto-publish to Netlify)
- [ ] Google Search Console (SEO tracking)
- [ ] Google Analytics 4 (traffic tracking)

---

## 📝 Manual Steps in Automated Pipeline

After agents run automatically:

### 1. Review Blog Draft (6:00 AM - Generated)
   - Receive Telegram/WhatsApp notification
   - Check file: `/workspaces/hoa-content-writer/posts/YYYY-MM-DD-*.md`
   - **Review for**:
     - Accuracy and factual correctness
     - Keyword usage and SEO optimization
     - Internal links are valid
     - Tone matches brand voice
     - No AI-generated fluff

### 2. Approve for Publishing (Before 8:30 AM)
   - **If approved**: Move to CMS publisher approved directory
     ```bash
     wsl.exe bash -c "cp /home/sjpilche/projects/openclaw-v1/workspaces/hoa-content-writer/posts/YYYY-MM-DD-post.md \
       /home/sjpilche/projects/openclaw-v1/workspaces/hoa-cms-publisher/content/approved/"
     ```
   - **If needs edits**: Edit the file directly, then move to approved/
   - **If rejected**: Leave in content-writer/posts/ (won't be published)

### 3. Automated Publishing (8:30 AM - if approved)
   - CMS Publisher agent detects file in approved/
   - Validates markdown and frontmatter
   - Copies to Git repository content directory
   - Commits and pushes to GitHub (triggers Netlify build)
   - Logs to `logs/publish-log.json` and `logs/publish-log.csv`
   - Moves file to published/ directory
   - Sends Telegram confirmation with site URL and deploy status

### 4. Netlify Build & Deploy (~2-3 minutes)
   - Netlify detects Git push
   - Builds site automatically
   - Deploys to CDN
   - Post goes live at: https://hoaprojectfunding.com/blog/[slug]/
   - Check deploy status: https://app.netlify.com/sites/[your-site]/deploys

### 5. Post-Publish Verification (Optional)
   - Visit the live post URL to verify formatting
   - Check that featured images loaded correctly
   - Verify internal links work
   - Test mobile responsiveness

### 6. Social Media Review (7:00 AM - Generated)
   - Check `/workspaces/hoa-social-media/posts/` for platform posts
   - **LinkedIn**: Review professional tone, length 150-200 words
   - **Twitter**: Review thread flow, each tweet <280 chars
   - **Facebook**: Review community tone, length 100-150 words
   - **If using Mixpost**: Posts queued for approval in dashboard
   - **If using direct APIs**: Posts saved as .md files, manually post or schedule

### 7. Promote Published Content
   - **Social media**: Approve queued posts or manually post
   - **LinkedIn**: Share to company page + personal profile
   - **Facebook**: Post to HOA board groups
   - **Email newsletter**: Include snippet in monthly digest
   - **Internal linking**: Add links from related older posts

---

## 🚀 Quick Start Commands

### Test Agents Manually

**1. Test Content Writer**:
```bash
wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && \
  npx openclaw agent --agent hoa-content-writer --local \
  --message 'Research HOA elevator financing options and generate SEO-optimized blog post'"
```

**2. Test Social Media Converter**:
```bash
wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && \
  npx openclaw agent --agent hoa-social-media --local \
  --message 'Convert the latest blog post to social media content for all platforms'"
```

**3. Test CMS Publisher** (after moving post to approved/):
```bash
# First, move a test post to approved
wsl.exe bash -c "cp /home/sjpilche/projects/openclaw-v1/workspaces/hoa-cms-publisher/content/drafts/example-post.md \
  /home/sjpilche/projects/openclaw-v1/workspaces/hoa-cms-publisher/content/approved/"

# Then run publisher
wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && \
  npx openclaw agent --agent hoa-cms-publisher --local \
  --message 'Publish all approved posts to Git (triggers Netlify build)'"
```

**4. Test Social Engagement Monitor**:
```bash
wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && \
  npx openclaw agent --agent hoa-social-engagement --local \
  --message 'Check social media for new engagement and draft responses for high-intent leads'"
```

**5. Test Email Campaigns**:
```bash
wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && \
  npx openclaw agent --agent hoa-email-campaigns --local \
  --message 'Generate weekly newsletter from recent blog posts and create draft email campaign'"
```

### Check Generated Content

**Content Writer posts**:
```bash
wsl.exe bash -c "ls -lah /home/sjpilche/projects/openclaw-v1/workspaces/hoa-content-writer/posts/"
```

**Social Media posts**:
```bash
wsl.exe bash -c "ls -lah /home/sjpilche/projects/openclaw-v1/workspaces/hoa-social-media/posts/"
```

**CMS Publisher logs**:
```bash
wsl.exe bash -c "cat /home/sjpilche/projects/openclaw-v1/workspaces/hoa-cms-publisher/logs/publish-log.json"
```

**Social Engagement drafts**:
```bash
wsl.exe bash -c "ls -lah /home/sjpilche/projects/openclaw-v1/workspaces/hoa-social-engagement/drafts/"
wsl.exe bash -c "cat /home/sjpilche/projects/openclaw-v1/workspaces/hoa-social-engagement/drafts/example-responses.md | head -50"
```

**Social Engagement leads**:
```bash
wsl.exe bash -c "cat /home/sjpilche/projects/openclaw-v1/workspaces/hoa-social-engagement/leads/hot-leads.json"
```

**Email Campaign sequences**:
```bash
wsl.exe bash -c "ls -lah /home/sjpilche/projects/openclaw-v1/workspaces/hoa-email-campaigns/sequences/"
```

**Email Campaign newsletters**:
```bash
wsl.exe bash -c "ls -lah /home/sjpilche/projects/openclaw-v1/workspaces/hoa-email-campaigns/newsletters/"
wsl.exe bash -c "cat /home/sjpilche/projects/openclaw-v1/workspaces/hoa-email-campaigns/newsletters/latest-newsletter.md"
```

**Email metrics**:
```bash
wsl.exe bash -c "cat /home/sjpilche/projects/openclaw-v1/workspaces/hoa-email-campaigns/metrics/weekly-metrics.json"
```

**View latest blog post**:
```bash
wsl.exe bash -c "find /home/sjpilche/projects/openclaw-v1/workspaces/hoa-content-writer/posts/ -name '*.md' -type f -exec ls -t {} + | head -1 | xargs cat | head -80"
```

**View latest social posts**:
```bash
wsl.exe bash -c "ls -t /home/sjpilche/projects/openclaw-v1/workspaces/hoa-social-media/posts/*.md | head -3 | xargs -I {} sh -c 'echo \"=== {} ===\"  && cat {} && echo'"
```

### Check Automation Status

**Check cron schedule**:
```bash
wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && npx openclaw cron list"
```

**Check all HOA agents**:
```bash
wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && npx openclaw agents list --json | jq '.[] | select(.id | startswith(\"hoa\"))'"
```

**Check OpenClaw gateway**:
```bash
wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && npx openclaw gateway status"
```

---

## 📞 Support

**Questions or issues?**

**Content Writer Agent**:
- `openclaw-skills/hoa-content-writer/README.md` - Technical documentation
- `openclaw-skills/hoa-content-writer/SKILL.md` - Usage guide
- `openclaw-skills/hoa-content-writer/SOUL.md` - Agent instructions

**Social Media Agent**:
- `openclaw-skills/hoa-social-media/README.md` - Technical documentation
- `openclaw-skills/hoa-social-media/SKILL.md` - Usage guide
- `openclaw-skills/hoa-social-media/SOUL.md` - Agent instructions

**CMS Publisher Agent**:
- `openclaw-skills/hoa-cms-publisher/README.md` - Technical documentation
- `openclaw-skills/hoa-cms-publisher/SKILL.md` - Usage guide
- `openclaw-skills/hoa-cms-publisher/SOUL.md` - Agent instructions

**Social Engagement Monitor Agent**:
- `openclaw-skills/hoa-social-engagement/README.md` - Technical documentation
- `openclaw-skills/hoa-social-engagement/SKILL.md` - Usage guide
- `openclaw-skills/hoa-social-engagement/SOUL.md` - Agent instructions

**Email Marketing Campaigns Agent**:
- `openclaw-skills/hoa-email-campaigns/SKILL.md` - Usage guide with full email copy
- `openclaw-skills/hoa-email-campaigns/SOUL.md` - Agent instructions
- `openclaw-skills/hoa-email-campaigns/TOOLS.md` - ESP integration guide (see workspace)

**Contact**: steve.j.pilcher@gmail.com

---

## 📊 Content Pipeline Summary

**Full automation flow**:
```
Mon/Wed/Fri 6:00 AM → Content Writer generates SEO blog post
              7:00 AM → Social Media converts to LinkedIn/Twitter/Facebook
         [Manual Review & Approval]
  Daily     8:00 AM → Social Engagement checks platforms for interactions
Mon/Wed/Fri 8:30 AM → CMS Publisher commits to Git, triggers Netlify build
  Daily     9:00 AM → Email Campaigns checks for re-engagement opportunities
         [2-3 min] → Netlify builds and deploys site
         [Post goes live automatically]
  Monday    9:00 AM → Weekly social engagement metrics report
  Tuesday  10:00 AM → Email Campaigns generates weekly newsletter
```

**File locations**:
- Blog posts: `/workspaces/hoa-content-writer/posts/`
- Social posts: `/workspaces/hoa-social-media/posts/`
- Approved for publish: `/workspaces/hoa-cms-publisher/content/approved/`
- Published posts: `/workspaces/hoa-cms-publisher/content/published/`
- Publish logs: `/workspaces/hoa-cms-publisher/logs/`
- Engagement drafts: `/workspaces/hoa-social-engagement/drafts/`
- Lead tracking: `/workspaces/hoa-social-engagement/leads/`
- Engagement metrics: `/workspaces/hoa-social-engagement/metrics/`
- Email sequences: `/workspaces/hoa-email-campaigns/sequences/`
- Email newsletters: `/workspaces/hoa-email-campaigns/newsletters/`
- Email metrics: `/workspaces/hoa-email-campaigns/metrics/`

---

**Last Updated**: 2026-02-13
**Pipeline Version**: 3.1
**Status**: ✅ All 5 Agents Setup Complete
**Pending**: Git repository setup, social media API credentials, ESP credentials, Telegram notifications, cron scheduling
