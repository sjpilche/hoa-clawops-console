# WordPress Contact Form 7 Webhook Setup

Complete guide for configuring Contact Form 7 to send lead submissions to your backend webhook endpoint.

---

## Step 1: Install Webhook Plugin

**Plugin**: "Webhooks for Contact Form 7" by Webtica

**Installation**:
1. Log into WordPress Admin
2. Navigate to **Plugins** → **Add New**
3. Search: "Webhooks for Contact Form 7"
4. Click **Install Now** → **Activate**

---

## Step 2: Generate Webhook Secret

Run this command on your local machine to generate a secure webhook secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Save this secret** - you'll need it for both WordPress and backend `.env.local`.

**Example output**:
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

---

## Step 3: Configure Webhook in Contact Form 7

Navigate to: **Contact Forms** → **Your Form** → **Integration** → **Webhooks**

### Webhook Settings

**Webhook URL**:
```
https://your-backend-domain.com/api/webhooks/form-submission
```

**Method**: `POST`

**Content-Type**: `application/json`

### Body Template

Map your form fields to the expected JSON structure:

```json
{
  "name": "[your-name]",
  "email": "[your-email]",
  "phone": "[your-phone]",
  "hoa_name": "[hoa-name]",
  "project_type": "[project-type]",
  "estimated_amount": "[estimated-amount]",
  "project_urgency": "[project-urgency]",
  "current_reserve_fund": "[current-reserve-fund]",
  "special_assessment_concerns": "[special-assessment-concerns]",
  "message": "[your-message]",
  "form_id": "cf7-contact",
  "form_title": "HOA Financing Inquiry",
  "source_url": "[_url]",
  "timestamp": "[_time]"
}
```

**Important**: Replace the bracketed field names with your actual Contact Form 7 field names.

---

## Step 4: Add HMAC Signature Function to WordPress

Add this code to your WordPress theme's `functions.php` file:

**Location**: `Appearance` → `Theme Editor` → `functions.php`

```php
<?php
/**
 * Add HMAC signature to Contact Form 7 webhook for security
 *
 * This ensures only your WordPress site can submit leads to your backend
 */
add_filter('wpcf7_webhook_body', 'add_webhook_signature', 10, 2);

function add_webhook_signature($body, $submission) {
    // IMPORTANT: Replace with your actual webhook secret
    // Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
    $webhook_secret = 'PASTE_YOUR_WEBHOOK_SECRET_HERE';

    // Calculate HMAC SHA-256 signature
    $signature = hash_hmac('sha256', json_encode($body), $webhook_secret);

    // Add signature to webhook body
    $body['signature'] = $signature;

    return $body;
}
?>
```

**Security Note**: Never commit this webhook secret to version control. Store it securely.

---

## Step 5: Add Webhook Secret to Backend

Add the same webhook secret to your backend `.env.local` file:

**Location**: `c:\Users\SPilcher\OpenClaw2.0 for linux\server\.env.local`

```bash
# Webhook Security (use same secret as WordPress functions.php)
WEBHOOK_SECRET=PASTE_YOUR_WEBHOOK_SECRET_HERE
```

---

## Step 6: Add SendGrid Credentials

Add your SendGrid API credentials to `.env.local`:

```bash
# SendGrid (Email Service Provider)
SENDGRID_API_KEY=SG.your_api_key_here
SENDGRID_LIST_ID=your_list_id_here
```

**Get these values**:
1. Sign up at https://sendgrid.com (free tier: 100 emails/day)
2. Create API key: **Settings** → **API Keys** → **Create API Key** (Full Access)
3. Create contact list: **Marketing** → **Contacts** → **Create List** → "HOA Leads"
4. Get list ID: Click list → URL shows ID

---

## Step 7: Add Telegram Credentials

Add your Telegram bot credentials to `.env.local`:

```bash
# Telegram Notifications
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789
```

**Get these values**:
1. Open Telegram, message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Name: "HOA Lead Alerts" (or similar)
4. Username: `hoa_lead_alerts_bot` (must end in `_bot`)
5. Copy bot token from BotFather's response
6. Send any message to your new bot
7. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
8. Find `"chat":{"id":123456789}` and copy that number

---

## Step 8: Restart Backend Server

Restart your backend server to load the new webhook route:

```bash
# Kill existing server process
powershell -Command "Get-NetTCPConnection -LocalPort 3001 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }"

# Start server
cd "c:\Users\SPilcher\OpenClaw2.0 for linux\server"
node index.js
```

Or if using a process manager like PM2:
```bash
pm2 restart backend
```

---

## Step 9: Test Webhook Endpoint

Test that your webhook endpoint is active:

```bash
curl https://your-backend-domain.com/api/webhooks/test
```

**Expected Response**:
```json
{
  "message": "Webhook endpoint is active",
  "timestamp": "2026-02-13T10:30:00.000Z",
  "configured": true
}
```

If `configured: false`, check that `WEBHOOK_SECRET` is set in `.env.local`.

---

## Step 10: Test Form Submission

1. Go to www.hoaprojectfunding.com/contact
2. Fill out the form with test data
3. Submit the form
4. Check your backend logs for: `[Webhook] New lead received:`
5. Check Telegram for lead notification
6. Check `data/leads/hot-leads.json` for logged lead

**If webhook fails**:
- Check WordPress → Contact Form → Mail tab for error messages
- Check backend server logs for error details
- Verify HMAC signature matches between WordPress and backend
- Test signature generation manually (see below)

---

## Troubleshooting

### Test HMAC Signature Manually

**Generate test signature** (replace secret with your actual secret):

```bash
echo -n '{"name":"Test User","email":"test@example.com"}' | openssl dgst -sha256 -hmac "YOUR_WEBHOOK_SECRET"
```

**Send test webhook**:

```bash
curl -X POST https://your-backend-domain.com/api/webhooks/form-submission \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: <signature_from_above>" \
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

**Expected Response**:
```json
{
  "success": true,
  "lead_id": "uuid",
  "score": "hot",
  "priority": "high",
  "esp_added": true,
  "telegram_sent": true,
  "follow_up_drafted": true
}
```

### Common Issues

**401 Error: Invalid webhook signature**
- Double-check webhook secret matches in both WordPress `functions.php` and `.env.local`
- Ensure no extra whitespace in secret
- Verify WordPress is sending signature in request body

**503 Error: Webhook secret not configured**
- Check `.env.local` has `WEBHOOK_SECRET` set
- Restart backend server after adding secret

**400 Error: Invalid form data**
- Check form field names match body template
- Verify all required fields (name, email, hoa_name) are present

**SendGrid Integration Failed**
- Verify `SENDGRID_API_KEY` and `SENDGRID_LIST_ID` are correct
- Check SendGrid API key has "Full Access" permissions
- Verify list ID exists in SendGrid dashboard

**Telegram Not Sending**
- Verify `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are correct
- Make sure you've sent at least one message to your bot
- Test with: `curl https://api.telegram.org/bot<TOKEN>/getMe`

---

## Form Field Mapping Reference

Your Contact Form 7 form should include these fields:

| Backend Field | CF7 Field Name | Type | Required |
|--------------|----------------|------|----------|
| `name` | `[your-name]` | text | ✅ |
| `email` | `[your-email]` | email | ✅ |
| `phone` | `[your-phone]` | tel | |
| `hoa_name` | `[hoa-name]` | text | ✅ |
| `project_type` | `[project-type]` | select | |
| `estimated_amount` | `[estimated-amount]` | number | |
| `project_urgency` | `[project-urgency]` | select | |
| `current_reserve_fund` | `[current-reserve-fund]` | number | |
| `special_assessment_concerns` | `[special-assessment-concerns]` | checkbox | |
| `message` | `[your-message]` | textarea | |

**Project Type Options**:
- `roof_replacement`
- `pool_renovation`
- `parking_lot`
- `elevator_repair`
- `siding_replacement`
- `hvac_system`
- `landscaping`
- `other`

**Project Urgency Options**:
- `immediate`
- `within_3_months`
- `within_6_months`
- `within_year`
- `planning`

---

## Security Considerations

✅ **HMAC signature verification** prevents unauthorized submissions
✅ **HTTPS required** for webhook URL (never use HTTP)
✅ **Secret rotation** - rotate webhook secret every 90 days
✅ **Rate limiting** - backend has built-in rate limiting on `/api` routes
✅ **Input validation** - all form data validated with Zod schemas
✅ **No auto-execution** - all responses are DRAFTS requiring manual approval

---

## Next Steps

After webhook is working:

1. **Set up SendGrid automation** - Configure 6-email nurture sequence in SendGrid
2. **Create custom fields** - Add custom fields in SendGrid for hoa_name, project_type, etc.
3. **Monitor lead quality** - Check `data/leads/hot-leads.json` daily
4. **Review follow-up drafts** - Check `data/leads/drafts/` for hot lead emails
5. **Track conversion rates** - Monitor which lead sources convert best

---

**Questions or Issues?**
Email: steve.j.pilcher@gmail.com
