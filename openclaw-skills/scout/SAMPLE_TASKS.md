# Scout — Sample Tasks

---

## Sample Task 1: Market Discovery
**Input message:**
```json
{ "task": "discovery", "region": "Tampa Bay, FL", "limit": 100 }
```

**Expected output:**
```
DISCOVERY RUN: Tampa Bay, FL
Companies found: 87
New inserts: 62
Duplicates skipped: 25
Duration: 44.2s
Cost: $0.00

TOP COMPANIES (sample):
1. Gulf Coast General Contractors LLC | Tampa, FL | (813) 555-0188 | gulfcoastgc.com
2. Bayshore Construction Group | St. Petersburg, FL | (727) 555-0244 | bayshoreconst.com
3. Suncoast Builders Inc | Clearwater, FL | (727) 555-0099 | suncoastbuilders.net
4. Tampa Bay Renovation Co | Brandon, FL | (813) 555-0317 | (no website found)
5. Hillsborough Contractors LLC | Tampa, FL | (813) 555-0422 | hillsboroughcontractors.com
[...57 more in DB]

MARKET SIGNAL: Dense urban GC market. 87 companies in 8 queries — Tampa Bay has high construction activity. Many have websites, suggesting established businesses (not fly-by-night operators). High dedup rate (25/87) means we've touched this market before — rotate to St. Pete or Clearwater sub-region next run.

BRAIN OBSERVATION WRITTEN: tampa-bay-fl discovery — 62 inserts, 25 dupes, 8 queries

NEXT STEP: Run enrichment on 62 new leads (status=pending, source=maps)
```

**Notes:**
A good discovery run gives enough sample to judge quality without listing all 62. The market signal is the high-value output — it tells Todd whether to schedule enrichment immediately or rotate to a better market. The dedup rate insight prevents wasting enrichment runs on an exhausted market.

---

## Sample Task 2: Contact Enrichment
**Input message:**
```json
{ "task": "enrichment", "limit": 20, "status_filter": "pending", "source": "maps" }
```

**Expected output:**
```
ENRICHMENT RUN: 20 leads processed
Emails found: 5 (25% hit rate)
Partial (phone/LinkedIn only): 9
Failed (no contact found): 6
Duration: 4m 12s
Cost: $0.00

ENRICHED LEADS (email confirmed):
1. Gulf Coast General Contractors LLC
   Contact: Dave Morales, Owner
   Email: dave@gulfcoastgc.com
   Method: direct_scrape (About page)
   Confidence: 0.95

2. Bayshore Construction Group
   Contact: Lynn Petrova, Office Manager
   Email: lynn.petrova@bayshoreconst.com
   Method: bing_search → website scrape
   Confidence: 0.90

3. Suncoast Builders Inc
   Contact: Rick Suncoast (probable — name matched domain)
   Email: rick@suncoastbuilders.net
   Method: email_pattern (firstname@domain)
   Confidence: 0.62 — PARTIAL, verify before send

4. Hillsborough Contractors LLC
   Contact: Maria Torres, Controller
   Email: m.torres@hillsboroughcontractors.com
   Method: bing_search → LinkedIn → website
   Confidence: 0.88

5. Tampa Bay Renovation Co
   Contact: Joe Renaud, Owner
   Email: joe@tampabayrenovation.com
   Method: direct_scrape
   Confidence: 0.92

PARTIAL LEADS (phone or LinkedIn only — no email):
1. Clearwater Build Co — LinkedIn: /in/markwatts-cbc — no email found
2. Pinellas Plumbing & Build — Phone: (727) 555-0301 — website uses contact form only
[...7 more]

FAILED LEADS:
1. TBR Construction — company name too generic; 3 different "TBR Construction" orgs on Google
2. ACE General LLC — website is Wix placeholder; no contact info
[...4 more]

BRAIN OBSERVATIONS WRITTEN: 5 contact_found signals for pipeline session

NEXT STEP: Route 5 enriched leads (email confirmed) + 3 partial (LinkedIn) to Quill for outreach queue.
Flag Suncoast Builders confidence=0.62 — recommend Quill holds until email verified by first send bounce check.
```

**Notes:**
A good enrichment run documents the method and confidence for every result. Partial enrichments are still valuable (Quill can use LinkedIn for messaging). Failed enrichments explain why — Todd can decide whether to write them off or route to Charlie for a manual scraper fix.

---

## Sample Task 3: Lead Scoring
**Input message:**
```json
{ "task": "score", "lead_id": 201 }
```

**Expected output:**
```
LEAD SCORE: Gulf Coast General Contractors LLC
Lead ID: 201

Fit:         22/25 — GC with ~40 employees, uses QuickBooks (confirmed on website). Strong pilot fit.
Pain Signal: 20/25 — Google Reviews: 3.6 stars, 2 reviews mention "billing was confusing." Job posting for Bookkeeper on Indeed posted 3 days ago.
Timeliness:  23/25 — Hiring signal (Bookkeeper posting) = actively addressing finance function right now. High urgency.
Enrichment:  25/25 — Direct email confirmed (dave@gulfcoastgc.com), contact name verified, phone available.

TOTAL: 90/100
TIER: HOT

HOT LEAD — flagging to Todd for immediate routing to Quill (cold email, Jake CFO voice)

Pain Evidence:
- "Billing was confusing" (Google Review, Jan 2026)
- "Our invoices were never on time" (Google Review, Nov 2025)
- Bookkeeper job posting on Indeed: "Must be proficient in QuickBooks, construction industry preferred"

Suggested personalization angle: "You're hiring a bookkeeper — that means the current setup isn't keeping up."
```

**Notes:**
The scoring output should include the suggested personalization angle — this is the intelligence that makes Quill's cold email land. A score of 90 with no context is less useful than a score of 75 with a sharp personalization hook.

---

## Sample Task 4: Hiring Signal Monitor
**Input message:**
```json
{ "task": "monitor_hiring", "states": ["FL", "TX"], "limit": 30 }
```

**Expected output:**
```
HIRING SIGNAL MONITOR: FL + TX | 30 leads scanned
New signals found: 4
Existing leads updated: 4
New leads inserted: 0 (all signals matched existing cfo_leads records)

SIGNALS FOUND:
1. Apex Roofing (Austin, TX) — Job: "Financial Controller, QuickBooks required"
   Posted: 3 days ago | Source: Indeed
   Lead ID 147 — existing lead, timeliness score bumped from 15 → 25
   New TOTAL: 78/100 (was 68) — tier remains WARM

2. Coastal Build Partners (Miami, FL) — Job: "CFO / VP Finance — construction experience required"
   Posted: 1 day ago | Source: LinkedIn
   Lead ID 203 — existing lead
   New TOTAL: 82/100 — TIER UPGRADED: WARM → HOT
   HOT LEAD ALERT sent to Todd

3. Desert Sun Contractors (Phoenix, AZ) — Job: "Bookkeeper, Sage 300 experience preferred"
   Posted: 5 days ago | Source: Indeed
   NOT IN DB — recommend adding to discovery queue for Phoenix AZ region

4. Gulf Coast General Contractors (Tampa, FL) — Job: "Bookkeeper, QuickBooks required"
   Posted: 3 days ago | Source: Indeed
   Lead ID 201 — already flagged HOT from prior scoring run, no score change

NEXT STEPS:
- Todd: 2 HOT leads to route to Quill (Lead IDs 201, 203)
- Scout: Add Desert Sun Contractors (Phoenix AZ) to discovery queue — not yet in DB
```

**Notes:**
Signal monitoring creates compounding pipeline value — a lead that was WARM last week might go HOT today because of a single hiring post. The tier upgrade is the money output here. Scout should always report what changed, not just what was found.

---

## Sample Task 5: Post-Enrichment Failure Analysis
**Input message:**
```
3 consecutive enrichment runs have failed to find any emails for the Phoenix AZ batch.
20 leads, 0 emails found across all 3 runs.
Investigate why.
```

**Expected output:**
```
ENRICHMENT FAILURE ANALYSIS: Phoenix AZ — 0/20 emails across 3 runs

FINDING: 18 of 20 Phoenix GC companies have websites built on Wix, Squarespace, or contractor
directory templates. These sites use contact forms instead of displaying email addresses.
Standard scraping steps 0-1 cannot extract emails from form-only sites.

STEP-BY-STEP AUDIT (sample — Lead 211: Cactus Build LLC):
Step 0: direct domain guess → cactusbuildinc.com found via HEAD request ✓
Step 1: website scrape → contact page has form only, no email in page source ✗
Step 2: Bing search → "Cactus Build LLC contact email" → results link back to same website ✗
Step 3: LinkedIn → profile found: linkedin.com/in/bobcactus — no email displayed ✓ (partial)
Step 4: email pattern → bob@cactusbuildinc.com, b.flores@cactusbuildinc.com generated
         → cannot verify without sending (confidence: 0.55)
Step 5: All steps exhausted — marked partial (LinkedIn only)

ROOT CAUSE: Phoenix GC market skews toward sole proprietors with form-only sites.
Email pattern guesses generated for 12/20 leads at 0.55 confidence — usable but risky.

RECOMMENDATIONS:
Option A: Accept the 12 pattern-guess emails at 0.55 confidence. Route to Quill with
          note: "pattern guess — monitor bounce rate closely on first send."
Option B: Route to Charlie to build a LinkedIn outreach variant that doesn't require email.
Option C: Rotate discovery region — Denver or Austin have higher direct-email hit rates.

Flagging to Todd: recommend Option A + C (use what we have, rotate market next discovery run)
```

**Notes:**
A failure analysis is only useful if it has a concrete recommendation at the end. Scout should never just report "no emails found" — the diagnosis of *why* is what enables Todd and Charlie to make a decision.
