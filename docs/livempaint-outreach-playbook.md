# HOA Project Funding — Livempaint Outreach Playbook

## The Asset

7,166 warm contacts sourced from NSG Empire Painting's active customer database (livempaint2004).
These are NOT cold leads — they are existing clients of a construction-adjacent company that NSG
trusts enough to invoice. They know what it means to manage HOA properties and construction projects.

**Why this list is valuable:**
- Already vetted by NSG's sales process — real companies, real people
- Property Managers manage portfolios of HOAs — one PM = many potential borrowers
- GCs see HOA projects stall for lack of funding constantly — they have the pain firsthand
- HOA Boards are the actual borrowers — highest intent, smallest count

---

## Segments — Priority Order

### 1. HOA Board Members (14 unsent, 61 total)
**Who:** Volunteer board members of self-managed or small HOAs
**Pain:** Reserve study says $400K roof needed. Bank says 6 months. Special assessment = angry neighbors.
**Pitch:** Direct borrower — HOA Project Funding can move faster, underwrite around HOA mechanics
**From:** Steve Pilcher (personal, trusted lender voice)
**Goal:** Application at hoaprojectfunding.com OR 15-min call

### 2. General Contractors (125 unsent)
**Who:** GCs who paint/renovate HOA properties — they see funding delays kill their jobs
**Pain:** "Board loves the bid but can't fund it" — lost jobs, delayed starts, slow payments
**Pitch:** Referral partner — we fund their HOA clients faster, they start sooner and get paid
**From:** Jake (CFO voice — peer-to-peer, numbers-focused)
**Goal:** 15-min call to become a referring GC partner

### 3. Property Managers (3,442 unsent)
**Who:** PM companies managing HOA portfolios — often 10-100+ communities each
**Pain:** Board calls them about the leaking roof. Bank loan takes 6 months. PMs get the heat.
**Pitch:** Referral tool — give your boards a faster option, makes you look great, reduces headaches
**From:** Steve Pilcher (professional, solution-oriented)
**Goal:** Add hoaprojectfunding.com to their vendor toolkit / refer their boards

### 4. Owners (1,870 unsent)
**Who:** Commercial property owners, landlords, some HOA-adjacent
**Pain:** Variable — some own condo buildings, some are commercial. Needs more filtering.
**Pitch:** Similar to Board — capital repairs, reserve shortfalls, construction financing
**From:** Steve Pilcher
**Goal:** Filter for condo/HOA owners first, then pitch direct

### 5. Unknown Type (1,711 unsent)
**Who:** Contacts where client_type wasn't mapped — need to look at company names
**Action:** Run a quick classification pass — company name keywords can split into PM vs GC vs Other
**Hold until classified**

---

## Contact Channels — What We Have

| Segment          | Count | Email | Website | Location |
|------------------|-------|-------|---------|----------|
| Property Manager | 3,442 | 3,442 | 2,958   | 3,439    |
| Owner            | 1,870 | 1,851 | 381     | 1,584    |
| Unknown          | 1,711 | 1,711 | 1,196   | 1,475    |
| GC               | 125   | 125   | 88      | 125      |
| Board            | 14    | 13    | 2       | 14       |
| Law Firm         | 4     | 4     | 3       | 4        |

**Available channels:**
1. **Email** — 7,166 valid addresses (SendGrid — pending domain verification)
2. **Phone** — not in our table, but 2,958 PM websites can be scraped for office phone
3. **LinkedIn** — company names + contact names → connect request + InMail
4. **Direct Mail** — city/state/zip on 3,400+ PMs → physical letter to office address
5. **Website contact form** — 2,958 PMs have websites → form submission as fallback

---

## Outreach Sequences — Per Segment

### Board Sequence (14 contacts — highest priority)
```
Day 0:   Email #1 — "Faster Funding for Your HOA's Capital Repairs" (Steve)
Day 5:   Email #2 — Follow-up, different angle: "Quick question about your reserve study"
Day 10:  LinkedIn connect (search by name + company)
Day 14:  Email #3 — Final: "Closing the loop — happy to answer any questions"
```

### GC Sequence (125 contacts)
```
Day 0:   Email #1 — "Faster HOA Funding = Quicker Starts & Payments" (Jake)
Day 5:   Email #2 — "Real example: GC in [their state] started 6 weeks sooner"
Day 10:  LinkedIn connect — "Fellow construction industry person"
Day 14:  Email #3 — "Last note — here's a one-pager if useful"
```

### Property Manager Sequence (3,442 contacts — roll in 500/day batches)
```
Day 0:   Email #1 — "Faster Funding Option for Your HOA Boards" (Steve)
Day 7:   Email #2 — "One thing PMs tell us they wish they'd known sooner..."
Day 14:  Email #3 — "Final note — referral partner program details"
Day 21:  Phone call OR website form (for non-openers)
```

---

## Sending Plan

### Phase 1 — SendGrid Verified (this week)
Once domain verification clears:
```bash
# Board — go now (14 remaining)
node scripts/send-livempaint-outreach.js --segment=board

# GC — go now (125)
node scripts/send-livempaint-outreach.js --segment=gc

# PM — batch 500/day
node scripts/send-livempaint-outreach.js --segment=pm --limit=500
# next day: another 500 (already-sent are marked 'contacted', won't re-send)
```

### Phase 2 — Follow-up Emails (Day 5-7)
- Add `outreach_sequence` column to livempaint_leads (track step 1/2/3)
- Wire jake-follow-up-agent to generate personalized follow-ups for non-responders
- Send via same SendGrid script with `--sequence=2` flag

### Phase 3 — Phone Scrape + Cold Call
Build `scripts/scrape-pm-phones.js`:
- For each PM with a website, Playwright scrapes the "Contact" page for phone number
- Adds to a `phone` column in livempaint_leads
- Export to CSV → hand off to cold call team or auto-dialer

### Phase 4 — LinkedIn
- Export non-responders after Day 14 to CSV
- Upload to LinkedIn Sales Navigator (if available) or use manual connect campaign
- Message: "Hi [name], I sent you an email a few weeks ago about HOA funding options..."

### Phase 5 — Direct Mail (PM segment only)
- 3,400+ PMs have city/state/zip
- Print 4x6 postcard: "Your HOA boards deserve a faster funding option"
- Target: PM firms in CO, FL, TX, AZ (NSG's strongest markets) first
- Cost: ~$0.50/card via VistaPrint or Printing for Less

---

## Reply Handling

When replies come in:
- **Interested** → flag in livempaint_leads (`outreach_status='interested'`) → Steve follows up same day
- **Not now** → `outreach_status='nurture'` → re-contact in 60 days
- **Wrong person** → ask for right contact, update record
- **Unsubscribe** → `outreach_status='unsubscribed'` immediately, never re-contact

Use `jake-reply-classifier` handler to auto-classify inbound replies (paste reply text into a run).

---

## Metrics to Track

| Metric | Target |
|--------|--------|
| Email open rate | >25% |
| Click-through (hoaprojectfunding.com) | >3% |
| Reply rate | >2% |
| Interested / replied | >0.5% → ~36 warm leads from PM batch |
| Applications submitted | 5+ from this campaign |

---

## What to Build Next

1. **`outreach_sequence` column** — track which step each contact is on (1/2/3)
2. **Follow-up email templates** — steps 2 and 3 for each segment (currently only have step 1)
3. **Phone scraper** — Playwright scrape of PM websites for office phone numbers
4. **Reply classifier** — paste inbound reply → auto-updates lead status
5. **SendGrid webhook** — receive open/click events → auto-update livempaint_leads.outreach_status
6. **Owner segment filter** — classify 1,870 owners by company name keyword to find HOA-relevant ones
7. **Unknown segment classification** — keyword match on company_name to assign client_type

---

## NSG Relationship Note

These contacts came from NSG's painting database. A few considerations:
- These people KNOW NSG — mentioning the connection ("we work with NSG Empire Painting on HOA projects")
  could be a warm opener for some segments, particularly GCs who've worked with NSG directly
- Don't over-lean on it — HOA Project Funding stands on its own. But it's context worth having.
- If Steve has an existing relationship with any of these PMs personally, those should be
  extracted as VIP contacts for a personal phone call, not a batch email.
