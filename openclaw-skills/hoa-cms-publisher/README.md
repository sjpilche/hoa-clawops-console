# HOA CMS Publisher Skill

**Automated WordPress publishing for HOA Project Funding blog posts**

---

## Quick Start

### 1. Run Setup Script

```bash
cd /home/sjpilche/projects/openclaw-v1
bash /mnt/c/Users/SPilcher/OpenClaw2.0\ for\ linux/openclaw-skills/hoa-cms-publisher/setup.sh
```

Creates:
- Agent workspace with directory structure
- SOUL.md and TOOLS.md configuration
- Example post for testing
- Log files (JSON + CSV)
- CMS configuration file

### 2. Configure WordPress Credentials

Add to `.env.local` or `~/.config/openclaw/.env`:

```bash
WORDPRESS_URL=https://www.hoaprojectfunding.com
WORDPRESS_USER=your_admin_username
WORDPRESS_APP_PASSWORD=abcd1234efgh5678ijkl9012
```

**Get Application Password**:
1. WordPress Admin → Users → Profile
2. Scroll to "Application Passwords"
3. Name: "HOA CMS Publisher"
4. Click "Add New Application Password"
5. Copy password and remove all spaces

### 3. Test WordPress Connection

```bash
curl -u "${WORDPRESS_USER}:${WORDPRESS_APP_PASSWORD}" \
  "${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=1"
```

Should return JSON with recent posts. If 401 error, check credentials.

### 4. Test Publishing

```bash
cd /home/sjpilche/projects/openclaw-v1

# Move example post to approved
cp workspaces/hoa-cms-publisher/content/drafts/example-post.md \
   workspaces/hoa-cms-publisher/content/approved/

# Trigger publish
npx openclaw agent --agent hoa-cms-publisher --local \
  --message "Publish all approved posts to WordPress as drafts"
```

Check:
```bash
# Check logs
cat workspaces/hoa-cms-publisher/logs/publish-log.json

# Check WordPress Admin → Posts → Drafts
# Should see: "5 HOA Roof Replacement Financing Options"
```

---

## What It Does

### 1. Automated Publishing Workflow

**Monitors**: `/content/approved/` directory for markdown files

**Process**:
1. Reads markdown file with YAML frontmatter
2. Converts markdown to HTML (headings, bold, links, lists)
3. Maps category names to WordPress category IDs
4. Creates or finds tags by name
5. Uploads to WordPress via REST API
6. Sets status: draft or scheduled publish
7. Logs to JSON and CSV files
8. Moves file: approved/ → published/ (success) or failed/ (error)
9. Sends Telegram confirmation

### 2. Error Handling

**Retry Logic**: 3 attempts with exponential backoff (5s, 15s, 30s)

**Handled Errors**:
- **401 Unauthorized**: Check credentials in .env.local
- **409 Conflict** (duplicate slug): Appends -2, -3, etc. and retries
- **400 Bad Request**: Logs error details, moves to failed/
- **Timeout**: Retries with longer timeout
- **5xx Server Error**: Retries (temporary server issue)
- **Invalid HTML**: Logs validation error

**Error Logs**:
- Failed post moved to `/content/failed/`
- Error details saved as `.error.log` file
- Full log in `/logs/errors.log`

### 3. Logging & Tracking

**JSON Log** (`logs/publish-log.json`):
```json
{
  "posts": [
    {
      "filename": "2026-03-15-hoa-roof-financing.md",
      "title": "5 HOA Roof Replacement Financing Options",
      "slug": "hoa-roof-replacement-financing-options",
      "cms_id": 1234,
      "cms_url": "https://www.hoaprojectfunding.com/blog/hoa-roof-replacement-financing-options/",
      "status": "draft",
      "category": "Capital Improvements",
      "tags": ["HOA financing", "roof replacement"],
      "published_at": "2026-03-15T08:30:00-05:00",
      "processed_at": "2026-03-15T08:31:45-05:00",
      "agent_session": "abcd1234",
      "success": true
    }
  ]
}
```

**CSV Log** (`logs/publish-log.csv`):
```csv
Date,Filename,Title,Slug,Status,CMS_URL,Published_At,Agent_Session,Success
2026-03-15,2026-03-15-hoa-roof-financing.md,5 HOA Roof Replacement Financing Options,hoa-roof-replacement-financing-options,draft,https://www.hoaprojectfunding.com/blog/...,2026-03-15T08:30:00-05:00,abcd1234,true
```

### 4. Frontmatter Format

Required YAML frontmatter in markdown files:

```yaml
---
title: "5 HOA Roof Replacement Financing Options"
slug: "hoa-roof-replacement-financing-options"
date: "2026-03-15T09:00:00"
keywords:
  - "HOA roof replacement financing"
  - "HOA roof loan"
  - "avoid special assessments"
meta_title: "HOA Roof Financing: 5 Alternatives to Special Assessments"
meta_description: "Discover 5 proven financing options for HOA roof replacement that avoid special assessments. Compare rates, terms, and approval requirements."
category: "Capital Improvements"
internal_links:
  - "/services/reserve-fund-loans"
  - "/services/capital-improvement-financing"
status: "draft"
---

# Markdown content here...
```

**Fields**:
- `title` - Post title (H1 is generated from this)
- `slug` - URL slug (lowercase, hyphens)
- `date` - Publish date/time (ISO format)
- `keywords` - SEO keywords (becomes tags)
- `meta_title` - SEO title (50-60 chars)
- `meta_description` - SEO description (140-160 chars)
- `category` - Category name (must match WordPress categories)
- `internal_links` - Links to add in content
- `status` - "draft" or "scheduled" (optional, defaults to "draft")

---

## Usage Examples

### Example 1: Publish Single Post

```bash
# 1. Create or move post to approved
cp /path/to/my-post.md workspaces/hoa-cms-publisher/content/approved/

# 2. Trigger publish
npx openclaw agent --agent hoa-cms-publisher --local \
  --message "Publish the post about HOA elevator financing"

# 3. Check WordPress Admin
# Should see new draft post
```

### Example 2: Publish Multiple Posts

```bash
# Move multiple posts to approved
cp workspaces/hoa-content-writer/posts/2026-03-*.md \
   workspaces/hoa-cms-publisher/content/approved/

# Publish all
npx openclaw agent --agent hoa-cms-publisher --local \
  --message "Publish all approved posts to WordPress"
```

### Example 3: Schedule Future Publish

In frontmatter, set future date:
```yaml
date: "2026-04-01T09:00:00"
status: "scheduled"
```

The agent will upload and WordPress will auto-publish at that time.

### Example 4: Retry Failed Post

```bash
# Check failed posts
ls workspaces/hoa-cms-publisher/content/failed/

# View error log
cat workspaces/hoa-cms-publisher/content/failed/my-post.md.error.log

# Fix issue (e.g., edit post, fix credentials), then move back
mv workspaces/hoa-cms-publisher/content/failed/my-post.md \
   workspaces/hoa-cms-publisher/content/approved/

# Retry publish
npx openclaw agent --agent hoa-cms-publisher --local \
  --message "Retry publishing failed posts"
```

---

## Automation Setup

### Daily Publishing (Recommended)

Publish approved posts every morning at 8:30 AM EST:

```bash
npx openclaw cron add \
  --agent hoa-cms-publisher \
  --cron "30 8 * * *" \
  --message "Check approved directory and publish all posts to WordPress as drafts" \
  --tz "America/New_York" \
  --name "HOA CMS - Daily Publish"
```

### Weekly Publishing (Mon/Wed/Fri)

Sync with content writer schedule:

```bash
npx openclaw cron add \
  --agent hoa-cms-publisher \
  --cron "30 8 * * 1,3,5" \
  --message "Publish approved posts to WordPress" \
  --tz "America/New_York" \
  --name "HOA CMS - Mon/Wed/Fri"
```

---

## Configuration

### CMS Config File

Located at: `workspaces/hoa-cms-publisher/config/cms-config.json`

```json
{
  "cms_type": "wordpress",
  "wordpress": {
    "default_status": "draft",
    "default_category_id": 12,
    "category_mapping": {
      "Capital Improvements": 12,
      "Reserve Funds": 13,
      "Board Resources": 14,
      "Case Studies": 15
    },
    "auto_create_tags": true,
    "schedule_time": "09:00:00",
    "timezone": "America/New_York"
  },
  "retry": {
    "max_attempts": 3,
    "delays": [5, 15, 30]
  },
  "notifications": {
    "on_success": true,
    "on_failure": true,
    "channel": "telegram"
  }
}
```

**To get category IDs**:
```bash
curl -u "${WORDPRESS_USER}:${WORDPRESS_APP_PASSWORD}" \
  "${WORDPRESS_URL}/wp-json/wp/v2/categories"
```

Update `category_mapping` with your actual category IDs.

### Alternative CMS Platforms

#### Webflow

Set `cms_type` to `"webflow"` and add:
```bash
WEBFLOW_API_TOKEN=your_token
WEBFLOW_SITE_ID=your_site_id
WEBFLOW_COLLECTION_ID=your_collection_id
```

#### Ghost

Set `cms_type` to `"ghost"` and add:
```bash
GHOST_URL=https://your-site.ghost.io
GHOST_ADMIN_API_KEY=your_key
```

See `TOOLS.md` for detailed API setup instructions.

---

## Directory Structure

```
workspaces/hoa-cms-publisher/
├── SOUL.md                    ← Agent instructions
├── TOOLS.md                   ← Tool usage examples
├── content/
│   ├── README.md             ← Directory guide
│   ├── approved/             ← Ready to publish (monitored)
│   ├── published/            ← Successfully published
│   ├── failed/               ← Failed uploads (with .error.log)
│   └── drafts/               ← Optional staging area
├── logs/
│   ├── publish-log.json      ← Structured log (for parsing)
│   ├── publish-log.csv       ← Spreadsheet log (for Excel/Sheets)
│   └── errors.log            ← Error details
└── config/
    └── cms-config.json       ← CMS settings
```

---

## Integration with Content Pipeline

This skill is the final step in the HOA content automation pipeline:

```
6:00 AM → hoa-content-writer generates SEO blog post
          ↓ saves to /workspaces/hoa-content-writer/posts/

7:00 AM → hoa-social-media converts to social posts
          ↓ saves to /workspaces/hoa-social-media/posts/

[Manual Review & Approval]
          ↓ user moves approved post to:
          ↓ /workspaces/hoa-cms-publisher/content/approved/

8:30 AM → hoa-cms-publisher detects and publishes
          ↓ uploads to WordPress as draft
          ↓ moves to /published/ directory
          ↓ sends Telegram confirmation

[WordPress Review]
          ↓ add featured image
          ↓ verify formatting

9:00 AM → Publish live (manual or scheduled)
```

---

## Troubleshooting

### Posts not uploading

**Issue**: Agent runs but posts stay in approved/

**Check**:
```bash
# 1. Verify WordPress connection
curl -u "${WORDPRESS_USER}:${WORDPRESS_APP_PASSWORD}" \
  "${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=1"

# 2. Check error logs
cat workspaces/hoa-cms-publisher/logs/errors.log

# 3. Check failed directory
ls -la workspaces/hoa-cms-publisher/content/failed/
cat workspaces/hoa-cms-publisher/content/failed/*.error.log
```

**Common fixes**:
- 401 error: Wrong username or app password in .env.local
- 404 error: Wrong WordPress URL or REST API disabled
- Timeout: Increase timeout in config or check WordPress server

### Duplicate slug errors (409)

**Issue**: "Post with slug already exists"

**Fix**: Agent auto-retries with `-2`, `-3` appended. But if this fails:
```bash
# Change slug in frontmatter
slug: "hoa-roof-financing-options-2026"

# Or delete the existing draft post in WordPress
```

### HTML formatting issues

**Issue**: Post appears but formatting is broken

**Check**:
- Ensure markdown is valid (test with online markdown viewer)
- Check for special characters in content (", ', &, <, >)
- View raw HTML in `/logs/errors.log`

**Fix**:
- Use proper markdown syntax (no HTML tags unless necessary)
- Escape special characters or use WordPress editor to clean up

### Categories not mapping correctly

**Issue**: Post has wrong category or "Uncategorized"

**Check**:
```bash
# Get category IDs
curl -u "${WORDPRESS_USER}:${WORDPRESS_APP_PASSWORD}" \
  "${WORDPRESS_URL}/wp-json/wp/v2/categories"
```

**Fix**: Update `config/cms-config.json` → `category_mapping` with correct IDs

### Tags not being created

**Issue**: Keywords in frontmatter not appearing as tags

**Check**: `auto_create_tags: true` in `config/cms-config.json`

**Fix**:
- If false, agent won't create tags (only uses existing)
- If true but still not working, check WordPress permissions (user must be able to create tags)

---

## Performance Metrics

Track success via logs:

**Publishing Rate**:
```bash
# Count successful publishes
jq '.posts | map(select(.success == true)) | length' workspaces/hoa-cms-publisher/logs/publish-log.json
```

**Error Rate**:
```bash
# Count failed publishes
ls workspaces/hoa-cms-publisher/content/failed/*.error.log | wc -l
```

**Average Processing Time**:
```bash
# View processing times
jq '.posts[] | {title: .title, time: .processing_time}' workspaces/hoa-cms-publisher/logs/publish-log.json
```

---

## Next Steps

1. **Run Setup**: Execute `setup.sh` to create workspace ✅ DONE
2. **Configure WordPress**: Add credentials to .env.local
3. **Test Connection**: Verify REST API access
4. **Test Publish**: Upload example post
5. **Schedule Automation**: Set up daily/weekly cron
6. **Monitor Logs**: Track success/failure rates

---

**Created for**: HOA Project Funding (www.hoaprojectfunding.com)
**Agent ID**: `hoa-cms-publisher`
**Workspace**: `/workspaces/hoa-cms-publisher`
**Integration**: Works with `hoa-content-writer` and `hoa-social-media`
