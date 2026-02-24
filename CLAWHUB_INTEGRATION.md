# ClawHub Skills Integration Guide

## Installed Skills (As of Feb 20, 2026)

### ✅ Postiz (Multi-Platform Social Posting)
- **Status**: INSTALLED
- **Location**: `~/.openclaw/extensions/skills/postiz/`
- **Platforms**: Facebook, LinkedIn, Twitter/X, Instagram, TikTok, YouTube, Threads, Bluesky, Mastodon, Reddit, Discord, Slack, Pinterest, Dribbble
- **API Setup**: Add to `.env.local`:
  ```
  POSTIZ_API_KEY=<your-api-key>
  POSTIZ_API_URL=https://api.postiz.com/api
  ```
- **Get API Key**: https://postiz.com/dashboard/integrations
- **Console Integration**: Automatically used by `/api/content-queue/publish` endpoint
- **Cost**: Free tier available (50 posts/month); Pro $29/month for unlimited

---

## Skills to Install (Priority Order)

### Priority 1: Token Compression & Memory

#### QMD (Token Compression)
```bash
cd ~/.openclaw/extensions
npx clawhub install qmd
```
- **What it does**: Recursive prompt compression — reduces context tokens by 95%+
- **Cost Impact**: $0.30 → $0.015 per run (20x savings)
- **Integration**: Automatic via OpenClaw; no code changes needed
- **Setup Time**: 2 minutes

---

### Priority 2: Email & Outreach

#### MachFive Cold Email
```bash
npx clawhub install "machfive-cold-email"
```
- **What it does**: AI cold email sequences targeting ERP/CFO/contractors
- **Platforms**: Vista, Sage, QuickBooks, QBE
- **Setup**: Add to `.env.local`:
  ```
  MACHFIVE_API_KEY=<from-machfive.ai>
  MACHFIVE_WORKSPACE_ID=<your-workspace>
  ```
- **Cost**: $0.10/email sent
- **Use Case**: CFO outreach-agent will auto-generate and queue emails

#### AgentMail
```bash
npx clawhub install "agentmail"
```
- **What it does**: Email delivery with open/click tracking, A/B testing
- **Setup**:
  ```
  AGENTMAIL_API_KEY=<from-agentmail.com>
  ```
- **Cost**: Free for first 1,000 emails/month
- **Use Case**: Track CFO email campaign performance

#### Resend
```bash
npx clawhub install "resend"
```
- **What it does**: Transactional email API (Sendgrid alternative, simpler)
- **Setup**:
  ```
  RESEND_API_KEY=<from-resend.com>
  ```
- **Cost**: Free for first 100 emails/month
- **Use Case**: Send confirmation emails, alerts, digests

---

### Priority 3: Content & Analytics

#### Marketing Mode (23 frameworks)
```bash
npx clawhub install "marketing-mode"
```
- **What it does**: Access to 23 battle-tested marketing frameworks (AIDA, PAS, MAPP, etc.)
- **Setup**: Free, built-in
- **Cost**: $0 (local framework library)
- **Use Case**: HOA content writer uses frameworks for blog structure

#### GA4 Analytics
```bash
npx clawhub install "ga4-analytics"
```
- **What it does**: Query Google Analytics 4 for marketing metrics
- **Setup**:
  ```
  GA4_PROPERTY_ID=<from-google.com>
  GOOGLE_OAUTH_TOKEN=<json-key-from-service-account>
  ```
- **Cost**: $0 (if using free GA4)
- **Use Case**: CFO analytics monitor tracks CFO marketing campaign performance

---

### Priority 4: Web Scraping

#### Firecrawl
```bash
npx clawhub install "firecrawl"
```
- **What it does**: High-fidelity web scraping (LLM-optimized output)
- **Setup**:
  ```
  FIRECRAWL_API_KEY=<from-firecrawl.dev>
  ```
- **Cost**: $50/month for 10k requests
- **Use Case**: mgmt-portfolio-scraper, google-reviews-monitor

#### Apify (Optional)
```bash
npx clawhub install "apify"
```
- **What it does**: Lead generation scraping at scale (30+ templates)
- **Setup**:
  ```
  APIFY_API_TOKEN=<from-apify.com>
  ```
- **Cost**: Free tier (20 actor runs/month)
- **Use Case**: Alternative to Google Maps discovery for lead gen

---

### Priority 5: CRM & Data Integration

#### HubSpot
```bash
npx clawhub install "hubspot"
```
- **What it does**: Sync leads, contacts, companies; trigger workflows
- **Setup**:
  ```
  HUBSPOT_API_KEY=<from-hubspot.com/settings/api>
  HUBSPOT_PORTAL_ID=<your-portal-id>
  ```
- **Cost**: Free for up to 1M contacts
- **Use Case**: Sync CFO leads → HubSpot CRM, trigger email sequences

#### Slack
```bash
npx clawhub install "slack"
```
- **What it does**: Send alerts, logs, summaries to Slack
- **Setup**:
  ```
  SLACK_BOT_TOKEN=xoxb-...
  SLACK_CHANNEL_ID=C1234567890
  ```
- **Cost**: $0 (uses existing Slack workspace)
- **Use Case**: Agent runs → #console-logs, cost alerts → #billing

---

## Complete .env.local Setup

```bash
# ────────────────────────────────────────────────────────────────────
# CLAWHUB SKILLS CONFIGURATION
# ────────────────────────────────────────────────────────────────────

# Postiz (Multi-platform social posting)
POSTIZ_API_KEY=<your-postiz-api-key>
POSTIZ_API_URL=https://api.postiz.com/api

# MachFive (Cold email sequences)
MACHFIVE_API_KEY=<your-machfive-api-key>
MACHFIVE_WORKSPACE_ID=<your-workspace-id>

# AgentMail (Email tracking)
AGENTMAIL_API_KEY=<your-agentmail-api-key>

# Resend (Transactional email)
RESEND_API_KEY=<your-resend-api-key>

# Firecrawl (Web scraping)
FIRECRAWL_API_KEY=<your-firecrawl-api-key>

# Apify (Lead generation scraping)
APIFY_API_TOKEN=<your-apify-token>

# GA4 Analytics
GA4_PROPERTY_ID=<your-ga4-property-id>
GOOGLE_OAUTH_TOKEN=<your-service-account-json>

# HubSpot CRM
HUBSPOT_API_KEY=<your-hubspot-api-key>
HUBSPOT_PORTAL_ID=<your-portal-id>

# Slack Integration
SLACK_BOT_TOKEN=xoxb-your-token-here
SLACK_CHANNEL_ID=C1234567890

# QMD (Built-in, no config needed)
# Automatically enabled in ~/.openclaw/openclaw.json
```

---

## Installation Walkthrough

### Step 1: Install QMD (Token Compression)
```bash
cd ~/.openclaw/extensions
npx clawhub install qmd
# Verify: ls -la skills/qmd/
```

### Step 2: Install Postiz (Already Done)
```bash
# Already installed. Configure in .env.local
echo "POSTIZ_API_KEY=<your-key>" >> .env.local
echo "POSTIZ_API_URL=https://api.postiz.com/api" >> .env.local
```

### Step 3: Install Priority 2 Skills (One at a time, with 3s delay)
```bash
sleep 3 && npx clawhub install "machfive-cold-email"
sleep 3 && npx clawhub install "agentmail"
sleep 3 && npx clawhub install "resend"
```

### Step 4: Install Priority 3 Skills
```bash
sleep 3 && npx clawhub install "marketing-mode"
sleep 3 && npx clawhub install "ga4-analytics"
```

### Step 5: Test Installations
```bash
# List installed skills
ls ~/.openclaw/extensions/skills/

# Expected:
# ├── postiz/
# ├── qmd/
# ├── machfive-cold-email/
# ├── agentmail/
# ├── resend/
# ├── marketing-mode/
# ├── ga4-analytics/
# └── ... (others)
```

---

## Usage in Console

### Add Posts to Queue (Multi-Platform)
```bash
curl -X POST http://localhost:3001/api/content-queue \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "HOAs can now integrate...",
    "platform": "linkedin",
    "post_type": "page",
    "topic": "HOA project funding",
    "source_agent": "hoa-social-media"
  }'
```

### Supported Platforms
- `facebook` — HOA Project Funding page
- `linkedin` — Steve Pilcher personal + HOA company
- `twitter` — @HOAFunding news feed
- `instagram` — HOA visual content
- `tiktok` — Short-form HOA tips
- `threads` — Meta's Twitter alt
- `bluesky` — Jack Dorsey's Twitter alt
- `mastodon` — Federated social

### Publish All Due Posts
```bash
curl -X POST http://localhost:3001/api/content-queue/publish-due \
  -H "Authorization: Bearer <token>"
```

---

## Cost Estimation (Monthly)

| Skill | Cost | Usage | Total |
|-------|------|-------|-------|
| Postiz | Free tier | 50 posts/month | $0 |
| QMD | Included | Compression | -80% |
| MachFive | $0.10/email | 200 emails | $20 |
| AgentMail | Free tier | 1,000 opens/month | $0 |
| Resend | Free tier | 100 emails | $0 |
| Firecrawl | $50/month | 10,000 requests | $50 |
| GA4 | $0 | Unlimited | $0 |
| HubSpot | Free tier | 1M contacts | $0 |
| Slack | $0 | Existing workspace | $0 |
| **TOTAL** | | | **~$70** |

---

## Troubleshooting

### "Skill not found" error
- ClawHub may be rate-limited. Wait 5 minutes and retry.
- Or use: `npx clawhub@latest install <slug>`

### "API key invalid" at runtime
- Verify key in `.env.local`
- Test manually: `curl -H "Authorization: Bearer $KEY" https://api.provider.com/test`

### Postiz not posting to LinkedIn
- Ensure LinkedIn account is connected in Postiz dashboard
- May require Postiz Pro ($29/month)

### Email delivery to spam folder
- Use Resend or AgentMail instead of MachFive (better deliverability)
- Add SPF/DKIM records to domain

---

## Next Steps

1. **Today**: Install QMD + verify token savings in next agent run
2. **This week**: Configure Postiz API key + test multi-platform posts
3. **Next week**: Install MachFive + test CFO cold email sequences
4. **Month 2**: Add HubSpot sync for lead pipeline automation

