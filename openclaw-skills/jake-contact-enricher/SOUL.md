# Jake Contact Enricher

**Type**: SPECIAL_HANDLER (deterministic Playwright scraper, NOT an LLM agent)
**Cost**: $0/run
**Handler**: `jake_contact_enricher` in `server/routes/runs.js`
**Service**: `server/services/jakeContactEnricher.js`

This agent finds email addresses and contact info for construction company leads in the `cfo_leads` table. It runs as a Playwright-based web scraper — no LLM calls, no OpenAI costs. It is the **critical bottleneck** between discovery and outreach — if enrichment fails, the pipeline produces zero emails.

---

## What It Does

5-step enrichment waterfall for each lead lacking `contact_email`:

1. **Step 0: Direct domain guess** — Constructs common email patterns from contact name + company domain. Verifies via HTTP. Fastest, ~27% hit rate on unique names.
2. **Step 1: Website scrape** — Scrapes the company's /contact, /about, /team pages for email addresses.
3. **Step 2: Bing search** — Searches for "[company] [city] [state] contact email CFO controller"
4. **Step 3: Search result scrape** — Visits top Bing results and extracts emails from page content.
5. **Step 4: LinkedIn search** — Searches for `site:linkedin.com "[company]" CFO` — finds profiles, rarely emails.
6. **Step 5: LLM DOM extractor** — Fallback: uses LLM to extract contact data from unstructured page text ($0 via Ollama).

## Input

```json
{
  "limit": 20,
  "min_score": 0,
  "status_filter": "pending",
  "source": null
}
```

## Output

Updates `cfo_leads` directly:
- `contact_email` — verified email address
- `contact_name` — found name (if not already set)
- `contact_title` — CFO / Controller / Owner
- `contact_linkedin` — LinkedIn profile URL
- `phone` — phone number if found
- `website` — company website if found
- `enrichment_status` — 'enriched', 'partial', or 'failed'
- `enrichment_method` — which step succeeded (domain_guess, website, bing, linkedin, pattern_guess, dom_extractor)

Also writes:
- Brain Layer 1 `contact_found` observations for each successful enrichment
- Audit log `enricher_quality` with hit rate, method distribution

## Pipeline Position

Runs AFTER lead scout / discovery, BEFORE outreach agent:
```
jake-lead-scout / jake-construction-discovery
    ↓
jake-contact-enricher  ← YOU ARE HERE
    ↓
lead-dossier-generator → jake-outreach-agent
```

---

## Non-Goals

- Do NOT scrape gated, paywalled, or login-required sites
- Do NOT guess emails for single-word company names (e.g., "Contractors") — too many false matches, domain guess will fail
- Do NOT enrich leads with `pilot_fit_score < 20` — these are too low-quality to waste Playwright resources on
- Do NOT mark a lead as `enriched` if the only email found is a generic role address (info@, admin@, support@, contact@) — these are `partial` at best
- Do NOT retry a lead that has already failed enrichment 2 times — mark as `failed` permanently
- Do NOT modify `pilot_fit_score`, `status`, or any field beyond the enrichment columns
- Do NOT send any external communications

## Failure Handling

| Failure | Action |
|---------|--------|
| Playwright page timeout | Skip lead, log failure, move to next. Circuit breaker handles repeated failures. |
| All 5 steps return nothing | Set `enrichment_status = 'failed'`. This is expected for ~50% of Google Maps leads. |
| Company website returns 403/404 | Skip website step, proceed to Bing search. |
| Generic email found (info@, admin@) | Set `enrichment_status = 'partial'`, NOT `enriched`. Outreach agent should NOT use generic emails. |
| Lead already enriched (race condition) | Skip silently. Dedup is handled by checking status before enrichment. |
| Consecutive failures >10 in batch | Log warning. Playwright circuit breaker will pause if needed. |

## Success Thresholds

| Metric | Target | Alert If |
|--------|--------|----------|
| Hit rate (emails found / leads attempted) | >= 20% for Maps leads, >= 40% for Scout leads | < 15% → Discord alert |
| Generic email rate | < 10% of total enriched | > 20% → review email classification |
| Method distribution | Step 0 (domain) should be 30-50% of successes | Step 0 < 10% → domain guessing may be broken |
| Enrichment time per lead | < 30 seconds average | > 60 seconds → Playwright pool may be degraded |

## Memory Rules

- Write Brain `contact_found` observation for every successful enrichment (already implemented)
- Write Brain `enrichment_failed` for leads that fail on all steps (for downstream agents to know which companies are unenrichable)
- Log method distribution to `audit_log` every run (already implemented)
- Do NOT write daily log entries — the handler handles all persistence

## Tool Allowlist

- Playwright (headless Chromium via `playwrightPool.js`) — website scraping
- Bing search (via Playwright page navigation)
- LLM DOM extractor (Step 5 fallback only, via `domExtractor.js`, $0 Ollama)
- SQLite read/write (`cfo_leads` table only)
- Brain observation writes

**Explicitly denied:** `exec`, `write` (file system), `web_search` (OpenClaw tool), any external API
