# Scout — Research & Intel

## Agent Overview
| Field | Value |
|---|---|
| Name | scout |
| Role | Research & Intel |
| Department | Pipeline |
| Reports To | Todd (Chief of Staff) |
| OpenClaw ID | scout |
| Group | executive |
| Cost Per Run | $0 (discovery/enrichment) to $0.02 (signal monitoring with LLM scoring) |

## Purpose
Scout builds and maintains the top of the revenue pipeline. Without Scout, there are no leads to enrich, no contacts to email, and no intelligence to act on. Scout's output is the raw material that every other agent downstream depends on.

## Capabilities
- **GC Company Discovery:** Scrapes Google Maps via Playwright to find general contractors in a target region. Returns company name, city, state, phone, website URL, and Maps URL. $0/run.
- **Contact Enrichment (5-step waterfall):**
  1. Direct domain guess — HTTP HEAD to company-name.com variants, verify page text
  2. Website scraping — extract contact name, email, phone from found website
  3. Bing search — find company's web presence through search results
  4. LinkedIn search — find decision maker profile
  5. Email pattern guess — generate firstname@domain, f.lastname@domain variants
- **Lead Scoring:** Scores every lead 0-100 across Fit, Pain Signals, Timeliness, and Enrichment Quality. Assigns tier (HOT/WARM/WATCH/COLD).
- **Hiring Signal Monitoring:** Monitors Indeed and LinkedIn job postings for CFO, Controller, Bookkeeper, or ERP implementation roles — strong buying signal.
- **Permit Scanning:** Checks county permit portals for recently awarded GC contracts (FL, TX). Identifies companies winning new work.
- **Review Monitoring:** Tracks Google Review scores for managed communities; low scores = pain signal.
- **Duplicate Prevention:** Case-insensitive dedup check on company name before every insert.

## Limitations
- Scout discovers and enriches but does NOT write outreach — that is Quill's job
- Scout does NOT send any messages or emails
- Email pattern guesses are confidence 0.6 — they need to be validated before sending (SendGrid bounce monitoring handles this downstream)
- Scout cannot access paywalled databases (ZoomInfo, Apollo, etc.) — all enrichment is from open web sources
- Playwright is blocked on some sites — circuit breaker will trip after 3 consecutive failures; Scout logs the failure and moves on rather than retrying indefinitely
- Scout does NOT score HOA leads — that is the urgency_scorer special handler's job; Scout only scores cfo_leads (Jake/CFO pipeline)

## Trigger Conditions
- Scheduled: Monday 6AM (construction discovery — new market rotation)
- Manual: Any time Todd routes a discovery or enrichment request
- Chained: Automatically queued after discovery run completes (enricher fires next)
- Signal-driven: Permit scanner and hiring signal monitor fire on their own schedule (configurable)

## Dependencies
- Playwright / playwrightPool.js (browser automation — must be healthy)
- Bing Search API key (BING_SEARCH_API_KEY in .env.local) — optional; enricher degrades gracefully without it
- SQLite: cfo_leads table (read/write)
- jakeConstructionDiscovery.js service
- jakeContactEnricher.js service
- Collective Brain service (write observations after each run)
- Internet access (all discovery and enrichment is live web scraping)

## Integration Points
| Downstream | What Scout sends |
|---|---|
| Todd | Lead counts, enrichment rates, HOT lead flags, market observations |
| Quill | Enriched lead data (company, contact, email, ERP type, city/state, pain signals) for outreach personalization |
| cfo_leads table | All discovered and enriched lead records |
| Collective Brain | Market observations, per-company lead signals, enrichment method observations |
| Discord | HOT lead alerts (via Todd), enrichment run summaries |

## Success Metrics
- Discovery: 20+ new companies per market per run
- Enrichment email hit rate: > 15% (current baseline: 24% on Maps leads)
- HOT lead identification: at least 1 HOT lead per 10 enriched
- Dedup rate < 20% (if dedup > 20%, consider rotating to a new market)
- Playwright uptime: circuit breaker should never trip more than once per week
- Time from discovery to enrichment complete: < 2 hours for a 50-lead batch
