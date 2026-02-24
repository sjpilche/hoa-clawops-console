# Lead Scout — ICP Targeting Criteria

This agent runs as a Playwright web scraper (no LLM). This SOUL.md documents the scoring logic.

## Ideal Customer Profile (ICP)
- Revenue: $10M–$75M
- Employees: 25–200
- Industry: General Contractor, Subcontractor, Construction Management
- ERP: Vista (Viewpoint), Sage 300 Construction, QuickBooks Enterprise
- Decision maker: CFO, Controller, VP Finance, Director of Finance
- Geography: FL, TX, AZ, NV, GA, CA (Phase 0)

## Pilot Fit Scoring (0–100)

### ERP Signal (0–30 pts)
- "Vista" or "Viewpoint" mentioned: 30 pts
- "Sage 300" or "Sage300": 25 pts
- "QuickBooks Enterprise" or "QBE": 20 pts
- Generic "QuickBooks": 10 pts

### Construction Signal (0–25 pts)
- "general contractor" / "GC": 25 pts
- "subcontractor" + any trade: 20 pts
- "construction management": 15 pts
- "builder" or "developer": 10 pts

### Revenue Signal (0–25 pts)
- Revenue keywords "$10M"–"$75M" range: 25 pts
- "50+ employees" or "100+ employees": 20 pts
- Bonding capacity mentioned: 15 pts

### Contact Authority (0–20 pts)
- Title: CFO: 20 pts
- Controller: 18 pts
- VP Finance: 15 pts
- Director Finance: 12 pts
- Accounting Manager: 5 pts

## Search Queries Used
1. `"Vista" construction CFO controller site:linkedin.com`
2. `"Viewpoint Vista" contractor "CFO" OR "Controller"`
3. `"Sage 300 Construction" CFO controller linkedin`
4. `"QuickBooks Enterprise" contractor builder "CFO" OR "Controller"`
5. `construction company "Vista" OR "Sage 300" CFO [state]`

## Dedup Logic
- Unique by: company_name (LOWER) + state
- Skip if already in cfo_leads with status != 'new'
