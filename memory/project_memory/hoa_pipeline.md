# Project Memory — HOA Project Funding Pipeline
*Last updated: 2026-03-17 by memoryBridge*

---

## Project Header

| Field | Value |
|-------|-------|
| **Name** | HOA Project Funding — Lead Generation and Outreach Pipeline |
| **Status** | ACTIVE |
| **Owner** | Steve Pilcher (human) / Todd (orchestration) |
| **Started** | 2026-02 |
| **Last Updated** | 2026-03-13 |
| **Mission** | Discover HOA communities with active funding needs, enrich board contact data, and connect them with the HOA project funding platform at hoaprojectfunding.com |

---

## Current Pipeline State

**Snapshot: 2026-03-13**

| Stage | Count | Notes |
|-------|-------|-------|
| Communities discovered | 568+ | South Florida test: 568 HOAs, 162 queries, $0 cost |
| Geo-targets configured | 19 | FL, TX, AZ, NV, GA + 9x CA metro areas |
| Contacts enriched | Low (lagging) | Contact enrichment not keeping pace with discovery volume |
| Outreach drafted | 0 | No outreach sent yet |
| HOT tier communities | Unknown | Needs minutes monitor and reviews monitor data |
| WARM tier communities | Unknown | — |
| Blog posts published | Active | Mon 8AM content engine → Mon 8:30AM CMS publisher → GitHub → Netlify |
| Social posts | Active | Daily 10AM Facebook poster |
| **Pipeline value** | **$0 realized** | Revenue model: platform referrals / affiliate commissions from lenders |

---

## Key Decisions Made

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02 | Use Google Maps (Playwright, $0/run) as primary discovery source | No API cost; 162+ queries per geo-target at scale |
| 2026-02 | 19 geo-targets across FL/TX/AZ/NV/GA/CA | Prioritizes high-HOA-density Sun Belt markets |
| 2026-02 | Minutes monitor + reviews monitor as intent signals | HOA minutes with "special assessment" or "reserve study" = hot lead; bad reviews = pain signal |
| 2026-02 | Blog + social as top-of-funnel while outreach pipeline builds | Content warms market while discovery/enrichment catches up |
| 2026-03 | HOA engagement queue uses `lg_engagement_queue` table | Separate from Jake/CFO pipeline — different product, different buyer |

---

## What's Working

- **HOA Discovery ($0, Playwright):** `hoa-discovery` with `googleMapsDiscovery.js` — South Florida test produced 568 communities in 18 minutes at $0.
- **Geo-target rotation:** 19 targets across high-HOA-density Sun Belt markets. FL first (most HOAs per capita), then TX, CA, AZ, NV, GA.
- **Blog publishing pipeline:** Content writer (Mon 8AM) → CMS publisher (Mon 8:30AM) → GitHub API → Netlify auto-deploy (~60s). Producing consistent SEO content.
- **Facebook poster:** Daily 10AM automated post from content pipeline.
- **Minutes monitor:** `hoa-minutes-monitor` scans HOA board meeting minutes for funding signals (special assessments, reserve studies, project approvals). HOT/WARM/WATCH tier assignment.
- **Google Reviews monitor:** `google-reviews-monitor` scans reviews for management quality signals — bad reviews = HOA in pain = warm prospect.

---

## What's Not Working

- **Contact enrichment lagging discovery:** 568 communities discovered, but contact enrichment (finding board member emails) is severely behind. Discovery is running at scale; enrichment is not.
- **No outreach sent yet:** Zero emails sent to HOA contacts. Discovery-to-outreach pipeline not connected.
- **Engagement queue backlog:** `lg_engagement_queue` may have pending items not being reviewed or posted.
- **Contact quality unknown:** HOA board member emails are harder to find than B2B construction contacts — LinkedIn profiles are less consistent.

---

## Next Milestone

**Target:** First HOA outreach email sent to a HOT-tier community contact
**Metric:** 1 email sent with a real contact email address
**By when:** 2026-03-27
**Owner:** hoa-outreach-drafter + Steve (approve first send)
**Blocked by:** Contact enrichment must find at least 1 verified email for a HOT-tier community

---

## Blockers

| Blocker | Impact | Owner | Status |
|---------|--------|-------|--------|
| Contact enrichment behind discovery | 568 communities, near-zero emails found | hoa-contact-enricher — needs prioritization on HOT tier first | OPEN |
| No HOT tier count known | Can't target outreach without tier data | hoa-minutes-monitor + google-reviews-monitor must run and score all 568 | OPEN |
| No outreach copy approved | Draft sequences exist in `hoa-outreach-drafter` SOUL.md but not sent | Steve must review outreach template | OPEN |

---

## Agent Assignments

| Agent | Role | Schedule / Trigger |
|-------|------|--------------------|
| hoa-discovery | Google Maps HOA community scraper | Mon 6AM (geo-target rotation) |
| hoa-contact-finder | Finds board member names from community websites | After discovery |
| hoa-contact-enricher | Enriches contacts with email + phone | After contact-finder |
| hoa-outreach-drafter | Drafts personalized outreach for HOT/WARM leads | After enrichment; Steve approves |
| hoa-minutes-monitor | Scans HOA meeting minutes for funding signals | Scheduled (20 HOAs per run) |
| google-reviews-monitor | Scans Google Reviews for management pain signals | Scheduled (10 HOAs per run) |
| hoa-content-writer | Blog posts for hoaprojectfunding.com | Mon 8AM |
| hoa-cms-publisher | Publishes content via GitHub API → Netlify | Mon 8:30AM |
| hoa-facebook-poster | Posts to HOA project funding Facebook | Daily 10AM |
| urgency-scorer | Scores lg_engagement_queue by HOT/WARM/WATCH/COLD | Mon 6AM |
| lead-dossier-generator | Assembles HOA engagement dossiers for outreach agent | Batch mode, on demand |

---

## Geo-Target Reference

19 configured targets:
- **Florida (4):** South Florida, Tampa Bay, Orlando, Jacksonville
- **Texas (3):** Houston, Dallas-Fort Worth, San Antonio
- **California (9):** Los Angeles, San Diego, San Francisco Bay Area, Sacramento, Inland Empire, Orange County, Fresno, San Jose, Bakersfield
- **Other (3):** Phoenix AZ, Las Vegas NV, Atlanta GA

Priority order: FL → TX → CA → AZ/NV/GA (based on HOA density and financing need)

---

## Memory Write Log

| Date | Updated By | What Changed |
|------|-----------|-------------|
| 2026-03-13 | system-init | Initial file created from known state as of 2026-03-13 |
