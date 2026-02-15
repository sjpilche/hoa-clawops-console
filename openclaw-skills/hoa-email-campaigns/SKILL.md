# HOA Email Campaigns Agent

OpenClaw agent for managing email sequences and newsletters for HOA Project Funding (www.hoaprojectfunding.com).

## Purpose

This agent manages three email sequences to nurture leads and stay top-of-mind with HOA boards and property managers:

1. **Application Abandonment Follow-Up** (3 emails) - Re-engages contacts who start but don't complete the loan application
2. **Post-Consult Follow-Up** (4 emails) - Nurtures relationships after free phone/email consultations
3. **Monthly Newsletter** (ongoing) - Keeps past contacts engaged for future projects and referrals

## Business Context

**HOA Project Funding** is a loan brokerage connecting HOA boards with lenders for capital improvement projects.

**Conversion Goals:**
- Primary: Full loan application form at www.hoaprojectfunding.com/#apply
- Secondary: Free 15-minute consult at www.hoaprojectfunding.com/#consult

**Critical:** There is NO lead magnet, NO downloadable PDF, NO email signup form. All CTAs point directly to the application or free consult.

## Email Sequences

### 1. Application Abandonment Follow-Up

**Trigger:** Webhook notification when someone starts but doesn't complete the application form

**Emails:** 3 (Days 1, 3, 7 after abandonment)

**Purpose:** Remind and encourage completion without being pushy

**Required Data from Webhook:**
- Email address
- First name
- HOA name (if provided)
- Project type (if selected)
- Timestamp of abandonment

**Example Webhook Payload:**
```json
{
  "event": "application_abandoned",
  "timestamp": "2026-02-13T14:32:00Z",
  "contact": {
    "email": "boardmember@example.com",
    "first_name": "John",
    "hoa_name": "Sunset Ridge HOA",
    "project_type": "roof_replacement"
  }
}
```

**Email Schedule:**
- Day 1: "Still exploring options for [project type]?" - Gentle reminder with process overview
- Day 3: "Quick question about [HOA name]'s project" - Address common concerns (no credit check, no personal guarantee)
- Day 7: "Here's what happens next" - Final follow-up with clear next steps and free consult option

### 2. Post-Consult Follow-Up

**Trigger:** Manual addition after completing a free consultation with board member or PM

**Emails:** 4 (Days 0, 5, 14, 30 after consult)

**Purpose:** Keep the deal warm, provide additional value, stay engaged through decision timeline

**Required Personalization Data:**
- First name
- HOA name
- Project type discussed
- Estimated project cost (if mentioned)
- Timeline mentioned in consult
- Any specific concerns discussed

**Email Schedule:**
- Day 0: "Great speaking with you about [HOA name]'s [project type]" - Same-day follow-up with next steps
- Day 5: "Financing options for [project type]" - Educational content addressing concerns from consult
- Day 14: "Checking in on [project type]" - Status check, offer to answer questions
- Day 30: "Still here when you're ready" - Final gentle follow-up, shift to monthly newsletter

### 3. Monthly Newsletter

**Trigger:** Automated - First Tuesday of every month at 10:00 AM ET

**Audience:** All past consults, applications, and contacts

**Purpose:** Stay top-of-mind for future projects and referrals

**Content Sections:**
- Blog highlight (most recent or most popular post)
- Board tip (1 actionable insight)
- CTA block (free consult or apply)

**Word Count:** Max 400 words total

**Schedule:** First Tuesday of month, 10:00 AM ET

## Setup Instructions

### Prerequisites

1. **Email Service Provider (ESP) Account**
   - Supported: SendGrid (preferred), Mailchimp, ConvertKit
   - API key from ESP dashboard

2. **Webhook Integration** (for Application Abandonment sequence)
   - Form tracking on www.hoaprojectfunding.com
   - Webhook endpoint to receive abandonment notifications
   - HMAC signature verification for security

3. **Environment Variables** (in `server/.env.local`)
   ```
   # SendGrid (preferred ESP)
   SENDGRID_API_KEY=your_api_key_here
   SENDGRID_LIST_ID=your_contact_list_id_here

   # OR Mailchimp
   MAILCHIMP_API_KEY=your_api_key_here
   MAILCHIMP_LIST_ID=your_list_id_here

   # OR ConvertKit
   CONVERTKIT_API_SECRET=your_api_secret_here

   # Webhook security
   WEBHOOK_SECRET=your_webhook_secret_here
   ```

### Installation

1. **Register the agent with OpenClaw:**
   ```bash
   cd /home/sjpilche/projects/openclaw-v1
   openclaw agents add hoa-email-campaigns
   ```

2. **Configure ESP Integration:**

   For SendGrid:
   ```bash
   # Create contact list "HOA Leads" in SendGrid dashboard
   # Add SENDGRID_API_KEY and SENDGRID_LIST_ID to server/.env.local
   ```

3. **Set up Webhook Endpoint** (for Application Abandonment):

   Add webhook handler to backend:
   ```javascript
   // server/routes/webhooks.js
   app.post('/api/webhooks/application-abandoned',
     verifyWebhookSignature,
     async (req, res) => {
       const { email, first_name, hoa_name, project_type } = req.body.contact;

       // Add to Application Abandonment sequence
       await triggerSequence('application_abandonment', {
         email,
         first_name,
         hoa_name,
         project_type
       });

       res.status(200).json({ received: true });
     }
   );
   ```

4. **Schedule Monthly Newsletter:**
   ```bash
   openclaw cron add \
     --agent hoa-email-campaigns \
     --cron "0 10 1-7 * 2" \
     --message "Generate and send the monthly newsletter to all contacts. Include the latest blog post, one actionable board tip, and clear CTA to application or free consult." \
     --tz "America/New_York" \
     --name "HOA Email - Monthly Newsletter"
   ```

   Note: `0 10 1-7 * 2` = 10:00 AM on the first Tuesday of each month

## Usage

### Triggering Application Abandonment Sequence

**Automated via webhook** (preferred):
```bash
# Webhook automatically triggers when form is abandoned
# No manual action required
```

**Manual trigger** (if webhook not available):
```bash
openclaw agent \
  --agent hoa-email-campaigns \
  --local \
  --session-id "abandon-$(date +%s)" \
  --message "Send Application Abandonment Email 1 to john@example.com. HOA: Sunset Ridge, Project: Roof Replacement"
```

### Triggering Post-Consult Sequence

**Manual trigger after consultation:**
```bash
openclaw agent \
  --agent hoa-email-campaigns \
  --local \
  --session-id "consult-$(date +%s)" \
  --message "Send Post-Consult Follow-Up Email 1 to jane@example.com. HOA: Oakwood Commons, Project: Pool renovation, Cost: $450K, Timeline: Board vote next month, Concerns: Reserve fund impact"
```

### Generating Monthly Newsletter

**Automated via cron** (recommended):
```bash
# Cron job runs automatically on first Tuesday at 10 AM ET
```

**Manual generation:**
```bash
openclaw agent \
  --agent hoa-email-campaigns \
  --local \
  --session-id "newsletter-$(date +%s)" \
  --message "Generate and send the monthly newsletter. Include the latest blog post from hoa-content-writer workspace, one actionable board tip, and CTA to free consult or application."
```

## Email Content Guidelines

### Subject Lines
- Max 50 characters
- Avoid spam triggers ("Free!", "Act now!", "Limited time")
- Personalize when possible: "[First Name]", "[HOA Name]"

### Body Content
- Professional, direct, helpful tone
- Respect busy schedules (board volunteers, PMs work long hours)
- Explain jargon if used (e.g., "special assessment" = one-time fee to homeowners)
- Max 300 words per email (except newsletter: 400 words max)

### CTAs
- Every email must have ONE clear call-to-action
- Primary: Complete application at www.hoaprojectfunding.com/#apply
- Secondary: Book free consult at www.hoaprojectfunding.com/#consult
- NEVER link to lead magnets, downloads, or email signup forms (they don't exist)

### CAN-SPAM Compliance
- Include physical mailing address in footer
- Include clear unsubscribe link
- Honor unsubscribe requests within 10 business days
- "From" name: "HOA Project Funding"
- "Reply-to": contact@hoaprojectfunding.com

## Sequence Configuration

Full sequence configuration is stored in `/workspaces/hoa-email-campaigns/config/sequences-config.json`.

Key settings:
- **Application Abandonment:** Days 1, 3, 7 | CTA: Complete application
- **Post-Consult Follow-Up:** Days 0, 5, 14, 30 | CTA: Start application
- **Monthly Newsletter:** First Tuesday 10 AM ET | CTA: Site visit or consult

## Testing

### Test Application Abandonment Sequence

1. Trigger test webhook:
   ```bash
   curl -X POST http://localhost:3001/api/webhooks/application-abandoned \
     -H "Content-Type: application/json" \
     -d '{
       "event": "application_abandoned",
       "contact": {
         "email": "test@example.com",
         "first_name": "Test",
         "hoa_name": "Test HOA",
         "project_type": "roof_replacement"
       }
     }'
   ```

2. Verify Email 1 is sent within 24 hours
3. Verify Email 2 is sent 3 days later
4. Verify Email 3 is sent 7 days later

### Test Post-Consult Sequence

1. Manually trigger sequence:
   ```bash
   openclaw agent \
     --agent hoa-email-campaigns \
     --local \
     --session-id "test-consult" \
     --message "Send Post-Consult Email 1 to test@example.com. HOA: Test Community, Project: Test Project, Timeline: Next month"
   ```

2. Verify Day 0 email is sent immediately
3. Verify Day 5 email is scheduled
4. Verify Day 14 and Day 30 emails are scheduled

### Test Monthly Newsletter

1. Manually generate newsletter:
   ```bash
   openclaw agent \
     --agent hoa-email-campaigns \
     --local \
     --session-id "test-newsletter" \
     --message "Generate monthly newsletter with latest blog post and send to test@example.com"
   ```

2. Verify content includes blog highlight, board tip, CTA
3. Verify word count is under 400 words
4. Verify all links point to www.hoaprojectfunding.com

## Conversion Tracking

Track these metrics in ESP dashboard:

- **Email opens** (by sequence and individual email)
- **Link clicks** (application form, free consult, blog)
- **Application fills** (primary conversion)
- **Consult bookings** (secondary conversion)
- **Unsubscribes** (by sequence)

**Attribution:** Last-touch (credit the last email before conversion)

## Common Issues

### Webhook Not Triggering
- Verify webhook endpoint is accessible (not localhost)
- Check HMAC signature verification
- Review webhook logs for errors
- Test with manual curl command

### Emails Not Sending
- Verify ESP API key is valid
- Check ESP account status (not suspended)
- Review ESP sending limits (daily/hourly)
- Check contact list ID is correct

### Low Open Rates
- Review subject lines (avoid spam triggers)
- Check sender reputation in ESP dashboard
- Verify "from" address is authenticated (SPF, DKIM)
- Test send time (Tuesday 10 AM typically works well)

### High Unsubscribe Rate
- Review email frequency (not too aggressive)
- Ensure content provides value (not just sales pitches)
- Check personalization is working (generic emails perform worse)
- Survey unsubscribers for feedback

## Maintenance

### Weekly
- Review open rates and click rates by sequence
- Update email copy if performance drops below baseline
- Check for bounced emails and remove invalid addresses

### Monthly
- Review conversion attribution (which emails drive applications/consults)
- Update newsletter content template based on feedback
- Archive old sequences and contacts per data retention policy

### Quarterly
- Review full funnel: application abandonment rate → email sequence → conversion
- A/B test subject lines and CTAs
- Update sequences based on common objections from consults

## Related Agents

- **hoa-content-writer**: Generates blog posts referenced in newsletter
- **hoa-social-media**: Promotes blog content on Facebook and LinkedIn
- **hoa-lead-capture**: Manages webhook integrations for application abandonment

## Support

For issues or questions:
- Review SOUL.md for agent behavior and tone
- Check sequences-config.json for sequence settings
- Test with manual triggers before debugging webhook
- Review ESP documentation for provider-specific issues
