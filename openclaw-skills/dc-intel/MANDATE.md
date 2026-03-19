# DC Site Intel — Workspace Mandate

## Mission
Find, research, and surface data center and warehouse land opportunities in target markets before competitors do. Push every meaningful finding to DC Site Intel so Doug and Steve can act on it.

## Business Context
Privium Pilch brokers DC/warehouse land deals — primarily in the Chicago metro (ComEd territory) and DC/NoVA/MD corridor. The value is in originating deals early: finding motivated sellers, identifying parcels that meet data center or warehouse criteria, and getting there before hyperscalers do.

A deal fee is $100K–$500K+ on a typical acquisition. Every qualified opportunity counts.

## Target Markets
**Illinois (ComEd RTO):**
- Cook County, IL
- Will County, IL
- DuPage County, IL
- Kendall County, IL
- Kane County, IL

**DC/NoVA/MD Corridor:**
- Loudoun County, VA (data center alley)
- Prince William County, VA
- Montgomery County, MD
- Prince George's County, MD

## What Makes a Good Opportunity

**Physical criteria (data center):**
- 5–500 acres (sweet spot: 20–100 acres)
- Within 5km of 138kV+ transmission line or substation
- < 5% slope, < 5% flood zone
- Zoning: heavy industrial or fast rezone path
- Water service accessible (cooling)

**Deal criteria:**
- Single owner or < 3 parcels to assemble
- Owner is LLC/individual (not municipality or active developer)
- Owner hasn't actively developed the site (absentee preferred)
- No competing sale process underway

**Motivated seller signals:**
- Tax delinquency or tax lien
- Estate / probate filing
- LLC dissolved or inactive
- Divorce or litigation touching the property
- Recent foreclosure notice

## Output Quality Bar
- Only report what you can source. No fabrication.
- Every intel note must have a source URL if one exists.
- Confidence = high only for primary sources (court records, SOS filings, news articles).
- One note per signal — don't create duplicates.
- New opportunities created by scout should be clearly labeled as auto-discovered.

## API Endpoints
DC Site Intel runs at DC_SITE_INTEL_URL (env var).
Auth header: X-OpenClaw-Secret (DC_SITE_INTEL_SECRET env var).

Key endpoints:
- GET  /webhooks/openclaw/parcels/candidates  — owners needing research
- POST /webhooks/openclaw/owner-intel         — push owner research findings
- POST /webhooks/openclaw/intel-note          — push market/timing/utility signals
- POST /webhooks/openclaw/owner-contact       — push phone/email found
- POST /opportunities                         — create new stub opportunity
- POST /opportunities/auto-generate           — DB parcel sweep, returns top-scored new opps
- GET  /webhooks/openclaw/rto-signals         — PJM/MISO power queue filings in target markets
- GET  /webhooks/openclaw/planning-events     — county rezoning/permit filings in target counties
- POST /apollo/find-decision-makers           — find principals behind corporate owner
