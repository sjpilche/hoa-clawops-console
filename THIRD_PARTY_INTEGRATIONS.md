# Third-Party Integrations & API Reference

Complete list of all external services, APIs, and manual registrations needed for your OpenClaw Agent Fleet.

---

## 🟢 ACTIVE INTEGRATIONS (Already Configured)

### 1. Facebook Lead Generation API
**Purpose:** Capture leads from Facebook Lead Ads
**Status:** ✅ Configured
**Credentials Location:** `.env.local`
**Documentation:** `docs/FACEBOOK-INTEGRATION.md`

**Configuration:**
```env
FACEBOOK_APP_ID=10123882325794480
FACEBOOK_PAGE_ID=1001233166403710
FACEBOOK_ACCESS_TOKEN=EAA...
```

**API Endpoints:**
- Graph API: `https://graph.facebook.com/v22.0`
- Permissions: `pages_manage_metadata`, `pages_read_engagement`, `leads_retrieval`

**Action Required:**
- [ ] Set calendar reminder to refresh access token every 60 days
- [ ] Optional: Set up webhooks for real-time lead notifications

---

### 2. Gmail SMTP (Email Delivery)
**Purpose:** Send automated emails from agents
**Status:** ✅ Configured
**Credentials Location:** `.env.local`

**Configuration:**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=augustwest154@gmail.com
SMTP_PASS=dnqkjgheeflfacnq  # App Password
SMTP_FROM=ClawOps Daily Digest <augustwest154@gmail.com>
```

**Setup Steps:**
1. Gmail → Security → 2-Step Verification → App Passwords
2. Generate app-specific password
3. Use that instead of regular password

**Action Required:** None

---

### 3. Azure SQL Database (EMP CRM)
**Purpose:** Lead database for Empire Capital
**Status:** ✅ Configured
**Credentials Location:** `.env.local`

**Configuration:**
```env
AZURE_SQL_SERVER=empirecapital.database.windows.net
AZURE_SQL_DATABASE=empcapmaster2
AZURE_SQL_USER=CloudSA1f77fc9b
AZURE_SQL_PASSWORD=T0ughGUY123$
```

**Connection String:**
```
Server=empirecapital.database.windows.net;Database=empcapmaster2;User Id=CloudSA1f77fc9b;Password=T0ughGUY123$;Encrypt=true;
```

**Action Required:** None

---

### 4. HOA Website Webhook API
**Purpose:** Publish content to HOA Project Funding website
**Status:** ✅ Configured
**Credentials Location:** `.env.local`

**Configuration:**
```env
HOA_WEBHOOK_SECRET=0501c2a820d5368434780db776d3dd2a45b8762c982052b8a72adff63d3ad3b0
HOA_WEBHOOK_API_URL=https://hoaprojectfunding-api.onrender.com
```

**API Endpoints:**
- POST `/webhook/content` - Publish new content

**Action Required:** None

---

## 🟡 PENDING INTEGRATIONS (Need Setup)

### 5. Facebook Webhooks (Real-Time Leads)
**Purpose:** Get instant notifications when new leads come in (instead of polling)
**Status:** ⚠️ Not Configured
**Priority:** Medium
**Cost:** Free

**Setup Steps:**
1. Go to Facebook App Dashboard → Webhooks
2. Click "Add Subscription" for your Page
3. Select `leadgen` event
4. Callback URL: `https://your-domain.com/api/facebook/webhook`
5. Verify Token: Generate random string (e.g., `openssl rand -hex 32`)
6. Add webhook handler to `server/routes/facebook.js`

**Benefits:**
- Instant lead notifications (vs 5-minute polling delay)
- Reduced API calls
- Lower risk of missing leads

**Code Template:**
```javascript
// In server/routes/facebook.js
router.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.post('/webhook', async (req, res) => {
  const data = req.body;
  if (data.object === 'page') {
    for (const entry of data.entry) {
      for (const change of entry.changes) {
        if (change.field === 'leadgen') {
          const leadId = change.value.leadgen_id;
          // Fetch and store lead...
        }
      }
    }
  }
  res.sendStatus(200);
});
```

---

### 6. CRM Integration (Salesforce/HubSpot/Pipedrive)
**Purpose:** Auto-sync qualified leads to CRM
**Status:** ⚠️ Not Configured
**Priority:** High
**Cost:** Depends on CRM (most have free tiers)

**Recommended Options:**

#### Option A: HubSpot (Recommended for SMB)
- **Free tier:** Yes (up to 1M contacts)
- **API:** REST API with simple authentication
- **Setup:** Create free account → Get API key → Enable leads sync
- **Docs:** https://developers.hubspot.com/docs/api/crm/contacts

**Environment Variables Needed:**
```env
HUBSPOT_API_KEY=your_key_here
HUBSPOT_PORTAL_ID=your_portal_id
```

#### Option B: Salesforce
- **Free tier:** Developer org (sandbox)
- **API:** REST/SOAP API with OAuth
- **Setup:** More complex, requires OAuth flow
- **Best for:** Enterprise users

**Environment Variables Needed:**
```env
SALESFORCE_CLIENT_ID=your_client_id
SALESFORCE_CLIENT_SECRET=your_client_secret
SALESFORCE_USERNAME=your_username
SALESFORCE_PASSWORD=your_password
SALESFORCE_SECURITY_TOKEN=your_token
```

#### Option C: Pipedrive
- **Free tier:** 14-day trial, then $14/month
- **API:** Simple REST API
- **Best for:** Sales teams

---

### 7. SMS/WhatsApp Follow-up (Twilio)
**Purpose:** Auto-send SMS to new leads
**Status:** ⚠️ Not Configured
**Priority:** Medium
**Cost:** ~$0.0075 per SMS

**Setup Steps:**
1. Create Twilio account: https://www.twilio.com/try-twilio
2. Get phone number ($1-2/month)
3. Get Account SID and Auth Token
4. Add to `.env.local`

**Environment Variables:**
```env
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890
```

**Code Template:**
```javascript
const twilio = require('twilio');
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function sendLeadSMS(lead) {
  await client.messages.create({
    body: `Hi ${lead.name}, thanks for your interest in HOA project funding...`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: lead.phone
  });
}
```

---

### 8. Lead Enrichment (Clearbit/FullContact)
**Purpose:** Auto-enrich leads with company data
**Status:** ⚠️ Not Configured
**Priority:** Low
**Cost:** Clearbit ~$99/month, FullContact ~$49/month

**Example:**
Input: `email: john@acmehoa.com`
Output: Company size, revenue, industry, social profiles, etc.

**Setup:**
1. Choose provider (Clearbit recommended)
2. Sign up for account
3. Get API key
4. Add enrichment step after lead capture

---

### 9. LinkedIn Integration
**Purpose:** B2B lead generation, thought leadership
**Status:** ⚠️ Not Configured
**Priority:** HIGH (B2B focus)
**Cost:** Free

**Setup Guide:** See [LINKEDIN-SOCIAL-INTEGRATION-SETUP.md](LINKEDIN-SOCIAL-INTEGRATION-SETUP.md)

**What you need:**
1. LinkedIn Developer App
2. Marketing Developer Platform access (requires approval)
3. OAuth 2.0 credentials

**Environment Variables:**
```env
LINKEDIN_CLIENT_ID=78xxxxxxxxxxxxx
LINKEDIN_CLIENT_SECRET=VxXxxxxxxxxxxxxxxxxxxxxx
LINKEDIN_ACCESS_TOKEN=AQV...
```

**Time to Setup:** 1-2 hours

---

### 10. Twitter/X Integration
**Purpose:** Real-time engagement, trending topics
**Status:** ⚠️ Not Configured
**Priority:** MEDIUM
**Cost:** Free (Elevated access required)

**Setup Guide:** See [LINKEDIN-SOCIAL-INTEGRATION-SETUP.md](LINKEDIN-SOCIAL-INTEGRATION-SETUP.md)

**Environment Variables:**
```env
TWITTER_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxx
TWITTER_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWITTER_ACCESS_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWITTER_ACCESS_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Time to Setup:** 30 minutes

---

### 11. Instagram Integration
**Purpose:** Visual storytelling, community building
**Status:** ⚠️ Not Configured
**Priority:** MEDIUM
**Cost:** Free (uses Facebook app)

**Setup Guide:** See [LINKEDIN-SOCIAL-INTEGRATION-SETUP.md](LINKEDIN-SOCIAL-INTEGRATION-SETUP.md)

**Environment Variables:**
```env
INSTAGRAM_ACCOUNT_ID=17841400000000000
# Uses FACEBOOK_ACCESS_TOKEN from existing config
```

**Time to Setup:** 30 minutes

---

### 12. YouTube Integration
**Purpose:** Video content, SEO
**Status:** ⚠️ Not Configured
**Priority:** LOW
**Cost:** Free

**Setup Guide:** See [LINKEDIN-SOCIAL-INTEGRATION-SETUP.md](LINKEDIN-SOCIAL-INTEGRATION-SETUP.md)

**Environment Variables:**
```env
YOUTUBE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
YOUTUBE_CLIENT_ID=xxxxx.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxx
```

**Time to Setup:** 1 hour

---

## 🔵 FUTURE INTEGRATIONS (Optional)

### 13. Google Analytics
**Purpose:** Track lead conversion and ROI
**Setup:** Add GA tracking code to website
**Cost:** Free

### 14. Zapier
**Purpose:** No-code workflow automation
**Use Case:** Connect Facebook leads to 1000+ apps
**Cost:** Free tier available

### 15. Slack Notifications
**Purpose:** Real-time lead alerts in Slack
**Setup:** Create Slack webhook URL
**Cost:** Free

### 16. Calendar API (Google/Outlook)
**Purpose:** Auto-schedule calls with leads
**Setup:** OAuth integration
**Cost:** Free (requires Google/Microsoft account)

---

## 📋 INTEGRATION PRIORITY MATRIX

| Integration | Priority | Difficulty | Time | Cost | ROI |
|-------------|----------|-----------|------|------|-----|
| **Social Media** | | | | | |
| LinkedIn | HIGH | Medium | 2hrs | Free | High |
| Twitter/X | Medium | Easy | 30min | Free | High |
| Instagram | Medium | Easy | 30min | Free | Medium |
| YouTube | Low | Medium | 1hr | Free | Medium |
| **Lead Management** | | | | | |
| Facebook Webhooks | Medium | Easy | 30min | Free | High |
| CRM (HubSpot) | High | Medium | 2hrs | Free | High |
| Twilio SMS | Medium | Easy | 1hr | Low | Medium |
| Lead Enrichment | Low | Easy | 1hr | $$$ | Low |
| **Analytics** | | | | | |
| Google Analytics | Low | Easy | 30min | Free | Medium |
| Zapier | Low | Easy | 1hr | $ | Medium |

**Recommended Setup Order:**
1. LinkedIn (B2B focus, highest ROI)
2. Twitter/X (quick wins, easy engagement)
3. CRM Integration (centralize lead management)
4. Instagram (visual content)
5. Twilio SMS (instant lead contact)
6. YouTube (long-form content)

---

## 🔐 SECURITY CHECKLIST

- [x] All credentials in `.env.local` (not committed to git)
- [x] `.env.local` in `.gitignore`
- [ ] Rotate Facebook access token every 60 days
- [ ] Use app-specific passwords for Gmail (not main password)
- [ ] Azure SQL uses encrypted connection (Encrypt=true)
- [ ] Webhook endpoints validate signatures
- [ ] API rate limiting enabled
- [ ] Audit logging for all integrations

---

## 📞 SUPPORT CONTACTS

### Facebook Developer Support
- Console: https://developers.facebook.com/apps/
- Support: https://developers.facebook.com/support/

### Twilio Support
- Console: https://console.twilio.com/
- Docs: https://www.twilio.com/docs

### Azure Support
- Portal: https://portal.azure.com/
- Support: 1-800-642-7676

---

## 🔗 USEFUL LINKS

- Facebook Graph API Explorer: https://developers.facebook.com/tools/explorer/
- Facebook Access Token Debugger: https://developers.facebook.com/tools/debug/accesstoken/
- Twilio Console: https://console.twilio.com/
- HubSpot Developers: https://developers.hubspot.com/

---

**Last Updated:** February 15, 2026
**Maintained By:** ClawOps Integration Team

For questions or to add new integrations, update this document and notify the team.
