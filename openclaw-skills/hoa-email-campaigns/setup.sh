#!/bin/bash
# Setup script for HOA Email Marketing Campaigns skill

set -e

WORKSPACE_DIR="/home/sjpilche/projects/openclaw-v1/workspaces/hoa-email-campaigns"
AGENT_ID="hoa-email-campaigns"

echo "🏗️  Setting up HOA Email Marketing Campaigns skill..."
echo ""

# 1. Create workspace directory structure
echo "📁 Creating workspace directories..."
mkdir -p "$WORKSPACE_DIR/sequences"
mkdir -p "$WORKSPACE_DIR/newsletters"
mkdir -p "$WORKSPACE_DIR/templates"
mkdir -p "$WORKSPACE_DIR/metrics"
mkdir -p "$WORKSPACE_DIR/logs"
cd "$WORKSPACE_DIR"

# 2. Copy SOUL.md
echo "📝 Creating SOUL.md..."
if [ -f "/mnt/c/Users/SPilcher/OpenClaw2.0 for linux/openclaw-skills/hoa-email-campaigns/SOUL.md" ]; then
  cp "/mnt/c/Users/SPilcher/OpenClaw2.0 for linux/openclaw-skills/hoa-email-campaigns/SOUL.md" SOUL.md
else
  echo "⚠️  SOUL.md not found at expected location"
fi

# 3. Create TOOLS.md
echo "🔧 Creating TOOLS.md..."
cat > TOOLS.md << 'ENDTOOLS'
# TOOLS.md - HOA Email Marketing Campaigns

## Email Service Provider APIs

### Mailchimp API

**Required env variables**:
- `MAILCHIMP_API_KEY` - Your Mailchimp API key
- `MAILCHIMP_SERVER_PREFIX` - Server prefix (e.g., us1, us2)
- `MAILCHIMP_LIST_ID` - Audience list ID

**Create campaign**:
```bash
curl -X POST "https://${MAILCHIMP_SERVER_PREFIX}.api.mailchimp.com/3.0/campaigns" \
  -u "anystring:${MAILCHIMP_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "regular",
    "recipients": {"list_id": "'${MAILCHIMP_LIST_ID}'"},
    "settings": {
      "subject_line": "Subject Line",
      "from_name": "HOA Project Funding",
      "reply_to": "contact@hoaprojectfunding.com"
    }
  }'
```

**Add subscriber to list**:
```bash
curl -X POST "https://${MAILCHIMP_SERVER_PREFIX}.api.mailchimp.com/3.0/lists/${MAILCHIMP_LIST_ID}/members" \
  -u "anystring:${MAILCHIMP_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "email_address": "contact@example.com",
    "status": "subscribed",
    "merge_fields": {"FNAME": "John", "LNAME": "Doe"}
  }'
```

---

### SendGrid API

**Required env variables**:
- `SENDGRID_API_KEY` - Your SendGrid API key

**Create campaign**:
```bash
curl -X POST "https://api.sendgrid.com/v3/marketing/campaigns" \
  -H "Authorization: Bearer ${SENDGRID_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Newsletter 2026-03-05",
    "send_to": {"list_ids": ["list-id"]},
    "email_config": {
      "subject": "Subject Line",
      "html_content": "<html>...</html>",
      "sender_id": 12345
    }
  }'
```

**Add contact to list**:
```bash
curl -X PUT "https://api.sendgrid.com/v3/marketing/contacts" \
  -H "Authorization: Bearer ${SENDGRID_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "contacts": [{
      "email": "contact@example.com",
      "first_name": "John",
      "last_name": "Doe"
    }]
  }'
```

---

### ConvertKit API

**Required env variables**:
- `CONVERTKIT_API_SECRET` - Your ConvertKit API secret

**Add subscriber to sequence**:
```bash
curl -X POST "https://api.convertkit.com/v3/sequences/${SEQUENCE_ID}/subscribe" \
  -H "Content-Type: application/json" \
  -d '{
    "api_secret": "'${CONVERTKIT_API_SECRET}'",
    "email": "contact@example.com",
    "first_name": "John"
  }'
```

**Create broadcast**:
```bash
curl -X POST "https://api.convertkit.com/v3/broadcasts" \
  -H "Content-Type: application/json" \
  -d '{
    "api_secret": "'${CONVERTKIT_API_SECRET}'",
    "subject": "Subject Line",
    "content": "<html>...</html>",
    "description": "Newsletter 2026-03-05"
  }'
```

---

### ActiveCampaign API

**Required env variables**:
- `ACTIVECAMPAIGN_API_URL` - Your account URL (e.g., https://youraccountname.api-us1.com)
- `ACTIVECAMPAIGN_API_KEY` - Your ActiveCampaign API key

**Create contact**:
```bash
curl -X POST "${ACTIVECAMPAIGN_API_URL}/api/3/contacts" \
  -H "Api-Token: ${ACTIVECAMPAIGN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "contact": {
      "email": "contact@example.com",
      "firstName": "John",
      "lastName": "Doe"
    }
  }'
```

**Add contact to automation**:
```bash
curl -X POST "${ACTIVECAMPAIGN_API_URL}/api/3/contactAutomations" \
  -H "Api-Token: ${ACTIVECAMPAIGN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "contactAutomation": {
      "contact": "1",
      "automation": "1"
    }
  }'
```

---

## Email Templates

**Responsive HTML email template** (basic):
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; }
    .content { padding: 20px; background: #ffffff; }
    .button { display: inline-block; padding: 12px 24px; background: #0066cc; color: #ffffff; text-decoration: none; border-radius: 4px; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>HOA Project Funding</h1>
    </div>
    <div class="content">
      [EMAIL CONTENT]
      <p><a href="[CTA_LINK]" class="button">[CTA_TEXT]</a></p>
    </div>
    <div class="footer">
      <p>HOA Project Funding | www.hoaprojectfunding.com</p>
      <p><a href="[UNSUBSCRIBE_LINK]">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>
```

---

## Metrics Tracking

**Track email opens** (via pixel):
```html
<img src="https://yourdomain.com/track/open?email_id=123&contact_id=456" width="1" height="1" alt="" />
```

**Track link clicks**:
```bash
# Use URL shortener or tracking parameter
https://hoaprojectfunding.com/blog/post?utm_source=email&utm_medium=email&utm_campaign=nurture_email_3
```

**Log to metrics file**:
```bash
cat > metrics/email-performance.json << EOF
{
  "date": "2026-02-13",
  "emails": {
    "email_1_welcome": {
      "sent": 42,
      "opens": 19,
      "clicks": 3,
      "open_rate": 45.2,
      "click_rate": 7.1
    }
  }
}
EOF
```

---

## Markdown to HTML Conversion

**Simple conversion**:
```bash
# Headers
sed 's/^# \(.*\)/<h1>\1<\/h1>/g'
sed 's/^## \(.*\)/<h2>\1<\/h2>/g'

# Bold
sed 's/\*\*\([^*]*\)\*\*/<strong>\1<\/strong>/g'

# Links
sed 's/\[\([^]]*\)\](\([^)]*\))/<a href="\2">\1<\/a>/g'

# Paragraphs
sed 's/^\([^<].*\)$/<p>\1<\/p>/g'
```

**Better: Use pandoc** (if available):
```bash
echo "Markdown content" | pandoc -f markdown -t html
```
ENDTOOLS

# 4. Create example email sequences
echo "📧 Creating email sequence templates..."

# Email 1: Welcome
cat > sequences/email-1-welcome.md << 'ENDEMAIL1'
---
sequence_position: 1
trigger: day_0
subject_a: "Welcome to HOA Project Funding + Your Free Guide"
subject_b: "Thanks for reaching out! Here's what happens next..."
---

Hi [First Name],

Welcome to HOA Project Funding! We're glad you're here.

Whether your HOA is planning a major capital project, dealing with deferred maintenance, or just exploring financing options to avoid special assessments, you're in the right place.

Here's what you can expect from us:

✅ Educational resources to help your board make informed decisions
✅ Real-world case studies and success stories
✅ Transparent guidance on HOA financing options (no sales pressure)
✅ Expert answers to your specific questions

TO GET STARTED:

Download your free guide: "The HOA Board Member's Guide to Project Financing"
→ [Download Guide Button]

This 15-page guide covers:
• How HOA project financing works
• When financing makes more sense than special assessments
• Types of financing available (reserve fund loans, bonds, lines of credit)
• What lenders look for when evaluating HOA applications
• Real-world examples with numbers

HAVE QUESTIONS?

Just reply to this email — I personally read and respond to every message.

Looking forward to helping your community fund its next project!

Best,
[Your Name]
Founder, HOA Project Funding
www.hoaprojectfunding.com

P.S. Over the next few weeks, I'll send you helpful articles about HOA financing, case studies, and answers to common questions. If you ever want to chat about your specific situation, just hit reply.
ENDEMAIL1

# Email 2: Educational
cat > sequences/email-2-educational.md << 'ENDEMAIL2'
---
sequence_position: 2
trigger: day_3
subject_a: "5 Signs Your HOA Needs Project Financing (Not Special Assessments)"
subject_b: "Is your HOA facing one of these 5 challenges?"
---

Hi [First Name],

Special assessments are often the first solution boards consider when facing a major capital project. But they're not always the right choice — especially if your community has residents on fixed incomes.

Here are 5 signs your HOA should explore project financing instead:

1. **Aging Infrastructure Catching Up**
   Your roof is 20+ years old, the pool needs resurfacing, or the parking lot is crumbling. One large project is manageable; multiple deferred projects hitting at once? That's when financing makes sense.

2. **Reserve Fund Depletion**
   If your reserves are below 50% funded, a major project could wipe them out entirely — leaving you vulnerable to emergencies.

3. **Homeowner Resistance to Special Assessments**
   A $5,000 special assessment may be manageable for some owners, but devastating for retirees or families already stretched thin. Financing spreads the cost into manageable monthly increases.

4. **Upcoming Multi-Phase Project**
   Planning a phased pool renovation or building repairs over 2-3 years? A line of credit gives you flexibility without repeated special assessments.

5. **Board Wants to Preserve Reserves**
   Smart boards keep reserves intact for true emergencies while financing planned capital improvements.

If any of these sound familiar, let's talk about your options.

→ [Book a Free Consultation]

Best,
[Your Name]
HOA Project Funding

P.S. Want to see how other HOAs have navigated this? I'll share a detailed case study in my next email.
ENDEMAIL2

# Email 3: Case Study
cat > sequences/email-3-case-study.md << 'ENDEMAIL3'
---
sequence_position: 3
trigger: day_7
subject_a: "How Oakwood HOA Funded a $350K Roof Project Without Special Assessments"
subject_b: "Case Study: $350K Project, Zero Special Assessments"
---

Hi [First Name],

I wanted to share a success story that might resonate with your board.

THE CHALLENGE:

Oakwood Homeowners Association (142 units, built 2001) faced a critical decision: their 20-year-old roof was failing, and quotes were coming in around $350,000.

The board's initial plan was a $2,500 special assessment per unit. But they knew this would create financial hardship for many residents — especially retirees on fixed incomes.

THE SOLUTION:

Instead, Oakwood secured a $350,000 reserve fund loan at 6.2% over 10 years.

• Monthly payment: $3,890 (absorbed into regular assessments)
• Per-unit impact: $27.50/month increase
• Special assessment: $0

THE OUTCOME:

✅ No homeowner faced a surprise $2,500 bill
✅ Monthly assessments increased by less than $30
✅ Project completed on time, with quality materials
✅ Reserve fund remained intact for future emergencies

"This was a game-changer for our community. Instead of shocking residents with a $2,500 bill, we spread the cost over time with a manageable monthly increase. It was the right decision." — Sarah M., Board President

COULD THIS WORK FOR YOUR HOA?

If your association is facing a similar situation (capital project + reluctance to levy special assessments), let's chat.

→ [Book a Free Consultation]

We'll review your project, reserve balance, and budget to explore your best options — with zero obligation.

Best,
[Your Name]
HOA Project Funding

P.S. Want to see the full case study with detailed numbers? [Read the full breakdown here]
ENDEMAIL3

# 5. Create newsletter template
cat > templates/newsletter-template.md << 'ENDNEWSLETTER'
---
type: weekly_newsletter
send_schedule: "tuesday_10am_est"
---

Subject: HOA Finance Insights — [Featured Topic]

---

Hi [First Name],

[Brief introduction — what's in this week's newsletter]

📰 FEATURED ARTICLE
[Latest blog post title]
[2-3 sentence summary highlighting key takeaway]
→ Read full article: [link]

📊 RECENT POSTS
• [Blog post 2 title] — [1-sentence summary]
• [Blog post 3 title] — [1-sentence summary]

💡 TIP OF THE WEEK
[One actionable tip in 2-3 sentences]

---

Questions? Reply to this email — we read and respond to every message.

Best,
[Your Name]
HOA Project Funding
www.hoaprojectfunding.com
ENDNEWSLETTER

# 6. Create re-engagement sequence
cat > sequences/reengagement-1.md << 'ENDREENGAGE'
---
sequence_type: reengagement
trigger: "30_days_no_open"
subject_a: "Are you still there, [First Name]?"
subject_b: "Should we keep sending these emails?"
---

Hi [First Name],

I noticed you haven't opened our emails in a while, and I wanted to check in.

Are these emails still helpful? Or should we take you off the list?

No hard feelings either way — we only want to send emails to people who find them valuable.

→ [Yes, keep sending!]
→ [No, unsubscribe]

If you click "Yes," I'll make sure you get our best content about HOA financing, case studies, and helpful resources.

Thanks for letting me know!

Best,
[Your Name]
ENDREENGAGE

# 7. Initialize metrics file
echo "📊 Creating metrics structure..."
cat > metrics/email-performance.json << 'ENDMETRICS'
{
  "sequences": {
    "nurture": {
      "email_1_welcome": {"sent": 0, "opens": 0, "clicks": 0},
      "email_2_educational": {"sent": 0, "opens": 0, "clicks": 0},
      "email_3_case_study": {"sent": 0, "opens": 0, "clicks": 0},
      "email_4_comparison": {"sent": 0, "opens": 0, "clicks": 0},
      "email_5_faq": {"sent": 0, "opens": 0, "clicks": 0},
      "email_6_cta": {"sent": 0, "opens": 0, "clicks": 0}
    },
    "reengagement": {
      "triggered": 0,
      "reactivated": 0,
      "unsubscribed": 0
    }
  },
  "newsletters": {
    "sent": 0,
    "avg_open_rate": 0,
    "avg_click_rate": 0
  }
}
ENDMETRICS

# 8. Create logs
touch logs/email-activity.log

# 9. Register agent with OpenClaw
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
echo "1. Choose your ESP (Email Service Provider):"
echo "   - Mailchimp (recommended for beginners)"
echo "   - SendGrid (developer-friendly)"
echo "   - ConvertKit (simple automation)"
echo "   - ActiveCampaign (most powerful)"
echo ""
echo "2. Configure ESP credentials in .env.local:"
echo "   EMAIL_ESP=mailchimp  # or sendgrid, convertkit, activecampaign"
echo "   MAILCHIMP_API_KEY=your_api_key"
echo "   MAILCHIMP_SERVER_PREFIX=us1"
echo "   MAILCHIMP_LIST_ID=your_list_id"
echo ""
echo "3. Generate email sequences:"
echo "   npx openclaw agent --agent $AGENT_ID --local \\"
echo "     --message 'Create the 6-email nurture sequence'"
echo ""
echo "4. Test newsletter generation:"
echo "   npx openclaw agent --agent $AGENT_ID --local \\"
echo "     --message 'Generate this week\\'s newsletter'"
echo ""
echo "5. Schedule automation:"
echo "   npx openclaw cron add \\"
echo "     --agent $AGENT_ID \\"
echo "     --cron '0 10 * * 2' \\"
echo "     --message 'Generate and send weekly newsletter' \\"
echo "     --tz 'America/New_York'"
echo ""
echo "Workspace: $WORKSPACE_DIR"
echo "Email templates: $WORKSPACE_DIR/sequences/"
echo "Newsletter template: $WORKSPACE_DIR/templates/"
