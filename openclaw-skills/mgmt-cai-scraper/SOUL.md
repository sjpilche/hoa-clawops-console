# Agent 40: CAI Member Directory Scraper
## OpenClaw Prompt Spec

**Agent Name in OpenClaw:** CAI Directory Scraper
**Run Schedule:** Weekly (Sundays 1am) — before other agents
**Goal:** Scrape Community Associations Institute directories to build the master list of management companies.

> **THIS AGENT RUNS FIRST.** It feeds the target list to Agents 36-39.
> CAI is THE industry association — their directory is essentially a census
> of every professional management company in the US.

---

## SYSTEM PROMPT

You are a database builder for HOA Project Funding. Your job is to scrape the Community Associations Institute (CAI) national and chapter-level member directories to build a comprehensive list of HOA management companies. Extract company details, designations, service areas, and portfolio sizes.

Focus on management companies (not individual members or vendors). Prioritize companies with AAMC designation — they manage the largest portfolios.

---

## TARGET CHAPTERS

### FLORIDA (5)
- SE Florida (cai-seflorida.org) — Miami-Dade, Broward, Palm Beach
- Central Florida (caicf.org) — Orlando, Tampa metro
- North Florida (cainf.org) — Jacksonville, NE Florida
- Gulf Coast (caigulfcoast.org) — Fort Myers, Naples, SW Florida
- Suncoast (cai-suncoast.org) — Sarasota, Bradenton

### CALIFORNIA (6)
- CLAC (cai-clac.org) — Statewide legislative
- Greater LA (cai-glac.org) — LA County
- San Diego (caisandiego.org) — San Diego County
- Channel Islands (caicic.org) — Ventura, Santa Barbara
- Greater Inland Empire (cai-gie.org) — Riverside, San Bernardino
- Orange County (caioc.org) — Orange County

### COLORADO (1)
- Rocky Mountain (cai-rmc.org) — Statewide

---

## DESIGNATION TIERS

| Designation | Meaning | Priority |
|-------------|---------|----------|
| **AAMC** | Accredited Association Management Company | **TOP TIER** |
| **CMCA** | Certified Manager of Community Associations | Individual |
| **AMS** | Association Management Specialist | Individual |
| **PCAM** | Professional Community Association Manager | Individual |
| **LSM** | Large-Scale Manager | Individual |

Company priority:
- **AAMC_TOP** — Has AAMC designation
- **DESIGNATED** — Has other CAI designations or designated employees
- **MEMBER** — CAI member but no designations

---

## IMPLEMENTATION NOTE

This agent runs as a **Playwright special_handler** — pure Node.js, $0 cost.
No LLM calls. Browser automation navigates CAI chapter directories and extracts listings.
