#!/bin/bash
# Setup script for HOA CMS Publisher skill

set -e

WORKSPACE_DIR="/home/sjpilche/projects/openclaw-v1/workspaces/hoa-cms-publisher"
AGENT_ID="hoa-cms-publisher"

echo "🏗️  Setting up HOA CMS Publisher skill..."
echo ""

# 1. Create workspace directory structure
echo "📁 Creating workspace directories..."
mkdir -p "$WORKSPACE_DIR/content/approved"
mkdir -p "$WORKSPACE_DIR/content/published"
mkdir -p "$WORKSPACE_DIR/content/failed"
mkdir -p "$WORKSPACE_DIR/content/drafts"
mkdir -p "$WORKSPACE_DIR/logs"
mkdir -p "$WORKSPACE_DIR/config"
cd "$WORKSPACE_DIR"

# 2. Copy SOUL.md
echo "📝 Creating SOUL.md..."
if [ -f "/mnt/c/Users/SPilcher/OpenClaw2.0 for linux/openclaw-skills/hoa-cms-publisher/SOUL.md" ]; then
  cp "/mnt/c/Users/SPilcher/OpenClaw2.0 for linux/openclaw-skills/hoa-cms-publisher/SOUL.md" SOUL.md
else
  echo "⚠️  SOUL.md not found at expected location"
fi

# 3. Create TOOLS.md
echo "🔧 Creating TOOLS.md..."
cat > TOOLS.md << 'ENDTOOLS'
# TOOLS.md - HOA CMS Publisher

## WordPress API

### Authentication
WordPress uses Application Passwords for REST API auth (Basic Auth over HTTPS).

**Required env variables**:
- `WORDPRESS_URL` - Site URL (https://www.hoaprojectfunding.com)
- `WORDPRESS_USER` - Admin username
- `WORDPRESS_APP_PASSWORD` - Application password (no spaces)

### Create Post

```bash
curl -X POST "${WORDPRESS_URL}/wp-json/wp/v2/posts" \
  -u "${WORDPRESS_USER}:${WORDPRESS_APP_PASSWORD}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Post Title",
    "content": "<p>HTML content</p>",
    "slug": "post-slug",
    "status": "draft",
    "date": "2026-03-15T09:00:00",
    "categories": [12],
    "tags": [45, 67],
    "meta": {
      "description": "Meta description",
      "_yoast_wpseo_title": "SEO title (if Yoast installed)",
      "_yoast_wpseo_metadesc": "SEO description"
    }
  }'
```

**Response (201)**:
```json
{
  "id": 1234,
  "link": "https://www.hoaprojectfunding.com/blog/post-slug/",
  "status": "draft",
  "title": {"rendered": "Post Title"},
  "slug": "post-slug"
}
```

### Get Categories

```bash
curl "${WORDPRESS_URL}/wp-json/wp/v2/categories" \
  -u "${WORDPRESS_USER}:${WORDPRESS_APP_PASSWORD}"
```

### Create/Get Tags

```bash
# Create tag
curl -X POST "${WORDPRESS_URL}/wp-json/wp/v2/tags" \
  -u "${WORDPRESS_USER}:${WORDPRESS_APP_PASSWORD}" \
  -H "Content-Type: application/json" \
  -d '{"name": "HOA financing"}'

# Search tag
curl "${WORDPRESS_URL}/wp-json/wp/v2/tags?search=HOA+financing" \
  -u "${WORDPRESS_USER}:${WORDPRESS_APP_PASSWORD}"
```

## Webflow API (Alternative)

**Required env variables**:
- `WEBFLOW_API_TOKEN`
- `WEBFLOW_SITE_ID`
- `WEBFLOW_COLLECTION_ID`

**Create item**:
```bash
curl -X POST "https://api.webflow.com/collections/${WEBFLOW_COLLECTION_ID}/items" \
  -H "Authorization: Bearer ${WEBFLOW_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "name": "Post Title",
      "slug": "post-slug",
      "post-body": "<p>HTML content</p>",
      "_draft": false
    }
  }'
```

## Ghost API (Alternative)

**Required env variables**:
- `GHOST_URL`
- `GHOST_ADMIN_API_KEY`

**Create post**:
```bash
# Ghost uses JWT tokens, more complex
# Recommend using ghost CLI or library
```

## Markdown to HTML Conversion

**Simple conversion** (for basic formatting):
```bash
# Replace markdown patterns with HTML
sed 's/^# \(.*\)/<h1>\1<\/h1>/'
sed 's/^## \(.*\)/<h2>\1<\/h2>/'
sed 's/\*\*\([^*]*\)\*\*/<strong>\1<\/strong>/g'
sed 's/\*\([^*]*\)\*/<em>\1<\/em>/g'
```

**Better: Use pandoc** (if installed):
```bash
echo "Markdown content" | pandoc -f markdown -t html
```

## File Operations

**Read approved content**:
```bash
ls content/approved/
```

**Move to published**:
```bash
mv content/approved/[file].md content/published/
```

**Move to failed**:
```bash
mv content/approved/[file].md content/failed/
```

**Create error log**:
```bash
echo "Error message" > content/failed/[file].error.log
```

## Logging

**Append to JSON log**:
```bash
# Read existing log
cat logs/publish-log.json

# Parse with jq (if available)
jq '.posts += [{"title": "New Post", "status": "published"}]' logs/publish-log.json

# Write back
```

**Append to CSV log**:
```bash
echo "2026-03-15,filename.md,Title,slug,published,url,timestamp" >> logs/publish-log.csv
```

## Notification Commands

**Telegram**:
```bash
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  -d "text=✅ Published: Post Title" \
  -d "parse_mode=Markdown"
```

**WhatsApp** (if wacli installed):
```bash
wacli send "${WHATSAPP_PHONE}" "✅ Published: Post Title"
```

## Error Handling

**Retry with exponential backoff**:
```bash
for i in 1 2 3; do
  # Attempt upload
  if curl [upload command]; then
    break  # Success
  else
    sleep $((i * 5))  # Wait 5s, 10s, 15s
  fi
done
```

**Check HTTP status**:
```bash
STATUS=$(curl -w "%{http_code}" -s -o response.json [url])
if [ "$STATUS" -eq 201 ]; then
  echo "Success"
elif [ "$STATUS" -eq 401 ]; then
  echo "Authentication failed"
fi
```
ENDTOOLS

# 4. Create CMS config file
echo "⚙️  Creating CMS configuration..."
cat > config/cms-config.json << 'ENDCONFIG'
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
ENDCONFIG

# 5. Initialize log files
echo "📋 Creating log files..."
cat > logs/publish-log.json << 'ENDJSON'
{
  "posts": []
}
ENDJSON

cat > logs/publish-log.csv << 'ENDCSV'
Date,Filename,Title,Slug,Status,CMS_URL,Published_At,Agent_Session,Success
ENDCSV

touch logs/errors.log

# 6. Create README in content directory
echo "📄 Creating content directory README..."
cat > content/README.md << 'ENDREADME'
# Content Directory Structure

## approved/
Place approved blog posts here to trigger publishing.

Files must be in markdown format with YAML frontmatter:
```yaml
---
title: "Post Title"
slug: "post-slug"
date: "2026-03-15"
keywords:
  - "keyword 1"
  - "keyword 2"
meta_title: "SEO Title"
meta_description: "SEO description 140-160 chars"
category: "Capital Improvements"
---

# Post Content Here
```

## published/
Successfully published posts are moved here.

## failed/
Failed uploads are moved here with .error.log file.

## drafts/
Optional staging area for posts not yet ready to approve.
ENDREADME

# 7. Create example approved post
echo "📝 Creating example post..."
cat > content/drafts/example-post.md << 'ENDEXAMPLE'
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

# 5 HOA Roof Replacement Financing Options

Replacing a roof is one of the largest capital expenses an HOA will face. Many boards default to special assessments, but there are better alternatives that protect homeowners from surprise bills.

## Understanding HOA Roof Financing

HOA roof projects typically cost $200,000-$500,000+ depending on community size. Traditional special assessments can burden residents with $5,000-$10,000+ bills, creating financial hardship and board tension.

## Option 1: Reserve Fund Loans

Borrow against your existing reserves without depleting them. Ideal for associations with healthy reserve balances.

**Pros**: Fast approval, competitive rates, preserves cash flow
**Cons**: Requires adequate reserves as collateral

## Option 2: Assessment-Backed Bonds

Spread costs over 10-15 years through municipal-style bonds backed by future assessments.

**Pros**: Long terms, predictable payments, no upfront cost to homeowners
**Cons**: Longer approval process, bond issuance fees

## Option 3: HOA Lines of Credit

Flexible financing for phased projects. Draw funds as needed.

**Pros**: Only pay interest on what you use, perfect for multi-phase work
**Cons**: Variable rates, renewal requirements

## Option 4: Manufacturer Financing

Some roofing companies offer financing bundled with installation.

**Pros**: One-stop solution, competitive terms
**Cons**: Limited to specific contractors

## Option 5: Government Assistance Programs

Low-interest loans or grants for energy-efficient roofing upgrades.

**Pros**: Lowest rates, possible forgiveness
**Cons**: Strict eligibility, longer timelines

## Choosing the Right Option

Consider your HOA's:
- Reserve fund balance
- Monthly assessment capacity
- Project timeline
- Board approval process

## Getting Started

HOA Project Funding specializes in helping associations navigate these options. Contact us for a free consultation to determine the best financing solution for your community.
ENDEXAMPLE

# 8. Register agent with OpenClaw
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
echo "1. Configure WordPress credentials in .env.local:"
echo "   WORDPRESS_URL=https://www.hoaprojectfunding.com"
echo "   WORDPRESS_USER=your_username"
echo "   WORDPRESS_APP_PASSWORD=abcd1234efgh5678"
echo ""
echo "2. Get WordPress Application Password:"
echo "   - WordPress Admin → Users → Profile → Application Passwords"
echo "   - Name: 'HOA CMS Publisher'"
echo "   - Copy password (remove spaces)"
echo ""
echo "3. Test WordPress connection:"
echo "   curl -u \"\${WORDPRESS_USER}:\${WORDPRESS_APP_PASSWORD}\" \\"
echo "     \"\${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=1\""
echo ""
echo "4. Move example post to approved and test publish:"
echo "   cp $WORKSPACE_DIR/content/drafts/example-post.md \\"
echo "      $WORKSPACE_DIR/content/approved/"
echo "   npx openclaw agent --agent $AGENT_ID --local \\"
echo "     --message 'Publish all approved posts as drafts'"
echo ""
echo "5. Set up automated publishing cron:"
echo "   npx openclaw cron add \\"
echo "     --agent $AGENT_ID \\"
echo "     --cron '30 8 * * 1,3,5' \\"
echo "     --message 'Publish all approved posts to WordPress' \\"
echo "     --tz 'America/New_York'"
echo ""
echo "Workspace: $WORKSPACE_DIR"
echo "Config: $WORKSPACE_DIR/config/cms-config.json"
echo "Logs: $WORKSPACE_DIR/logs/"
