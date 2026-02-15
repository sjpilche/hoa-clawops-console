# HOA CMS Publisher Skill

Automated blog post publishing to www.hoaprojectfunding.com via Git + Netlify.

## Overview

This skill takes approved blog post markdown files and publishes them to your Netlify-hosted website via Git commits, completing the content automation pipeline from generation → social media → live website.

## What It Does

### 1. Watches for Approved Content
Monitors `/content/approved/` directory for markdown files ready to publish

### 2. Validates & Commits
- Validates markdown formatting and frontmatter
- Copies to Git repository content directory
- Commits with descriptive message
- Pushes to remote to trigger Netlify build

### 3. Publishing Flow
- **Git commit**: File added to repo content directory
- **Auto-deploy**: Netlify detects push and rebuilds site
- **Live in ~2-3 min**: New post appears on site after build completes

### 4. Confirmation & Logging
- Sends confirmation message (Telegram/WhatsApp)
- Logs to tracking file (JSON + CSV)
- Moves processed file to `/content/published/`

### 5. Error Handling
- Retry logic (3 attempts with exponential backoff)
- Detailed error messages
- Failed uploads moved to `/content/failed/` with error log

## Deployment Platform

### Netlify (Git-based)
- **Method**: Git commit + push to remote repository
- **Auth**: SSH keys or Git credentials (pre-configured)
- **Build**: Netlify auto-detects changes and rebuilds site
- **Deploy time**: ~2-3 minutes from push to live
- **Features**: Automatic builds, deploy previews, rollbacks

### Compatible Static Site Generators
Works with any SSG that Netlify supports:
- **Astro** (recommended for performance)
- **Next.js** (React-based)
- **Hugo** (Go-based, very fast)
- **Eleventy** (Node-based, flexible)
- **Gatsby** (React-based, GraphQL)

## How to Use

### Approve & Publish Single Post

```bash
# Move post to approved directory
cp workspaces/hoa-content-writer/posts/2026-03-15-hoa-roof-financing.md \
   workspaces/hoa-cms-publisher/content/approved/

# Trigger publish
openclaw agent --agent hoa-cms-publisher --local \
  --message "Publish all approved posts to WordPress as drafts"
```

### Publish with Schedule

```bash
openclaw agent --agent hoa-cms-publisher --local \
  --message "Publish post '2026-03-15-hoa-roof-financing.md' scheduled for March 15, 2026 at 9:00 AM EST"
```

### Batch Publish

```bash
openclaw agent --agent hoa-cms-publisher --local \
  --message "Publish all approved posts from this week, scheduled M/W/F at 9am"
```

### Check Status

```bash
openclaw agent --agent hoa-cms-publisher --local \
  --message "Check status of recently published posts and show the publish log"
```

## Workflow Integration

### Manual Approval Flow

```
1. Blog post generated → workspaces/hoa-content-writer/posts/
2. Review & approve → Move to workspaces/hoa-cms-publisher/content/approved/
3. Auto-publish → Agent detects new file and publishes
4. Confirmation → Telegram notification + moved to /published/
```

### Automated Approval Flow (with approval command)

```
1. Blog generated → hoa-content-writer creates draft
2. Social content created → hoa-social-media queues posts
3. Approve command → Message agent: "approve post YYYY-MM-DD-slug"
4. Auto-publish → Moves to approved/ and publishes
5. Confirmation → All platforms notified
```

### Scheduled Batch Publish

```bash
# Runs Monday/Wednesday/Friday at 8:30 AM
# Publishes any approved content for that day
openclaw cron add \
  --agent hoa-cms-publisher \
  --cron "30 8 * * 1,3,5" \
  --message "Publish today's approved posts to WordPress" \
  --tz "America/New_York" \
  --name "HOA CMS - Publish Approved"
```

## Directory Structure

```
workspaces/hoa-cms-publisher/
├── content/
│   ├── approved/          ← Ready to publish
│   ├── published/         ← Successfully published
│   ├── failed/            ← Failed uploads (with .error.log)
│   └── drafts/            ← Optional staging area
├── logs/
│   ├── publish-log.json   ← Structured log (JSON)
│   ├── publish-log.csv    ← Spreadsheet-compatible log
│   └── errors.log         ← Error details
└── config/
    └── cms-config.json    ← CMS settings (API URL, default category, etc)
```

## Publish Log Format

### JSON Log (`publish-log.json`)
```json
{
  "posts": [
    {
      "filename": "2026-03-15-hoa-roof-financing.md",
      "title": "5 HOA Roof Replacement Financing Options",
      "slug": "hoa-roof-replacement-financing",
      "published_at": "2026-03-15T09:00:00-05:00",
      "git_commit": "def5678a1b2c3d4e5f6789012345678",
      "site_url": "https://hoaprojectfunding.com/blog/hoa-roof-replacement-financing/",
      "status": "published",
      "category": "Capital Improvements",
      "tags": ["HOA financing", "roof replacement"],
      "processed_at": "2026-03-15T08:35:22-05:00",
      "netlify_deploy": "completed",
      "agent_session": "cms-pub-12345"
    }
  ]
}
```

### CSV Log (`publish-log.csv`)
```csv
Date,Filename,Title,Slug,Status,Site_URL,Published_At,Git_Commit
2026-03-15,2026-03-15-hoa-roof-financing.md,5 HOA Roof Replacement Financing Options,hoa-roof-replacement-financing,published,https://hoaprojectfunding.com/blog/...,2026-03-15T09:00:00,def5678
```

## Configuration

### Git Repository Setup

1. **Clone your Netlify site repo** (if not already cloned):
   ```bash
   cd /home/sjpilche/projects/
   git clone git@github.com:YOUR-USERNAME/hoaprojectfunding-site.git
   ```

2. **Configure Git SSH keys** (if not already done):
   ```bash
   # Generate SSH key (if needed)
   ssh-keygen -t ed25519 -C "your_email@example.com"

   # Add to GitHub
   cat ~/.ssh/id_ed25519.pub
   # Copy output and add to GitHub → Settings → SSH Keys

   # Test connection
   ssh -T git@github.com
   # Should see: "Hi username! You've successfully authenticated..."
   ```

3. **Add to `.env.local`**:
   ```bash
   # Git Repository Path
   CONTENT_REPO_PATH=/home/sjpilche/projects/hoaprojectfunding-site

   # Notifications
   TELEGRAM_BOT_TOKEN=123456789:ABC...
   TELEGRAM_CHAT_ID=123456789
   ```

4. **Test Git access**:
   ```bash
   cd $CONTENT_REPO_PATH
   git status
   git pull origin main
   # Should work without password prompt
   ```

### Netlify Site Setup

1. **Connect repo to Netlify**:
   - Netlify dashboard → New site from Git
   - Select your GitHub/GitLab repo
   - Configure build settings (Netlify auto-detects most SSGs)

2. **Set build command** (examples):
   ```bash
   # Astro
   npm run build

   # Next.js
   npm run build

   # Hugo
   hugo
   ```

3. **Set publish directory** (examples):
   - Astro: `dist/`
   - Next.js: `.next/`
   - Hugo: `public/`

4. **Note your site name**: e.g., `hoaprojectfunding.netlify.app`

## Publishing Process

### Step 1: Read Approved File
```bash
read "workspaces/hoa-cms-publisher/content/approved/2026-03-15-post.md"
```

### Step 2: Validate Frontmatter
Extract and validate:
- `title`, `slug`, `meta_title`, `meta_description`
- `category`, `keywords` (→ tags)
- `date`, `status`
- `internal_links`

Ensure all required fields present and properly formatted.

### Step 3: Copy to Git Content Directory
```bash
# Copy markdown file to site's content directory
cp workspaces/hoa-cms-publisher/content/approved/2026-03-15-post.md \
   $CONTENT_REPO_PATH/content/blog/2026-03-15-post.md
```

### Step 4: Commit & Push to Git

```bash
cd $CONTENT_REPO_PATH

# Stage the new post
git add content/blog/2026-03-15-post.md

# Commit with descriptive message
git commit -m "Publish: 5 HOA Roof Replacement Financing Options

Auto-published by hoa-cms-publisher agent
Date: 2026-03-15T08:35:22-05:00
Slug: hoa-roof-replacement-financing
Category: Capital Improvements"

# Push to remote (triggers Netlify build)
git push origin main
```

### Step 5: Handle Response
- **Success (exit 0)**: Log to publish-log.json, move to /published/
- **Error (non-zero)**: Retry up to 3 times, then move to /failed/

### Step 6: Send Confirmation
```bash
# Telegram
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  -d "text=✅ Published to Git: 5 HOA Roof Replacement Financing Options

URL: https://hoaprojectfunding.com/blog/hoa-roof-replacement-financing/
Git commit: def5678
Status: Netlify deploying (~2-3 min)

Check: https://app.netlify.com/sites/hoaprojectfunding/deploys"
```

## Error Handling

### Retry Logic
```
Attempt 1: Immediate
  ↓ (fail)
Attempt 2: Wait 5 seconds
  ↓ (fail)
Attempt 3: Wait 15 seconds
  ↓ (fail)
Move to /failed/ with error log
```

### Common Errors & Solutions

**Git authentication failed**:
- Check SSH keys: `ssh -T git@github.com`
- Verify Git remote uses SSH not HTTPS

**Push rejected (merge conflict)**:
- Agent auto-pulls and rebases
- If conflicts persist, reports for manual resolution

**Duplicate filename**:
- Agent appends timestamp: `[slug]-[timestamp].md`
- Logs warning in publish log

**Network timeout**:
- Retries automatically with exponential backoff
- Falls back to /failed/ after 3 attempts

**Invalid frontmatter**:
- Validates YAML before commit
- Attempts auto-fix for common issues
- Reports detailed error if can't fix

## Integration with Content Pipeline

### Full Automation Flow

```
Mon/Wed/Fri 6:00 AM
↓
hoa-content-writer generates blog post
  → saves to workspaces/hoa-content-writer/posts/
↓
7:00 AM
↓
hoa-social-media converts to social content
  → saves to workspaces/hoa-social-media/posts/
↓
[Manual Review & Approval]
↓
User moves approved post:
  cp posts/2026-03-15-post.md → hoa-cms-publisher/content/approved/
↓
8:30 AM (or on-demand)
↓
hoa-cms-publisher detects new file
  → validates markdown & frontmatter
  → copies to Git repo content/blog/
  → commits with descriptive message
  → pushes to GitHub/GitLab
  → sends confirmation
  → logs to publish-log.json
↓
~2-3 minutes
↓
Netlify detects Git push
  → auto-builds site
  → deploys to CDN
  → post goes live
```

### Approval Shortcut Command

Instead of manually moving files, use approval command:

```bash
openclaw agent --agent hoa-cms-publisher --local \
  --message "approve post 2026-03-15-hoa-roof-financing from hoa-content-writer and publish as draft"
```

This will:
1. Copy from `hoa-content-writer/posts/` → `hoa-cms-publisher/content/approved/`
2. Immediately process and publish
3. Send confirmation

## Monitoring & Analytics

### Check Recent Publishes
```bash
openclaw agent --agent hoa-cms-publisher --local \
  --message "Show me the last 10 published posts with their URLs and status"
```

### Audit Failed Uploads
```bash
openclaw agent --agent hoa-cms-publisher --local \
  --message "Check the failed directory and tell me what went wrong with each post"
```

### Export Publish Log
```bash
# CSV already available at:
workspaces/hoa-cms-publisher/logs/publish-log.csv

# Open in Excel or Google Sheets for analysis
```

## Advanced Features

### Custom Categories & Slugs

Map blog categories in `cms-config.json`:

```json
{
  "netlify-git": {
    "category_mapping": {
      "Capital Improvements": "capital-improvements",
      "Reserve Funds": "reserve-funds",
      "Board Resources": "board-resources"
    },
    "default_category": "uncategorized"
  }
}
```

### Git Commit Customization

Customize commit messages in `cms-config.json`:

```json
{
  "commit_message_template": "Publish: {title}\n\nCategory: {category}\nKeywords: {keywords}",
  "commit_author": "HOA Content Bot <bot@hoaprojectfunding.com>"
}
```

### Deploy Notifications (Optional)

Monitor Netlify deploys via webhook:

```bash
# Set Netlify webhook URL for deploy notifications
NETLIFY_BUILD_HOOK=https://api.netlify.com/build_hooks/YOUR_HOOK_ID
```

Agent can optionally trigger manual rebuilds or check deploy status via Netlify API.

---

**Created for**: HOA Project Funding (www.hoaprojectfunding.com)
**Agent ID**: `hoa-cms-publisher`
**Workspace**: `/workspaces/hoa-cms-publisher`
**CMS Support**: WordPress (primary), Webflow, Ghost, Custom
