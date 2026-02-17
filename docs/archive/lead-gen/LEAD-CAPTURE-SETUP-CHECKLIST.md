# Lead Capture Setup Checklist

Complete this checklist to wire up your WordPress forms to the email automation system with instant Telegram notifications, lead scoring, and CRM logging.

**Status**: Ready to configure external services
**Backend Code**: ✅ Complete (7 files created)
**Directory Structure**: ✅ Created (`data/leads/` with `drafts/` subdirectory)
**Webhook Route**: ✅ Registered in server

---

## ✅ Backend Implementation (Complete)

- [x] Created `server/schemas/lead.schema.js` - Form data validation
- [x] Created `server/lib/leadScoring.js` - Hot lead detection ($250K+ threshold)
- [x] Created `server/lib/espIntegration.js` - SendGrid API integration
- [x] Created `server/lib/telegramNotification.js` - Lead alert formatting
- [x] Created `server/lib/crmLogger.js` - JSON file CRM system
- [x] Created `server/lib/followUpDrafter.js` - Personalized email generator
- [x] Created `server/routes/webhooks.js` - Webhook endpoint handler
- [x] Registered webhook route in `server/index.js`
- [x] Created `data/leads/` directory structure

---

## 📋 Service Registration (Complete These Now)

### 1. SendGrid Account Setup

**Service**: SendGrid (Email Service Provider)
**Cost**: Free tier (100 emails/day)
**Purpose**: Email nurture sequences, automated welcome emails

**Steps**:
1. [ ] Sign up at https://sendgrid.com
2. [ ] Verify email address
3. [ ] **Create API Key**:
   - Navigate to: **Settings** → **API Keys**
   - Click: **Create API Key**
   - Name: "HOA Lead Capture"
   - Permissions: **Full Access**
   - Copy the API key (starts with `SG.`)
   - **Save immediately** (you won't see it again)
4. [ ] **Create Contact List**:
   - Navigate to: **Marketing** → **Contacts**
   - Click: **Create List**
   - Name: "HOA Leads"
   - Copy the list ID from the URL (e.g., `a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6`)
5. [ ] **Create Custom Fields** (for lead data):
   - Go to: **Marketing** → **Field Definitions** → **Create New Field**
   - Create these fields:
     * `hoa_name` (Text)
     * `project_type` (Text)
     * `estimated_amount` (Number)
     * `phone` (Text)
     * `lead_score` (Text)
     * `urgency_level` (Text)
6. [ ] **Set up 6-Email Automation** (optional now, required later):
   - Navigate to: **Marketing** → **Automations** → **Create New Automation**
   - Set triggers: Day 0, 3, 7, 14, 21, 28
   - Use email copy from `openclaw-skills/hoa-email-campaigns/SKILL.md`
7. [ ] **Add credentials to `.env.local`**:
   ```bash
   SENDGRID_API_KEY=SG.your_api_key_here
   SENDGRID_LIST_ID=your_list_id_here
   ```

**Documentation**: https://docs.sendgrid.com/

---

### 2. Telegram Bot Setup

**Service**: Telegram Bot
**Cost**: Free
**Purpose**: Instant lead notifications to your phone

**Steps**:
1. [ ] Open Telegram app (or web.telegram.org)
2. [ ] Search for and message: **@BotFather**
3. [ ] Send command: `/newbot`
4. [ ] **Choose bot name**: "HOA Lead Alerts" (or any name you like)
5. [ ] **Choose username**: `hoa_lead_alerts_bot` (must end in `_bot`)
6. [ ] **Copy bot token** from BotFather's response (format: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)
7. [ ] **Activate bot**: Send any message to your new bot (e.g., "/start")
8. [ ] **Get your chat ID**:
   - Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   - Replace `<YOUR_BOT_TOKEN>` with your actual token
   - Find `"chat":{"id":123456789}` in the JSON response
   - Copy that number (your chat ID)
9. [ ] **Add credentials to `.env.local`**:
   ```bash
   TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
   TELEGRAM_CHAT_ID=123456789
   ```
10. [ ] **Test bot**:
    ```bash
    curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage" \
      -d "chat_id=<YOUR_CHAT_ID>" \
      -d "text=Test from Lead Capture System"
    ```
    You should receive a message on Telegram

**Documentation**: https://core.telegram.org/bots

---

### 3. Webhook Secret Generation

**Purpose**: Secure your webhook endpoint with HMAC signature verification

**Steps**:
1. [ ] **Generate webhook secret** (run in terminal):
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```
2. [ ] **Copy the output** (128-character hex string)
3. [ ] **Add to backend `.env.local`**:
   ```bash
   WEBHOOK_SECRET=<paste_your_generated_secret_here>
   ```
4. [ ] **Save secret** to password manager (you'll need it for WordPress)

---

### 4. WordPress Webhook Plugin

**Plugin**: "Webhooks for Contact Form 7" by Webtica
**Cost**: Free
**Purpose**: Send form submissions to your backend

**Steps**:
1. [ ] Log into WordPress Admin (www.hoaprojectfunding.com/wp-admin)
2. [ ] Navigate to: **Plugins** → **Add New**
3. [ ] Search: "Webhooks for Contact Form 7"
4. [ ] Click: **Install Now** → **Activate**
5. [ ] Navigate to: **Contact Forms** → Select your form
6. [ ] Go to: **Integration** tab → **Webhooks** section
7. [ ] **Configure webhook**:
   - **Webhook URL**: `https://your-backend-domain.com/api/webhooks/form-submission`
   - **Method**: `POST`
   - **Content-Type**: `application/json`
   - **Body Template**: (see WORDPRESS-WEBHOOK-SETUP.md for full template)
8. [ ] **Add HMAC signature function** to `functions.php`:
   - Location: **Appearance** → **Theme Editor** → `functions.php`
   - Copy code from **WORDPRESS-WEBHOOK-SETUP.md** (Step 4)
   - Replace `PASTE_YOUR_WEBHOOK_SECRET_HERE` with your actual secret
9. [ ] **Save changes**

**Full Documentation**: See [WORDPRESS-WEBHOOK-SETUP.md](WORDPRESS-WEBHOOK-SETUP.md)

---

## 🔧 Backend Configuration

### Complete `.env.local` File

**Location**: `c:\Users\SPilcher\OpenClaw2.0 for linux\server\.env.local`

Add these variables (keep existing ones):

```bash
# ========================================
# Lead Capture System
# ========================================

# Webhook Security (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
WEBHOOK_SECRET=<your_128_char_hex_secret>

# SendGrid (Email Service Provider)
SENDGRID_API_KEY=SG.<your_api_key>
SENDGRID_LIST_ID=<your_list_id>

# Telegram Notifications
TELEGRAM_BOT_TOKEN=<your_bot_token>
TELEGRAM_CHAT_ID=<your_chat_id>
```

---

## 🚀 Deployment Steps

### 1. Restart Backend Server

After adding environment variables, restart your backend:

```bash
# Find and kill process on port 3001
powershell -Command "Get-NetTCPConnection -LocalPort 3001 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }"

# Navigate to server directory
cd "c:\Users\SPilcher\OpenClaw2.0 for linux\server"

# Start server
node index.js
```

**Expected logs**:
```
[Server] Starting ClawOps Backend...
[Database] Connected to SQLite
[Routes] Webhook routes registered
[Server] Backend listening on port 3001
```

### 2. Test Webhook Endpoint

```bash
curl http://localhost:3001/api/webhooks/test
```

**Expected response**:
```json
{
  "message": "Webhook endpoint is active",
  "timestamp": "2026-02-13T10:30:00.000Z",
  "configured": true
}
```

If `configured: false`, check that `WEBHOOK_SECRET` is in `.env.local`.

---

## ✅ Verification Tests

### Test 1: Webhook Endpoint Health Check

```bash
curl http://localhost:3001/api/webhooks/test
```
**Expected**: `{"message":"Webhook endpoint is active","configured":true}`

### Test 2: Manual Webhook Submission

**Generate HMAC signature**:
```bash
echo -n '{"name":"Test User","email":"test@example.com","hoa_name":"Test HOA","project_type":"roof_replacement","estimated_amount":300000,"project_urgency":"immediate","message":"Need financing ASAP"}' | openssl dgst -sha256 -hmac "YOUR_WEBHOOK_SECRET"
```

**Send test webhook** (replace `<signature>` with output above):
```bash
curl -X POST http://localhost:3001/api/webhooks/form-submission \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: <signature>" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "hoa_name": "Test HOA",
    "project_type": "roof_replacement",
    "estimated_amount": 300000,
    "project_urgency": "immediate",
    "message": "Need financing ASAP"
  }'
```

**Expected response**:
```json
{
  "success": true,
  "lead_id": "uuid-here",
  "score": "hot",
  "priority": "high",
  "esp_added": true,
  "telegram_sent": true,
  "follow_up_drafted": true
}
```

### Test 3: Verify CRM Logging

```bash
cat "c:\Users\SPilcher\OpenClaw2.0 for linux\data\leads\hot-leads.json"
```
**Expected**: JSON file with your test lead

### Test 4: Verify SendGrid Contact Created

1. Log into SendGrid dashboard
2. Go to: **Marketing** → **Contacts**
3. Search for: `test@example.com`
4. Verify contact exists with custom fields populated

### Test 5: Verify Telegram Notification

Check your Telegram app for a message like:

```
🔥 HOT LEAD - WordPress Form Submission
━━━━━━━━━━━━━━━━━━━━━━━━━

Contact: Test User
Email: test@example.com

HOA: Test HOA

Project: roof replacement
Estimated Amount: $300,000
Timeline: immediate

Message:
Need financing ASAP

Urgency Signals:
• High-value project: $300,000
• Timeline: immediate

Actions:
✅ Added to SendGrid nurture sequence
✅ Logged to CRM
✅ Personalized follow-up drafted

Next Steps:
⚡ RESPOND WITHIN 2 HOURS
• Review drafted follow-up email
• Call lead if phone provided
• Schedule consultation call

━━━━━━━━━━━━━━━━━━━━━━━━━
🕐 2/13/2026, 10:30:23 AM EST
```

### Test 6: Verify Follow-up Email Drafted

```bash
ls "c:\Users\SPilcher\OpenClaw2.0 for linux\data\leads\drafts\"
```
**Expected**: File like `follow-up-<uuid>-<timestamp>.md`

**View contents**:
```bash
cat "c:\Users\SPilcher\OpenClaw2.0 for linux\data\leads\drafts\follow-up-*.md"
```

### Test 7: WordPress Form Submission

1. Go to www.hoaprojectfunding.com/contact
2. Fill out the form with test data
3. Submit the form
4. Repeat Tests 3-6 above with real form data

---

## 📊 Lead Scoring Reference

Understanding how leads are scored:

### 🔥 Hot Lead (15+ points)

**Criteria**:
- Project amount $250,000+ (8 points)
- Timeline: Immediate (10 points) or Within 3 months (7 points)
- Keywords: "urgent", "financing", "loan", "asap" (3 points each)
- Reserve fund < 30% of project cost (5 points)
- Special assessment concerns (3 points)
- HOA 100+ units (2 points)

**Actions**:
- ✅ Added to SendGrid nurture sequence
- ✅ Telegram notification sent (with "RESPOND WITHIN 2 HOURS")
- ✅ Logged to `data/leads/hot-leads.json`
- ✅ **Personalized follow-up email drafted** to `data/leads/drafts/`

**Example**: $400K roof, immediate timeline, mentions "need financing ASAP" = 27 points

### 🌟 Warm Lead (8-14 points)

**Criteria**:
- Project amount $100K-$250K (4 points)
- Timeline: Within 6 months (4 points)
- Keywords: "considering", "exploring", "reserve fund" (1 point each)

**Actions**:
- ✅ Added to SendGrid nurture sequence
- ✅ Telegram notification sent
- ✅ Logged to `data/leads/warm-leads.json`

**Example**: $150K pool, 6-month timeline, exploring options = 10 points

### 💬 General Lead (0-7 points)

**Criteria**:
- No project amount specified
- Timeline: Planning phase (1 point)
- Generic inquiry, no urgency keywords

**Actions**:
- ✅ Added to SendGrid nurture sequence
- ✅ Logged to `data/leads/general-leads.json`

**Example**: General inquiry, planning phase, no specific project = 1 point

---

## 📁 File Locations

**Backend Code**:
- Schemas: `server/schemas/lead.schema.js`
- Libraries: `server/lib/leadScoring.js`, `espIntegration.js`, `telegramNotification.js`, `crmLogger.js`, `followUpDrafter.js`
- Routes: `server/routes/webhooks.js`
- Config: `server/.env.local`

**CRM Data**:
- Hot leads: `data/leads/hot-leads.json`
- Warm leads: `data/leads/warm-leads.json`
- General leads: `data/leads/general-leads.json`
- All leads: `data/leads/all-leads.json`
- Follow-up drafts: `data/leads/drafts/*.md`

**Documentation**:
- WordPress setup: [WORDPRESS-WEBHOOK-SETUP.md](WORDPRESS-WEBHOOK-SETUP.md)
- This checklist: [LEAD-CAPTURE-SETUP-CHECKLIST.md](LEAD-CAPTURE-SETUP-CHECKLIST.md)

---

## 🆘 Troubleshooting

### Backend won't start
- Check `.env.local` has all required variables
- Verify no syntax errors in new files
- Check port 3001 is not already in use

### Webhook returns 401 (Invalid signature)
- Verify webhook secret matches in WordPress and `.env.local`
- Check no extra whitespace in secret
- Test HMAC generation manually (see WORDPRESS-WEBHOOK-SETUP.md)

### SendGrid integration fails
- Verify API key has "Full Access" permissions
- Check list ID exists in SendGrid dashboard
- Test API key manually: `curl -H "Authorization: Bearer $SENDGRID_API_KEY" https://api.sendgrid.com/v3/marketing/contacts`

### Telegram not sending
- Verify you've sent at least one message to your bot
- Test bot token: `curl https://api.telegram.org/bot<TOKEN>/getMe`
- Check chat ID is numeric (not string)

### No follow-up email drafted
- Only hot leads (15+ points) get follow-up emails
- Check lead score in CRM JSON files
- Verify `data/leads/drafts/` directory exists

---

## 📞 Support

**Questions or issues?**
- Email: steve.j.pilcher@gmail.com
- Documentation: [WORDPRESS-WEBHOOK-SETUP.md](WORDPRESS-WEBHOOK-SETUP.md)
- Check backend logs: `node index.js` (shows webhook processing details)

---

## ✨ What Happens When a Lead Submits

1. **Form submission** on www.hoaprojectfunding.com
2. **WordPress** sends webhook to your backend (0-2 seconds)
3. **Backend** verifies HMAC signature
4. **Lead scoring** algorithm analyzes project details (hot/warm/general)
5. **SendGrid** adds contact with tags → triggers Day 0 welcome email
6. **Telegram** sends you instant notification with lead details
7. **CRM logging** saves lead to JSON files
8. **Follow-up draft** generated if hot lead (15+ points)
9. **Response** sent back to WordPress (success confirmation)

**Total time**: 0-2 seconds from form submit to welcome email sent!

---

**Status**: Ready for service registration
**Next Step**: Complete the 4 service setups above (SendGrid, Telegram, Webhook Secret, WordPress)
