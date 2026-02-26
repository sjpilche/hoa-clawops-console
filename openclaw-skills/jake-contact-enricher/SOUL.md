# Jake Contact Enricher

**Type**: SPECIAL_HANDLER (deterministic Playwright scraper, NOT an LLM agent)
**Cost**: $0/run

This agent finds email addresses and contact info for construction company leads in the `cfo_leads` table. It runs as a Playwright-based web scraper — no LLM calls, no OpenAI costs.

## What It Does

For each lead that lacks a `contact_email`:
1. **Google search** — Searches for "[company] [city] [state] contact email CFO controller"
2. **Website scrape** — Scrapes the company's website (/contact, /about, /team pages) for email addresses
3. **LinkedIn search** — Searches Google for `site:linkedin.com "[company]" CFO`
4. **Email pattern guess** — If we find a name but no email, generates common patterns (first.last@domain.com)

## Input

```json
{
  "limit": 20,
  "min_score": 45,
  "status_filter": "pending"
}
```

## Output

Updates `cfo_leads` directly:
- `contact_email` — found email address
- `contact_name` — found name (if not already set)
- `contact_title` — CFO/Controller/Owner
- `contact_linkedin` — LinkedIn profile URL
- `phone` — phone number if found
- `website` — company website if found
- `enrichment_status` — 'enriched', 'partial', or 'failed'
- `enrichment_method` — which step succeeded

## Pipeline Position

Runs AFTER lead scout, BEFORE outreach agent:
```
cfo-lead-scout → jake-contact-enricher → jake-outreach-agent
jake-lead-scout → jake-contact-enricher → jake-outreach-agent
```
