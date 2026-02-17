# HOA Outreach Drafter (Agent 4)

**Agent ID:** `hoa-outreach-drafter`
**Purpose:** Generate personalized outreach emails for enriched HOT/WARM leads
**Cost:** ~$0.50/month (template-based, minimal LLM usage)
**Schedule:** Runs automatically when leads are enriched

---

## Mission

Draft personalized outreach email sequences for HOT and WARM leads that have been enriched with contact information. Uses 5 scenario-based templates that reference exact quotes from meeting minutes. Creates 3-email sequences (initial + 2 follow-ups) for human review and approval.

---

## Email Scenarios (5 Templates)

### 1. Special Assessment Mentioned
**When to use:** Signal keywords include "special assessment"
**Key angle:** Offer alternative to special assessment
**Subject:** "Alternative to Special Assessment - {{hoa_name}}"
**Talking points:**
- Avoid political challenges of special assessments
- Spread costs over 5-10 years
- Preserve homeowner cash flow

### 2. Reserve Fund Deficiency
**When to use:** Signal keywords include "reserve fund deficiency", "underfunded reserves"
**Key angle:** Bridge funding while reserves rebuild
**Subject:** "Reserve Funding Solution - {{hoa_name}}"
**Talking points:**
- Cover immediate capital needs
- Give reserve fund time to rebuild
- Avoid shocking homeowners with steep dues increases

### 3. Compliance Trigger (SB 326/721/SIRS)
**When to use:** Signal keywords include "SB 326", "SB 721", "SIRS", "milestone inspection"
**Key angle:** Fast funding to meet compliance deadlines
**Subject:** "Compliance Deadline Financing - {{hoa_name}}"
**Talking points:**
- Funding in 2-3 weeks (faster than most lenders)
- No homeowner vote required
- Avoid fines and insurance non-renewals

### 4. Active Capital Project
**When to use:** Project types detected (roofing, painting, paving, etc.)
**Key angle:** Flexible financing for planned projects
**Subject:** "Financing for {{project_type}} - {{hoa_name}}"
**Talking points:**
- Preserve reserve funds for emergencies
- Spread costs over useful life of improvement
- Avoid special assessments or dues increases

### 5. General Capital Needs
**When to use:** Fallback when no specific scenario matches
**Key angle:** General education on financing options
**Subject:** "Capital Project Financing - {{hoa_name}}"
**Talking points:**
- Help understand all funding options
- Case studies from similar associations
- Typical project sizes and terms

---

## Email Sequence Structure

### Email 1: Initial Outreach (Day 0)
**Goal:** Introduce yourself, reference specific meeting minutes, offer value
**Length:** 150-200 words
**Call to action:** 15-minute call
**Key elements:**
- Personal greeting using first name
- Specific quote from their meeting minutes
- 3 bullet points of value proposition
- Soft ask for brief call

### Email 2: Follow-Up (Day 3)
**Goal:** Add urgency, ask clarifying question, share case study
**Length:** 100-150 words
**Call to action:** Answer question or schedule call
**Key elements:**
- Reference previous email
- Ask about their timeline or current plan
- Offer specific resource (case study, analysis)
- Make it easy to respond

### Email 3: Final Follow-Up (Day 7)
**Goal:** Last chance, share success story, offer 10-minute call
**Length:** 75-125 words
**Call to action:** Quick 10-minute call
**Key elements:**
- Acknowledge they're busy
- Share specific example from similar HOA
- Ultra-short time ask (10 minutes)
- Make it easy to decline

---

## Personalization Variables

All emails include these dynamic variables:
- `{{hoa_name}}` - Full HOA name
- `{{contact_name}}` - First name only (e.g., "John")
- `{{contact_full_name}}` - Full name (e.g., "John Smith")
- `{{contact_title}}` - Title (e.g., "Board President")
- `{{city}}` - HOA city
- `{{state}}` - HOA state (2-letter code)
- `{{project_type}}` - Detected project type (e.g., "roof replacement")
- `{{signal_quote}}` - Exact quote from meeting minutes
- `{{compliance_type}}` - Specific compliance trigger (SB 326, SIRS, etc.)
- `{{similar_hoa_count}}` - Number of similar HOAs helped
- `{{similar_hoa_example}}` - Example HOA name from same city
- `{{min_loan}}` - Estimated min loan size (unit_count × $2,000)
- `{{max_loan}}` - Estimated max loan size (unit_count × $10,000)
- `{{sender_name}}` - Your name
- `{{sender_title}}` - Your title
- `{{sender_phone}}` - Your phone number

---

## Input Parameters

```json
{
  "limit": 10,
  "tier": "HOT"
}
```

**Defaults:**
- `limit`: 10 leads per run
- `tier`: null (drafts for all HOT and WARM leads)

**Selection logic:**
- Only drafts for leads with `contact_enrichment_status = 'complete'` (email found)
- Only drafts for leads with `outreach_status = 'pending'` (not yet drafted)
- Prioritizes by score DESC (highest quality leads first)

---

## Process Flow

### 1. Select Leads Ready for Outreach
```sql
SELECT id FROM scored_leads
WHERE contact_enrichment_status = 'complete'
  AND outreach_status = 'pending'
ORDER BY score DESC, created_at ASC
LIMIT 10
```

### 2. Select Best Template
Priority order:
1. **Special Assessment** (if "special assessment" in signal summary)
2. **Reserve Deficiency** (if "reserve fund deficiency" or "underfunded" in signal summary)
3. **Compliance Trigger** (if "SB 326", "SB 721", "SIRS" in signal summary)
4. **Active Project** (if project_types array has values)
5. **General** (fallback)

### 3. Personalize Template
- Extract HOA details, contact info, scan signals
- Replace all {{variables}} with actual data
- Generate 3-email sequence with appropriate delays (0, 3, 7 days)

### 4. Save Drafts to Database
Save each email to `outreach_queue` table:
- hoa_id, lead_id, contact_id
- template_scenario (which template was used)
- subject, body
- sequence_number (1, 2, or 3)
- send_delay_days (0, 3, or 7)
- status: 'draft' (awaiting human approval)

### 5. Update Lead Status
```sql
UPDATE scored_leads
SET outreach_status = 'drafted',
    last_updated = datetime('now')
WHERE id = ?
```

---

## Output Example

**Successful Draft:**
```
📝 Waterfront HOA, Sarasota, FL (HOT lead, 69 points)

  ✅ Drafted 3-email sequence
  📧 To: robert.williams@waterfronthoa.org
  📋 Scenario: Special Assessment Mentioned

  Email 1: "Alternative to Special Assessment - Waterfront HOA"
  Email 2: Follow-up (send in 3 days)
  Email 3: Final follow-up (send in 7 days)

NEXT STEPS:
  1. Review drafts in /hoa-outreach-queue page
  2. Edit if needed (improve subject lines, adjust tone)
  3. Approve for sending
  4. System will send on schedule (or manual send)
```

---

## Success Metrics

**Daily Run (10 leads drafted):**
- Expected drafts: 10 (if 10 enriched leads available)
- Time per draft: ~0.1 seconds (template-based, no LLM needed)
- Total time: ~1 second

**Monthly Totals:**
- HOT leads drafted: 45-81 (from enriched HOT leads)
- WARM leads drafted: 48-108 (from enriched WARM leads)
- Total email drafts: 279-567 (93-189 leads × 3 emails each)
- Ready for approval: 93-189 sequences

**Conversion Funnel (HOT leads only):**
- Drafts created: 100%
- Human approves: 80-90% (some need editing)
- Emails sent: 80-90%
- Email opens: 20-30% (typical B2B)
- Email responses: 3-5%
- Response → Qualified: 30%
- Qualified → Closed: 20%

**Expected deals per month:** 1-2 from HOT leads alone

---

## Special Handler

This agent uses a **special handler** (pure Node.js templates, no LLM):

**File:** `server/services/hoaOutreachDrafter.js`
**Function:** `draftMultipleOutreach(params)`

**Why special handler:**
- Template-based email generation (deterministic)
- No LLM needed for basic personalization
- Fast (0.1s per draft vs 2-3s for LLM)
- Cost: $0 in template mode

**Future enhancement:**
- Optional LLM mode: Use GPT-4o to improve subject lines and add creative touches
- Cost: ~$0.01 per draft if LLM enabled
- Monthly: $0.50 if LLM used for 50 drafts

---

## Testing

```bash
# Draft outreach for 5 HOT leads
node scripts/run-outreach-drafter.js --limit=5 --tier=HOT

# Draft outreach for all enriched leads
node scripts/run-outreach-drafter.js --limit=50

# View drafts in database
node -e "const initSqlJs = require('sql.js'); const fs = require('fs'); (async () => { const SQL = await initSqlJs(); const db = new SQL.Database(fs.readFileSync('hoa_leads.sqlite')); const stmt = db.prepare('SELECT * FROM outreach_queue WHERE status = \"draft\" ORDER BY created_at DESC'); while (stmt.step()) { const row = stmt.getAsObject(); console.log(row); } stmt.free(); db.close(); })();"

# View outreach status by lead
node -e "const initSqlJs = require('sql.js'); const fs = require('fs'); (async () => { const SQL = await initSqlJs(); const db = new SQL.Database(fs.readFileSync('hoa_leads.sqlite')); const stmt = db.prepare('SELECT outreach_status, COUNT(*) as count FROM scored_leads GROUP BY outreach_status'); console.log('Outreach Status:'); while (stmt.step()) { const r = stmt.getAsObject(); console.log(`  ${r.outreach_status}: ${r.count}`); } stmt.free(); db.close(); })();"
```

---

## Database Tables

### outreach_queue (new records created)
- id, hoa_id, lead_id, contact_id
- template_scenario (which scenario was used)
- subject, body
- sequence_number (1, 2, or 3)
- send_delay_days (0, 3, or 7)
- status ('draft', 'approved', 'sent', 'opened', 'replied')
- scheduled_send_at (calculated from send_delay_days)
- sent_at, opened_at, replied_at
- created_at

### scored_leads (status updates)
- outreach_status: 'pending' → 'drafting' → 'drafted' → 'sent' → 'replied' or 'no_response'
- last_updated: timestamp of status change

---

## Email Best Practices

**Subject Lines:**
- Keep under 50 characters
- Include HOA name for personalization
- Avoid spam words ("free", "guaranteed", "act now")
- Use specific benefits (e.g., "Alternative to Special Assessment")

**Email Body:**
- Start with first name only (more personal)
- Reference their specific situation in paragraph 1
- Use bullet points for value propositions
- Keep total length under 200 words
- Single clear call-to-action
- Professional signature with phone number

**Follow-Ups:**
- Don't apologize for following up
- Add new information in each email
- Ask a question (easier to respond to)
- Reference specific examples or case studies
- Make time ask smaller with each email (15 min → 10 min)

**CAN-SPAM Compliance:**
- Include sender's physical address (add to signature)
- Add unsubscribe link (required for bulk emails)
- Use accurate subject lines (no deception)
- Honor opt-outs within 10 business days

---

## Future Enhancements

**Phase 1 (Current):**
- ✅ Template-based generation
- ✅ 5 scenario templates
- ✅ 3-email sequences
- ✅ Variable substitution
- ✅ Draft saved to database

**Phase 2 (Future):**
- ⏭️ LLM-enhanced subject lines (optional, +$0.01/draft)
- ⏭️ A/B testing of different templates
- ⏭️ Personalized opening sentences (LLM-generated)
- ⏭️ Sentiment analysis of meeting minutes for tone matching

**Phase 3 (Future):**
- ⏭️ Email sending integration (SendGrid, Mailgun)
- ⏭️ Open/click tracking
- ⏭️ Auto-scheduling of follow-ups
- ⏭️ Reply detection and routing

---

## Human Review Process

**Why human approval is required:**
1. Legal compliance (CAN-SPAM, state-specific regulations)
2. Brand consistency (tone, messaging)
3. Accuracy verification (ensure quotes are relevant)
4. Relationship management (some leads may need custom approach)
5. Quality control (catch template bugs or weird variable substitutions)

**What humans should review:**
- Subject line effectiveness
- Quote relevance (is it actually about the stated project?)
- Tone match (formal vs. casual based on HOA type)
- Call-to-action clarity
- Sender signature and contact info

**Expected approval rate:** 80-90%
**Time to review:** 30-60 seconds per 3-email sequence

---

Last updated: February 17, 2026
Agent Status: ✅ Operational (template mode)
Cost: $0/month (template mode), $0.50/month (optional LLM mode)
Human approval: Required before sending
