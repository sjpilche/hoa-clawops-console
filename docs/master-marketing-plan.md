# Master Marketing Plan
## HOA Project Funding + Jake AI CFO
### As of Feb 26, 2026

---

## What We're Selling

### HOA Project Funding
**Product:** HOA construction loans $25K–$2M. Faster than banks. Built for how HOAs actually work.
**Borrower:** HOA boards who need capital repairs funded now (roofs, exteriors, paving, reserves).
**Referral partner:** Property managers and GCs who send boards to us.
**Website:** www.hoaprojectfunding.com

### Jake AI CFO
**Product:** CFO-level financial ops for mid-size construction companies ($2M–$50M revenue).
**Pitch:** "Stop the data bullshit — legacy QB/BC/Excel, messy AR, chaos at month-end. We fixed this
ourselves as construction CFOs. Now we're sharing it."
**Target:** GC owners and CFOs drowning in bad data, late invoices, project cost bleed.

---

## Full Asset Inventory

### Lead Lists

#### 1. Livempaint — NSG Painting Customers (Azure SQL: empcapmaster2.livempaint_leads)
7,213 contacts. NSG Empire Painting's active client base — already vetted, real companies.
DUAL PURPOSE: HOA pitch (boards/PMs) AND Jake CFO pitch (GCs/owners).

| Segment          | Count | Email | Website | ZIP/State |
|------------------|-------|-------|---------|-----------|
| Property Manager | 3,442 | 3,442 | 2,958   | 3,439     |
| Owner            | 1,870 | 1,851 | 381     | 1,584     |
| Unknown type     | 1,711 | 1,711 | 1,196   | 1,475     |
| General Contractor| 125  | 125   | 88      | 125       |
| Board (HOA)      | 61    | ~50   | ~15     | 61        |
| Law Firm         | 4     | 4     | 3       | 4         |

**Status:** 47 contacted (board segment partial). 7,166 unsent. Waiting on SendGrid domain verification.

**Geographic concentration:** CA (4,173) · NV (1,017) · FL (505) · AZ (426) · CO (350) · TX (134)

**Dual-pitch breakdown:**
- HOA pitch → Board (61) + Property Manager (3,442) = 3,503 contacts
- Jake CFO pitch → GC (125) + Owner (1,870) + Unknown (1,711) = 3,706 contacts

---

#### 2. Jake GC Pipeline — Google Maps Discovery (SQLite: cfo_leads, source=google_maps_discovery)
54 construction companies scraped from Google Maps. These ARE Jake's target (GCs, not HOA clients).

| Status    | Count | Email | Phone | Website |
|-----------|-------|-------|-------|---------|
| Enriched  | 14    | 14    | 12    | 11      |
| Partial   | 14    | 0     | 7     | 13      |
| Failed    | 26    | 0     | 0     | 0       |

**States:** CO (350 total from all jake leads) — heavily Colorado-focused so far.
**Problem:** 26 failed enrichment. Need to re-run enricher or manually find contacts.
**Action:** Run `node scripts/trigger-enricher.js 30 pending maps` to retry failed batch.

---

#### 3. Jake Lead Scout — LLM-Discovered GC Leads (SQLite: cfo_leads, source=lead_scout)
4 leads. Effectively not started. LLM scout runs Monday 7AM but output has been minimal.

| Lead | LinkedIn | Email | Score |
|------|----------|-------|-------|
| Greystone Construction | ✓ | ✗ | — |
| Phoenix Services LLC | ✓ | ✗ | — |
| Hunt Electric | ✓ | ✗ | — |
| 1 other | — | ✓ | — |

---

#### 4. HOA CFO Leads — DBPR Scraped (SQLite: cfo_leads, source_agent=cfo)
208 leads scraped from Florida DBPR (property management licensing database). Zero emails.
These are licensed PM companies in FL — phone/address only. Need enrichment.

---

#### 5. Management Companies — CAI Scraped (SQLite: management_companies)
20 companies, 122 contacts, 1 email, 1 phone. Very early stage — mgmt-cai-scraper has barely run.
**Potential:** CAI lists thousands of HOA management companies nationally.
**Action:** Run mgmt-cai-scraper for 30+ minutes to build this list.

---

### Content Assets

| Piece | Channel | Status |
|-------|---------|--------|
| Jake LinkedIn post | LinkedIn | Published |
| Jake LinkedIn post | LinkedIn | Approved (unsent) |
| CFO LinkedIn post | LinkedIn | Approved (unsent) |
| HOA blog posts | hoaprojectfunding.com | Live via GitHub/Netlify |

**Blog:** hoaprojectfunding.com — auto-published Monday 8:30AM via GitHub API.
Agent: hoa-content-writer (Mon 8AM) → hoa-cms-publisher (Mon 8:30AM) → Netlify deploy.

---

### Agent Fleet (38 agents)

#### Active / Working
| Agent | Type | Schedule | Output |
|-------|------|----------|--------|
| hoa-content-writer | LLM | Mon 8AM | Blog post drafts |
| hoa-cms-publisher | Special handler | Mon 8:30AM | GitHub push → Netlify |
| hoa-facebook-poster | LLM | Daily 10AM | Facebook posts |
| jake-lead-scout | LLM | Mon 7AM | GC leads (needs tuning) |
| jake-construction-discovery | Special handler | Mon 6AM | Google Maps GC companies |
| jake-contact-enricher | Special handler | on-demand | Email/phone enrichment |
| daily-debrief | LLM | Weekdays 6PM | Ops summary |
| mgmt-cai-scraper | Special handler | on-demand | Management company list |

#### Built But Underperforming
| Agent | Problem |
|-------|---------|
| jake-lead-scout | Only 4 leads total — LLM output parsing issues |
| hoa-discovery | Finds HOA communities but hoa_contacts table is empty (enricher not running) |
| hoa-contact-enricher | Not being triggered after discovery |
| cfo-* agents (7) | All built, schedules exist, but CFO leads have 0 emails — nothing to send |

#### Built But Never Run
| Agent | What It Does |
|-------|--------------|
| jake-follow-up-agent | Day-5 follow-up emails for non-responders |
| jake-meeting-booker | Books calls with interested leads |
| jake-outreach-agent | Drafts personalized outreach from leads |
| hoa-outreach-drafter | Drafts HOA board/PM outreach |
| mgmt-portfolio-scraper | Scrapes PM company HOA portfolios |
| mgmt-contact-puller | Pulls decision-maker contacts from PM websites |
| mgmt-review-scanner | Finds HOAs under bad management (hot leads) |

---

## Marketing Channels — Full Breakdown

### Channel 1: Email (HIGHEST VOLUME — 7,228 contacts ready)
**Tool:** SendGrid (`send-livempaint-outreach.js`)
**Status:** Pending domain verification at app.sendgrid.com
**Segments ready to send:**
- Board (14 remaining) — HOA direct borrower pitch
- GC (125) — Jake CFO pitch + HOA referral pitch
- PM (3,442) — HOA referral partner pitch
- Owner (1,870) — Jake CFO pitch (filter for construction owners first)

**Once verified:**
```bash
node scripts/send-livempaint-outreach.js --segment=board
node scripts/send-livempaint-outreach.js --segment=gc
node scripts/send-livempaint-outreach.js --segment=pm --limit=500  # batch 500/day
```

**Follow-up sequence needed:** Day 5 and Day 14 emails for each segment (only have Day 0 right now).

---

### Channel 2: Cold Call (19 phone numbers now, 2,958 scrapable)
**What we have:** 19 phone numbers on Google Maps GC leads.
**What we can get:** 2,958 PM websites have phone numbers on their contact pages.
**Tool to build:** `scripts/scrape-pm-phones.js` — Playwright scrapes Contact page of each PM website.
**Who calls:** Steve (boards/PMs) or a VA with a script.

**Call script angle — Board:**
> "Hi [name], I sent you an email about HOA construction funding. Quick 2-min question —
> does your HOA have any capital repair projects you're trying to fund right now?"

**Call script angle — PM:**
> "Hi [name], we fund HOA capital repairs faster than banks. Do any of your communities
> need roof/paving/exterior work they can't fund yet?"

**Call script angle — GC/Jake:**
> "Hi [name], I work with mid-size GCs on fixing the financial ops mess — QB, BC, Excel chaos.
> Quick question: what does your month-end close look like right now?"

---

### Channel 3: LinkedIn (4 leads with profiles now, thousands searchable)
**What we have:** 4 LinkedIn URLs on Jake GC leads.
**What we can do manually:**
- Search "HOA property manager [city]" → connect + message
- Search "general contractor CFO [state]" → connect + message
- Search company names from livempaint list → find contacts

**Message template — PM (HOA):**
> "Hi [name] — I work with HOA management companies in [state] helping their boards get
> construction projects funded faster than traditional bank loans. Would love to share what
> we've built if it's relevant to your portfolio. Happy to keep it to 10 mins."

**Message template — GC (Jake):**
> "Hi [name] — fellow construction industry person here. I've been helping GC owners clean up
> the financial ops mess that comes with growth — QB/BC chaos, slow AR, project cost bleed.
> Would a quick conversation be worth it?"

**Scale tool:** LinkedIn Sales Navigator ($99/mo) — lets you message 50/day without connecting first.

---

### Channel 4: Direct Mail (3,400+ PMs have ZIP codes)
**What we have:** City/state/zip on 3,439 property managers.
**Format:** 4x6 postcard or #10 envelope letter.
**Cost:** ~$0.50–$0.75/piece via VistaPrint, Printing for Less, or Stannp.com (API-driven).
**Volume:** Start with CO + FL + AZ (NSG's core markets) — ~900 PMs.

**HOA postcard headline:**
> "Your HOA boards deserve a faster funding option."
> "We fund capital repairs from $25K–$2M. Usually faster than banks."
> www.hoaprojectfunding.com

**Jake postcard headline:**
> "Still closing the books in Excel at month-end?"
> "We help GC owners fix that. Fast."

**Stannp.com** — API lets you trigger postcards programmatically. Can be wired into ClawOps.

---

### Channel 5: Website Contact Forms (2,958 PM websites)
**What we have:** Website URLs for 2,958 PMs.
**Approach:** Playwright auto-fills contact form on each PM website.
**Message:** Same as email #1 but shorter, conversational.
**Considerations:** Slower, more manual-feeling, but gets around email deliverability.
**Tool to build:** `scripts/send-pm-contact-forms.js`

---

### Channel 6: Facebook / Social (hoa-facebook-poster running daily)
**Status:** hoa-facebook-poster fires daily at 10AM. Posts to HOA Project Funding Facebook page.
**Content:** HOA financing tips, success stories, educational posts.
**Gap:** No paid ads running. No retargeting pixel on hoaprojectfunding.com yet.
**Quick win:** Boost 1-2 posts per week to HOA board member + property manager audience in target states.
Facebook targeting: Job title "HOA board member", "property manager", "community association manager".

---

### Channel 7: Blog / SEO (live, auto-publishing)
**Status:** hoaprojectfunding.com publishing 1 post/week via GitHub API → Netlify.
**Gap:** Need to track rankings. Install Google Search Console. Target keywords:
- "HOA construction loan"
- "HOA reserve fund loan"
- "HOA capital improvement financing"
- "property management company HOA funding"

---

### Channel 8: Google / Facebook Ads (not started)
**Highest-ROI channel for HOA loans** — people searching "HOA loan" have immediate intent.
**Google Search:** Target "HOA construction loan", "HOA reserve fund loan" — CPCs are low ($2–5).
**Facebook:** Target HOA board members and property managers by job title + geography.
**Budget to start:** $500/mo Google + $300/mo Facebook — enough to get data.

---

## Priority Action Plan

### This Week (SendGrid verifies)
1. **Send board segment** (14 emails) — HOA direct pitch
2. **Send GC segment** (125 emails) — Jake CFO + HOA referral dual pitch
3. **Send PM batch 1** (500 emails) — HOA referral pitch
4. **Re-run jake-contact-enricher** on 26 failed Maps GC leads

### Next Week
5. **Send PM batch 2–7** (500/day until 3,442 done)
6. **Build phone scraper** — scrape 2,958 PM websites for office phone
7. **Write follow-up email templates** — Day 5 and Day 14 for each segment
8. **Add outreach_sequence column** to livempaint_leads — track step 1/2/3 per contact

### Within 30 Days
9. **Run mgmt-cai-scraper** for 2+ hours → build management company list to 500+
10. **Run mgmt-contact-puller** on each company → get decision-maker contacts with email
11. **Launch Google Ads** — $500/mo, "HOA construction loan" keywords
12. **Direct mail pilot** — 200 PMs in CO/FL, postcard to office address
13. **LinkedIn outreach** — manual 10 connections/day to PM and GC decision-makers

### Ongoing (Automated)
- Blog: 1 post/week (hoa-content-writer → hoa-cms-publisher) ✓ running
- Facebook: daily post (hoa-facebook-poster) ✓ running
- Discovery: Mon 6AM Maps scraper adds GC companies ✓ running
- Enrichment: needs to be triggered after each discovery run

---

## Prompts to Build

These are the agent prompts / SOUL.md updates needed to execute the above:

### 1. Follow-up Email Agent (jake-follow-up-agent)
Prompt inputs: company name, contact name, segment (board/gc/pm), days since first email, state.
Output: Subject line + body for Day-5 follow-up. Different angle than Day 0. Shorter. More direct.

### 2. PM Phone Scraper
Not an LLM — Playwright script. Visits website → finds Contact page → extracts phone number.
Saves to livempaint_leads.phone column.

### 3. Owner Segment Classifier
Input: company_name + notes for 1,870 owners.
Output: HOA-relevant (condo association, HOA, residential complex) vs skip.
Keywords: "HOA", "condo", "condominium", "homeowner", "residential", "community association".

### 4. Unknown Segment Classifier
Same as above for 1,711 unknowns — classify as PM / GC / Owner / Other.

### 5. Jake Outreach Email — Owner Angle
New template for the 1,870 owners classified as construction/commercial.
Pitch: "You manage property. At some point you'll need capital repairs. We fund those faster."

### 6. LinkedIn Message Generator
Input: contact name, company, segment, state.
Output: 3-sentence LinkedIn connection message. No pitch in the connect request — just context.

### 7. Reply Handler
Input: paste inbound reply email text.
Output: classify as Interested / Not Now / Wrong Person / Unsubscribe / Bounce.
Action: update livempaint_leads.outreach_status accordingly.

---

## What's NOT Working Yet

| Issue | Fix |
|-------|-----|
| 208 HOA CFO leads have 0 emails | Run hoa-contact-enricher on them |
| hoa_contacts table empty | hoa-discovery found communities but enricher never ran |
| Jake lead scout producing 4 leads | LLM JSON parsing is fragile — needs more discovery runs |
| 26 Maps GC leads failed enrichment | Re-run enricher: `node scripts/trigger-enricher.js 30 failed maps` |
| Mgmt companies at 20 with 1 email | Run mgmt-cai-scraper + mgmt-contact-puller for an hour |
| No follow-up emails | Build Day-5 and Day-14 templates |
| No SendGrid open/click tracking | Wire SendGrid event webhook → update outreach_status |
| LinkedIn at 0 outreach | Manual daily connects until Sales Navigator justified |
