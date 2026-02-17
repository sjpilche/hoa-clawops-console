# HOA Project Funding - Sales Playbook
## Lead Generation & Outreach Master Guide

**Version 1.0** | Last Updated: February 17, 2026
**Owner**: Sales Team | **System**: ClawOps Console - HOA Contact Finder

---

## Table of Contents

1. [Overview](#overview)
2. [Lead Discovery Process](#lead-discovery-process)
3. [Lead Qualification Criteria](#lead-qualification-criteria)
4. [Contact Workflow](#contact-workflow)
5. [Outreach Scripts](#outreach-scripts)
6. [Objection Handling](#objection-handling)
7. [Compliance Requirements](#compliance-requirements)
8. [Tools & Systems](#tools--systems)
9. [Success Metrics](#success-metrics)
10. [Best Practices](#best-practices)

---

## Overview

### What We Do
HOA Project Funding finances capital improvement projects for homeowners associations. We help HOAs secure funding for:
- Roof replacements ($200K-$2M)
- Elevator modernization ($150K-$800K)
- Pool/clubhouse renovations ($100K-$500K)
- Structural repairs (balconies, facades) ($300K-$3M)
- Parking lot/infrastructure ($150K-$600K)

### Our Competitive Advantage
- **Speed**: 48-hour pre-approvals, 2-3 week closes
- **Flexibility**: No special assessments required, 5-25 year terms
- **Expertise**: HOA-specific financing (not residential mortgages)
- **Service**: White-glove board support, no fees for quotes

### Target Customer Profile
- **Property Type**: Condo associations, townhome HOAs, master-planned communities
- **Size**: 20+ units (ideal: 50-200 units)
- **Location**: California (Phase 1), expanding to CO/FL/TX
- **Project Size**: $100K-$5M (sweet spot: $300K-$1M)
- **Decision Stage**: Identified need, exploring options, budget approved or pending

---

## Lead Discovery Process

### Step 1: Running Searches (Mock Mode)

**What You'll Do:**
1. Navigate to http://localhost:5174/hoa-leads
2. Click "New Search" button
3. Enter target city (e.g., "San Diego", "San Francisco", "Irvine")
4. State defaults to "CA" (only option in Phase 1)
5. Optional: Add zip code for hyper-local targeting
6. Click "Search" button
7. Wait 2-3 seconds for results

**What Happens:**
- System generates 10 mock HOA contacts per search
- Contacts saved to database automatically
- Stats dashboard updates with new totals
- Contacts appear in main grid view

**Best Practice:**
- Search **2-3 cities per day** (Monday-Friday)
- Focus on high-value markets: San Diego, SF, LA, Irvine, Newport Beach
- Use zip codes for luxury areas (e.g., 92037 La Jolla, 90210 Beverly Hills)
- Build systematic coverage: Don't search same city twice in 30 days

### Step 2: Reviewing New Contacts

**Filter for Quality:**
1. Click "Status" dropdown → Select "New"
2. Set confidence filter to ">70%" (high-quality leads)
3. Review each contact card:
   - **HOA Name**: Verify it's a real association (not property management company)
   - **Contact Person**: Look for "President", "Board Member", "Manager" titles
   - **Email**: Check domain (avoid generic Gmail/Yahoo if possible)
   - **Phone**: Presence of phone = higher intent to close
   - **Unit Count**: Larger properties = bigger projects = higher revenue

**Qualification Quick Check:**
```
✅ GOOD LEAD:
- Board member or president
- Professional email domain (@hoaname.com or @managementco.com)
- Phone number present
- 50+ units
- Confidence >80%

❌ SKIP FOR NOW:
- Property manager (not decision-maker)
- Generic email (info@, admin@)
- No contact info
- <20 units
- Confidence <50%
```

### Step 3: Exporting Leads

**When to Export:**
- End of each day (backup your work)
- Before starting outreach campaign (load into CRM)
- Weekly reporting (leadership visibility)

**How to Export:**
1. Apply filters (e.g., Status="New", Confidence>70%, Email present)
2. Click "Export CSV" button (top right)
3. File downloads: `hoa-contacts-2026-02-17.csv`
4. Open in Excel/Google Sheets
5. Import to your CRM (Salesforce, Pipedrive, HubSpot, etc.)

**CSV Columns:**
- HOA Name, Contact Person, Title, Email, Phone
- Address, City, State, Zip, Unit Count
- Management Company, Status, Confidence Score
- Source Type, Source URL, Scraped At, Notes

---

## Lead Qualification Criteria

### Tier 1: Hot Leads (Contact Within 24 Hours)
- ✅ Board president or treasurer identified
- ✅ Professional email + phone
- ✅ 100+ units
- ✅ Confidence >85%
- ✅ Located in high-value zip code
- ✅ Management company is a known player

**Why They're Hot:** Complete information, large property, decision-makers identified

### Tier 2: Warm Leads (Contact Within 3 Days)
- ✅ Board member or manager
- ✅ Email OR phone (one required)
- ✅ 50-99 units
- ✅ Confidence 70-84%
- ✅ Standard market

**Why They're Warm:** Good information, medium property, likely qualified

### Tier 3: Cold Leads (Contact Within 7 Days)
- ⚠️ Property manager (not board)
- ⚠️ Generic email (no phone)
- ⚠️ 20-49 units
- ⚠️ Confidence 50-69%
- ⚠️ Limited information

**Why They're Cold:** Incomplete info, smaller property, may need enrichment

### Disqualify Immediately If:
- ❌ <20 units (too small for our product)
- ❌ New construction (no capital needs yet)
- ❌ Already funded (competitor incumbent)
- ❌ HOA in litigation (legal risk)
- ❌ Contact explicitly opted out

---

## Contact Workflow

### Stage 1: NEW (Freshly Discovered)

**Your Action:**
1. Review contact card in UI
2. Google the HOA name (verify it exists)
3. Check management company website (if listed)
4. LinkedIn search for board member (enrich profile)
5. Add notes with your research findings

**Time Limit:** Review within 24 hours of discovery

**Decision:** Move to "Contacted" or "Disqualified"

### Stage 2: CONTACTED (First Outreach Sent)

**Your Action:**
1. Send initial email (use template - see [Outreach Scripts](#outreach-scripts))
2. Wait 3 days for response
3. If no response: Send follow-up #1
4. Wait 4 more days
5. If no response: Send follow-up #2
6. Wait 7 more days
7. If no response: Move to "Cold" or "Disqualified"

**Update Status:**
- Click "Edit" on contact card
- Change status to "Contacted"
- Add notes: "Sent welcome email 2/17"
- Save

**Time Limit:** First email within 2 days of NEW status

### Stage 3: QUALIFIED (Interest Confirmed)

**Your Action:**
1. They responded positively to outreach
2. Schedule 15-min discovery call
3. Confirm:
   - Project type and scope
   - Budget approved or pending board vote
   - Timeline (urgent vs. planning phase)
   - Decision-makers involved
4. Send consultation booking link
5. Add notes with project details

**Update Status:**
- Change to "Qualified"
- Add notes: "Interested in $500K roof, board meeting 3/15"
- Set reminder for follow-up

**Time Limit:** Schedule call within 3 days of response

### Stage 4: CLOSED or DISQUALIFIED

**Closed (Won):**
- They selected HOA Project Funding
- Loan application submitted
- Deal moved to underwriting
- Remove from ClawOps Console (export to CRM for servicing)

**Disqualified (Lost):**
- Not a fit (too small, wrong project type)
- Already funded elsewhere
- No budget / no appetite
- Bad timing (revisit in 6 months)

**Update Status:**
- Change to "Disqualified"
- Add notes: "Already funded with competitor"
- Keep in system for future remarketing

---

## Outreach Scripts

### Email Template 1: Welcome (Initial Outreach)

**Subject Lines** (A/B test these):
- "HOA Funding Options for {{hoa_name}}"
- "Capital Project Financing - No Special Assessments Required"
- "{{contact_person}} - Quick Question About {{hoa_name}}"

**Body:**

```
Hi {{contact_person}},

I noticed {{hoa_name}} in {{city}} and wanted to reach out about capital project financing.

We work exclusively with HOAs to fund large capital improvements (roofs, elevators, structural repairs, etc.) without requiring special assessments from owners.

**What makes us different:**
- 48-hour pre-approvals
- 5-25 year terms (flexible repayment)
- No upfront fees for quotes
- Close in 2-3 weeks

Are you currently planning any capital projects, or would you like to learn more about keeping options open for future needs?

Happy to send over a brief overview or schedule a quick 15-minute call.

Best,
[Your Name]
[Your Title]
HOA Project Funding
[Phone]
[Email]

P.S. - We recently helped a similar HOA in [nearby city] finance a $800K roof replacement. I can share that case study if helpful.
```

### Email Template 2: Follow-Up #1 (3 Days Later)

**Subject:** "Re: HOA Funding Options for {{hoa_name}}"

**Body:**

```
Hi {{contact_person}},

Following up on my note below. I know board members are busy, so I'll keep this brief.

**Quick question:** Does {{hoa_name}} have a reserve study showing any upcoming capital needs in the next 1-3 years?

If so, I'd love to share how other HOAs are funding those projects without assessments (which can be unpopular with owners).

Free 15-min consultation: [Calendly Link]

Or just reply with "Not interested" and I'll stop bugging you. :)

Best,
[Your Name]
```

### Email Template 3: Follow-Up #2 (7 Days Later)

**Subject:** "Last note - {{hoa_name}} capital funding"

**Body:**

```
Hi {{contact_person}},

Last quick follow-up. I'll assume you're not interested if I don't hear back, but wanted to share one quick resource:

**Free Guide:** "5 Ways HOAs Fund Capital Projects (Without Special Assessments)"

[Link to guide PDF]

This covers the pros/cons of different financing approaches we see boards evaluate. No obligation, just helpful info.

If you ever want to chat about funding options, we're here. Otherwise, I'll leave you alone. :)

Best,
[Your Name]

P.S. - If someone else at {{hoa_name}} handles financial planning, happy to connect with them instead.
```

### Phone Script (Cold Call)

**Opening:**
```
Hi, this is [Your Name] from HOA Project Funding. I'm calling for [Contact Person] - is this a good time?

[If yes:]
Great! I'll be brief. We work exclusively with HOAs to finance capital projects like roofs, elevators, and structural repairs. I was reaching out to see if {{hoa_name}} has any upcoming projects you're planning or budgeting for?

[If no:]
No problem! What's a better time to reach you? Or would email be easier?
```

**Discovery Questions:**
1. "Do you have a reserve study showing any upcoming capital needs?"
2. "What's the biggest project on your radar in the next 1-2 years?"
3. "How does the board typically fund large projects - special assessment, loan, or reserves?"
4. "Have you worked with HOA lenders before? What was that experience like?"
5. "What would make evaluating financing options easier for your board?"

**Closing:**
```
Based on what you've shared, it sounds like [X] might be a fit. Can I send over:
- A quick overview of our terms and process
- A case study from a similar HOA
- A link to schedule a free 15-min consultation

Which would be most helpful?
```

### LinkedIn Message Template

**Connection Request:**
```
Hi {{contact_person}}, I work with HOAs in {{city}} on capital project financing. Would love to connect and share resources that might be helpful for {{hoa_name}}'s future planning.
```

**Follow-Up Message (After Connection):**
```
Thanks for connecting! I work specifically with HOA boards to finance capital improvements without special assessments.

If {{hoa_name}} ever has a large project (roof, elevators, structural, etc.), happy to share how other boards in {{city}} have approached funding.

No sales pitch - just want to be a resource if helpful. Feel free to reach out anytime.
```

---

## Objection Handling

### Objection #1: "We don't have any projects right now."

**Response:**
"Totally understand. Most boards we work with don't have urgent needs when we first connect.

What I've found helpful is just staying top-of-mind, so when your reserve study flags something or a surprise repair comes up, you know your options.

Can I send you a quick overview to keep on file? That way if something comes up at a future board meeting, you have it handy."

**Why It Works:** Positions you as a resource, not a pushy salesperson. Plants seed for future.

---

### Objection #2: "We already have a lender/relationship."

**Response:**
"That's great you have a relationship! A lot of our clients come to us after working with [competitor] because we specialize only in HOAs, not residential loans.

Just curious - are you happy with the terms you're getting? We often see boards who didn't know they could get [specific better term].

Either way, no harm in having a backup option. Want me to send over our typical terms just for comparison?"

**Why It Works:** Doesn't bash competitor, plants seed of doubt, offers value.

---

### Objection #3: "Our owners would never approve taking on debt."

**Response:**
"I totally get that. Special assessments can be controversial too, though, right?

What we find is when boards frame it as 'spreading the cost over time' vs. 'hitting everyone with a $5,000 assessment today,' owners are actually more supportive.

Plus, many states require a vote for assessments over a certain amount, but loans can be approved by the board alone (check your CC&Rs).

Want me to send you a one-pager on how to present financing to owners? We've helped boards navigate that conversation."

**Why It Works:** Reframes objection, offers practical help, positions you as advisor.

---

### Objection #4: "We can't afford loan payments."

**Response:**
"Great question - that's what underwriting is for. We actually analyze your budget before approval to make sure the loan is sustainable.

The key is matching the loan term to the useful life of the project. For a roof (30-year life), a 20-year loan means payments that fit comfortably in your operating budget.

Want me to run a quick payment estimate based on your current dues? It's free, no obligation, and you'll know within 48 hours if it's feasible."

**Why It Works:** Shows you understand their concern, offers free analysis, low commitment.

---

### Objection #5: "We need to think about it / talk to the board."

**Response:**
"Absolutely, this should definitely be a board decision.

To make that conversation easier, can I send you:
1. A one-page overview of our terms
2. A case study from a similar HOA
3. A comparison sheet (loan vs. assessment vs. reserves)

That way you have something to share at the next board meeting. Would those be helpful?"

**Why It Works:** Respects decision process, offers to help move it forward, low-pressure.

---

### Objection #6: "We're going to do a special assessment instead."

**Response:**
"Special assessments definitely work for some boards. Quick question though - have you seen how owners react to big assessments?

We often get calls from boards who tried an assessment first, but got pushback from owners who couldn't pay $10K upfront. Then they end up doing a loan anyway, but with 6 months of drama first.

Not saying that'll happen to you, but worth having a Plan B, right? Want me to send over loan terms just as a backup option?"

**Why It Works:** Plants seed of risk, positions loan as safety net.

---

## Compliance Requirements

### CAN-SPAM Act (Email)

**Required Elements:**
- ✅ Accurate "From" and "Reply-To" addresses
- ✅ Honest subject lines (no deceptive "RE:" or "FWD:")
- ✅ Clear identification as advertisement
- ✅ Physical business address in email
- ✅ Working unsubscribe link (processed within 10 days)

**Penalties:** Up to $46,517 per violation

**Our Practice:**
- All emails include unsubscribe link in footer
- Unsubscribe requests honored immediately
- Suppression list maintained in system

---

### TCPA (Phone/SMS)

**Key Rules:**
- ❌ No robocalls or pre-recorded messages (unless they opted in)
- ❌ No texting without prior written consent
- ✅ Manual dialing is OK for cold outreach (B2B exception)
- ✅ Must honor Do Not Call requests immediately

**Safe Practice:**
- Only call business numbers (not personal cell phones)
- Ask "Is this a good time?" first
- If they say "Don't call again," note it immediately

---

### State-Specific Rules

**California:**
- Must honor "Do Not Contact" requests per California Consumer Privacy Act (CCPA)
- Cannot sell contact data without consent
- Must disclose data collection practices if asked

**Florida (Phase 2):**
- HOA disclosures required (Statutes 718 & 720)
- Must understand condo vs. HOA distinctions

**Colorado (Phase 2):**
- HOA registration requirements
- Community manager licensing verification

---

## Tools & Systems

### ClawOps Console - HOA Contact Finder

**Access:** http://localhost:5174/hoa-leads

**Key Features:**
1. **Search**: Run city/state/zip searches to discover contacts
2. **Filter**: By status, city, confidence score, presence of email/phone
3. **Edit**: Update status, add notes, enrich contact info
4. **Export**: Download CSV with active filters
5. **Stats**: Dashboard showing totals, conversion rates, quality metrics

**Keyboard Shortcuts:**
- `Ctrl+K` - Open search
- `Ctrl+F` - Focus filter box
- `Ctrl+E` - Export CSV
- `Enter` - Open contact detail

---

### Email Campaign Tools (Coming Soon)

**Access:** http://localhost:5174/email-campaigns (under development)

**Features:**
- Bulk select contacts by filter
- AI-generated email copy (using hoa-email-campaigns agent)
- Schedule sends (stagger over days)
- Track opens, clicks, bounces
- Automated follow-up sequences

**Cost:** ~$0.025 per AI-generated email sequence

---

### Sales Dashboard (Coming Soon)

**Access:** http://localhost:5174/sales-dashboard (under development)

**Widgets:**
- Pipeline overview (by status)
- Conversion funnel (new → contacted → qualified → closed)
- Team activity (last 24 hours)
- Hot leads (top 10 by score)
- City heatmap (performance by geography)
- Weekly trends (line charts)

**Rep Scorecards:**
- Contacts created per week
- Response rate (contacted → qualified)
- Avg time to first contact
- Deals closed

---

## Success Metrics

### Daily Targets (Per Rep)
- **Searches Run**: 2-3 cities
- **Contacts Discovered**: 20-30
- **Contacts Reviewed**: 50
- **Emails Sent**: 10-15
- **Calls Made**: 5-10
- **Status Updates**: 20

### Weekly Targets (Per Rep)
- **Total Contacts Added**: 100-150
- **Outreach Sent**: 50-75 emails + 25-50 calls
- **Responses Received**: 2-5 (3-5% response rate)
- **Qualified Leads**: 1-2 (30% of responses)

### Monthly Targets (Per Rep)
- **Total Database Growth**: 400-600 contacts
- **Qualified Pipeline**: 4-8 opportunities
- **Proposals Sent**: 2-4
- **Deals Closed**: 1-2

### Team Targets (All Reps)
- **Database Size**: 2,000 contacts by end of Q1
- **Active Pipeline**: 20-40 qualified opportunities
- **Monthly Revenue**: $500K-$2M in funded loans

---

## Best Practices

### Do's ✅

1. **Be Human**: Write like you're emailing a friend, not a lawyer
2. **Personalize**: Always use {{hoa_name}} and {{contact_person}}
3. **Provide Value**: Share resources (guides, case studies, calculators)
4. **Follow Up**: 80% of sales come after the 5th touchpoint
5. **Track Everything**: Update status after every interaction
6. **Ask Questions**: Discovery > pitching
7. **Respect Time**: Keep emails short, calls under 15 minutes
8. **Be Consultative**: Help them solve problems, not just sell loans
9. **Share Success Stories**: Case studies build trust
10. **Stay Organized**: Use notes field religiously

### Don'ts ❌

1. **Don't Spam**: Max 3 emails per lead, then stop
2. **Don't Lie**: Confidence score isn't perfect - verify info
3. **Don't Ignore Unsubscribes**: Legal requirement
4. **Don't Badmouth Competitors**: Stay professional
5. **Don't Promise Approvals**: Underwriting has final say
6. **Don't Skip Research**: Google them before calling
7. **Don't Assume**: Ask questions, confirm details
8. **Don't Forget Notes**: Future you will thank present you
9. **Don't Cherry-Pick**: Work all tiers, not just hot leads
10. **Don't Give Up**: Some deals take 6-12 months

---

## Quick Reference: Daily Workflow

**Morning Routine** (30 minutes):
1. Check dashboard for responses/activity overnight
2. Run 2 new city searches
3. Review 10 newest contacts, update statuses
4. Export yesterday's "Contacted" for follow-up tracking

**Outreach Block** (2 hours):
1. Filter to "New" + Confidence >70%
2. Send 15 welcome emails (use templates)
3. Make 10 cold calls (use script)
4. Update all statuses to "Contacted"

**Follow-Up Block** (1 hour):
1. Filter to "Contacted" + scraped_at >3 days ago
2. Send follow-up emails to non-responders
3. Call anyone who opened but didn't reply

**Admin Time** (30 minutes):
1. Update notes for any conversations
2. Move qualified leads to CRM (if using external system)
3. Export weekly CSV for backup
4. Review stats, adjust strategy

**End of Day** (15 minutes):
1. Update all interaction logs
2. Set reminders for tomorrow's follow-ups
3. Check email for inbound responses
4. Review tomorrow's target cities

---

## Continuous Improvement

### Weekly Team Review
- What worked this week (celebrate wins)
- What didn't work (learn from losses)
- Edge cases discovered (update playbook)
- New objections heard (add to playbook)
- Response rates by email template (A/B test)
- Best-performing cities (double down)

### Monthly Playbook Updates
- Add new scripts that work
- Remove tactics that don't work
- Incorporate lessons learned
- Update compliance requirements (laws change)
- Refine qualification criteria based on close rates

---

## Version History

**v1.0** (Feb 17, 2026) - Initial release, mock mode only
**v1.1** (TBD) - Add Brave Search real data tips
**v1.2** (TBD) - Add email campaign automation workflows
**v1.3** (TBD) - Add sales dashboard interpretation guide

---

## Questions or Feedback?

This playbook is a living document. If you discover something that works (or doesn't), update this file and share with the team.

**Contact:** [Your Name] | [Your Email]
**Last Reviewed:** February 17, 2026
