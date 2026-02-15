# Facebook Lead Generation Integration

Complete documentation for integrating Facebook Lead Ads with your OpenClaw agent platform.

## Overview

This integration automatically captures leads from your Facebook Lead Ads and stores them in the ClawOps Console database for processing, scoring, and follow-up automation.

## Configuration

### 1. Environment Variables

The following variables have been added to your `.env.local` file:

```env
# Facebook Integration (Lead Generation)
FACEBOOK_APP_ID=10123882325794480
FACEBOOK_PAGE_ID=1001233166403710
FACEBOOK_PAGE_NAME=HOA Project Funding
FACEBOOK_ACCESS_TOKEN=EAAiYWGHE1a4BQgSGFk5DZB03ZBf7SISceLNzqQTlR7LyXYZBhkiS2uE2ZBeeYGpT3nVtiXgU592g8Ce4u8UycjpmY30s6XJLm6q57lh5u2EGV4n18KNZC5oa44HbqmT5O5361FZA9Gi0WtNAZBYASW9AOV7NrZBLpZAocWET6RZCsovLUln0Ux36zlyTgLaMxS811BmQk9ZAtxVACZA1s5y5bUHo83fCGrZAbDKVXolq7c6OSHkDv49VKe4wj9XcZD
FACEBOOK_GRAPH_API_VERSION=v22.0
FACEBOOK_LEAD_POLL_INTERVAL=300000
```

**Important:** Your access token expires! You'll need to refresh it periodically. See [Access Token Management](#access-token-management) below.

### 2. Database Setup

The integration uses a `leads` table that was created via migration `008_facebook_leads.sql`.

**Table Schema:**
- `id` - Auto-increment primary key
- `source` - Lead source (e.g., 'facebook_Form Name')
- `facebook_lead_id` - Unique Facebook lead ID
- `name`, `email`, `phone`, `company` - Contact information
- `raw_data` - JSON blob of all form fields
- `status` - 'new', 'contacted', 'qualified', 'converted', 'dead'
- `score` - Lead quality score (0-100)
- Various tracking fields for follow-ups and conversion

## API Endpoints

All endpoints require authentication (JWT token).

### Base URL
```
http://localhost:3001/api/facebook
```

### Available Endpoints

#### 1. Get Integration Status
```http
GET /api/facebook/status
```

**Response:**
```json
{
  "isPolling": true,
  "pollInterval": 300000,
  "pageId": "1001233166403710",
  "configured": true
}
```

#### 2. Test Connection
```http
GET /api/facebook/test
```

Tests the Facebook API connection and validates credentials.

**Response:**
```json
{
  "success": true,
  "page": {
    "id": "1001233166403710",
    "name": "HOA Project Funding"
  }
}
```

#### 3. List Lead Forms
```http
GET /api/facebook/forms
```

Retrieves all lead forms associated with your Facebook Page.

**Response:**
```json
{
  "forms": [
    {
      "id": "123456789",
      "name": "Contact Form",
      "status": "ACTIVE",
      "leads_count": 42,
      "created_time": "2026-01-15T10:30:00+0000"
    }
  ]
}
```

#### 4. Get Leads from Specific Form
```http
GET /api/facebook/forms/:formId/leads?limit=100
```

**Parameters:**
- `formId` (path) - Facebook form ID
- `limit` (query) - Max leads to retrieve (default: 100)

**Response:**
```json
{
  "leads": [
    {
      "id": "987654321",
      "created_time": "2026-02-15T14:20:00+0000",
      "field_data": [
        { "name": "full_name", "values": ["John Doe"] },
        { "name": "email", "values": ["john@example.com"] },
        { "name": "phone_number", "values": ["+1234567890"] }
      ]
    }
  ]
}
```

#### 5. Manual Sync
```http
POST /api/facebook/sync
```

Manually trigger a sync of all leads from all active forms.

**Response:**
```json
{
  "success": true,
  "message": "Lead sync completed",
  "forms": 3,
  "newLeads": 15
}
```

#### 6. Start Automatic Polling
```http
POST /api/facebook/polling/start
```

Start automatic background polling for new leads every 5 minutes (configurable via `FACEBOOK_LEAD_POLL_INTERVAL`).

**Response:**
```json
{
  "success": true,
  "message": "Polling started",
  "status": {
    "isPolling": true,
    "pollInterval": 300000
  }
}
```

#### 7. Stop Automatic Polling
```http
POST /api/facebook/polling/stop
```

Stop automatic polling.

## Usage Workflow

### Initial Setup

1. **Test the connection:**
   ```bash
   curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:3001/api/facebook/test
   ```

2. **List your lead forms:**
   ```bash
   curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:3001/api/facebook/forms
   ```

3. **Do an initial manual sync:**
   ```bash
   curl -X POST -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:3001/api/facebook/sync
   ```

4. **Start automatic polling:**
   ```bash
   curl -X POST -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:3001/api/facebook/polling/start
   ```

### Ongoing Operation

Once polling is started:
- The service will check for new leads every 5 minutes (configurable)
- New leads are automatically stored in the database
- Duplicate leads (based on `facebook_lead_id`) are skipped
- All actions are logged in the audit trail

### Querying Leads

You can query the leads table directly:

```javascript
const { all } = require('./server/db/connection');

// Get all new leads
const newLeads = all('SELECT * FROM leads WHERE status = ?', ['new']);

// Get leads from last 24 hours
const recentLeads = all(`
  SELECT * FROM leads
  WHERE created_at > datetime('now', '-1 day')
  ORDER BY created_at DESC
`);

// Get high-quality leads
const qualifiedLeads = all(`
  SELECT * FROM leads
  WHERE score >= 70 AND status != 'dead'
`);
```

## Access Token Management

### Token Expiration

Facebook access tokens expire. Your current token type determines lifespan:
- **Short-lived User Access Token**: 1 hour
- **Long-lived User Access Token**: 60 days
- **Page Access Token**: Never expires (unless you change page settings)

### How to Refresh Your Token

#### Option 1: Via Graph API Explorer (Manual)

1. Go to [Facebook Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your App from the dropdown
3. Select your Page
4. Click "Generate Access Token"
5. Add these permissions:
   - `pages_manage_metadata`
   - `pages_read_engagement`
   - `pages_read_user_content`
   - `leads_retrieval`
6. Copy the new token
7. Update `.env.local`:
   ```env
   FACEBOOK_ACCESS_TOKEN=YOUR_NEW_TOKEN_HERE
   ```
8. Restart your server

#### Option 2: Exchange for Long-Lived Token (Automated)

```bash
curl -i -X GET "https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&fb_exchange_token=YOUR_SHORT_LIVED_TOKEN"
```

Replace:
- `YOUR_APP_ID` - Your Facebook App ID
- `YOUR_APP_SECRET` - Your App Secret (from App Dashboard)
- `YOUR_SHORT_LIVED_TOKEN` - Current access token

This returns a long-lived token (60 days).

### Monitoring Token Health

The `/api/facebook/test` endpoint will fail if your token is expired or invalid. Set up a monitoring check to call this endpoint daily and alert you if it fails.

## Security Best Practices

1. **Never commit `.env.local`** - It's in `.gitignore` already, keep it that way
2. **Rotate tokens regularly** - Even if they don't expire, refresh them every 30-60 days
3. **Use Page Access Tokens** when possible - They're more stable than user tokens
4. **Monitor the audit log** - Check `audit_log` table for unusual Facebook API activity
5. **Limit permissions** - Only request the exact permissions you need

## Troubleshooting

### "Failed to fetch lead forms: Invalid OAuth access token"

**Cause:** Your access token has expired or is invalid.

**Fix:** Generate a new token following the steps in [Access Token Management](#access-token-management).

### "Lead sync completed. Total new leads: 0"

**Possible causes:**
1. No new leads since last sync (this is normal)
2. Lead forms are paused or deleted
3. Token permissions don't include `leads_retrieval`

**Fix:**
- Check your forms status: `GET /api/facebook/forms`
- Verify token permissions in Graph API Explorer

### Polling not running after server restart

**Cause:** Polling is not started automatically on server boot.

**Fix:** Add this to your server startup or create an init script:
```bash
curl -X POST -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3001/api/facebook/polling/start
```

Or add to `server/index.js` after database init:
```javascript
const { facebookLeadService } = require('./services/facebookLeadService');
// Start Facebook polling if configured
if (process.env.FACEBOOK_ACCESS_TOKEN) {
  facebookLeadService.startPolling();
}
```

## Integration with OpenClaw Agents

You can create agents that automatically process new Facebook leads:

### Example: Lead Qualification Agent

Create an agent that:
1. Monitors the `leads` table for `status = 'new'`
2. Analyzes lead data (HOA size, location, funding needs)
3. Scores leads based on qualification criteria
4. Updates `score` and `status` fields
5. Triggers follow-up workflows for high-scoring leads

### Example: Auto-Response Agent

Create an agent that:
1. Detects new Facebook leads
2. Drafts personalized email response
3. Sends via SMTP (using existing email config)
4. Logs activity in CRM

## Next Steps

### Required Manual Setup

To complete the Facebook integration, you still need to:

1. **Set up Facebook Webhooks** (for real-time lead notifications instead of polling)
   - Go to your Facebook App → Webhooks
   - Subscribe to `leadgen` webhook for your page
   - Set callback URL to: `https://your-domain.com/api/facebook/webhook`
   - Verify token: Generate a secure random string
   - Add webhook handler in `server/routes/facebook.js`

2. **Configure Lead Scoring**
   - Define scoring rules in `server/lib/leadScoring.js`
   - Implement auto-scoring on lead creation

3. **Set up CRM Sync**
   - Add integration with your CRM (Salesforce, HubSpot, etc.)
   - Auto-push qualified leads to CRM

4. **Create Dashboard Widget**
   - Add Facebook leads widget to frontend dashboard
   - Show: new leads count, top sources, conversion rate

## API Integrations Checklist

Here's a comprehensive list of all manual registrations, APIs, and 3rd party integrations you need:

### ✅ Already Configured
- [x] Facebook Developer Account & App
- [x] Facebook Page Access Token
- [x] Gmail SMTP (for email sending)
- [x] Azure SQL Database (EMP CRM)
- [x] HOA Website Webhook API

### ⚠️ Needs Configuration
- [ ] **Facebook Webhooks** (for real-time lead notifications)
  - Required: Webhook callback URL (HTTPS required)
  - Required: Webhook verify token
  - Setup: Facebook App → Webhooks → Subscribe to Page → leadgen event

- [ ] **CRM Integration** (optional but recommended)
  - Options: Salesforce, HubSpot, Pipedrive, Zoho
  - Required: API credentials for chosen CRM
  - Purpose: Auto-sync qualified leads

- [ ] **SMS/WhatsApp for Lead Follow-up** (optional)
  - Options: Twilio, MessageBird
  - Required: Account + API key
  - Purpose: Auto-send follow-up messages to leads

- [ ] **Lead Enrichment Services** (optional)
  - Options: Clearbit, FullContact, ZoomInfo
  - Required: API key
  - Purpose: Enrich lead data (company size, revenue, etc.)

### 🔧 Future Integrations
- [ ] Google Analytics (track lead conversion)
- [ ] Zapier (no-code workflow automation)
- [ ] Slack (lead notifications)
- [ ] Calendar API (auto-schedule calls with leads)

---

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review server logs: `tail -f logs/server.log`
3. Check audit log: `SELECT * FROM audit_log WHERE resource LIKE '%facebook%' ORDER BY created_at DESC LIMIT 50`
4. Test connection: `GET /api/facebook/test`

Generated: February 15, 2026
