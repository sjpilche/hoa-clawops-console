# OpenClaw Integration Prompt Template
### Use this to wire any lead-finder website into ClawOps as a new workspace

---

## THE PROMPT

Copy and paste this into Claude Code, filling in the `[BRACKETS]`:

---

I want to integrate my [SITE NAME] website into my existing hoa-clawops-console (ClawOps) OpenClaw agent system as a new workspace. ClawOps is a Node.js/Express app running on PM2 at port 3001 with SQLite DB, a cron scheduler, and a special_handlers pattern for deterministic agents.

**My website:**
- Name: [SITE NAME]
- What it does: [e.g. "finds packaging industry leads — companies looking for contract packaging, co-packing partners, or fulfillment providers"]
- Stack: [e.g. Python/FastAPI on port XXXX, or Node/Express on port XXXX]
- Database: [e.g. PostgreSQL, SQLite, MongoDB]
- It already has (or I need): webhook endpoints to receive data from agents

**What I want OpenClaw to do 24/7:**
1. [e.g. "Scan LinkedIn/Google/trade publications for companies actively looking for co-packing partners"]
2. [e.g. "Research decision-makers at target companies (Ops Manager, VP Supply Chain, COO)"]
3. [e.g. "Monitor industry news for signals: new product launches, supply chain disruptions, private equity buyouts — events that create packaging demand"]
4. [e.g. "Find net-new leads not yet in my DB from trade show announcements, press releases, job postings"]

**Target markets / industries:**
[e.g. "CPG brands 10–500 employees, food & beverage and personal care, US-based, funded startups or established brands launching new SKUs"]

**Follow the exact pattern already built for dc-site-intel:**

1. **Webhook endpoints on my site** (I need these created or I'll describe ones I have):
   - `GET /webhooks/openclaw/leads/candidates` — returns leads needing research (auth: X-OpenClaw-Secret header)
   - `POST /webhooks/openclaw/lead-intel` — receives research findings about a lead
   - `POST /webhooks/openclaw/new-lead` — creates a net-new lead discovered by the scout agent
   - `POST /webhooks/openclaw/contact-intel` — updates contact/decision-maker info

2. **ClawOps workspace** (`openclaw-skills/[SITE-SLUG]/`):
   - `MANDATE.md` — workspace mission, target market definition, what a good lead looks like, API endpoint reference, quality bar (no fabrication, source URL required)

3. **Agent SOUL files** (`openclaw-skills/[SITE-SLUG]-[agent-name]/SOUL.md`) for each agent:
   - `[SITE-SLUG]-lead-monitor` — daily market scanner (news, job postings, funding rounds that signal need)
   - `[SITE-SLUG]-lead-research` — single lead deep-dive (company profile, decision-makers, pain signals)
   - `[SITE-SLUG]-research-queue` — batch processor (fetches queue, runs lead-research on each)
   - `[SITE-SLUG]-opportunity-scout` — net-new lead finder (scans sources for companies not yet in DB)

4. **Handler file** (`server/services/[siteName].js`) — 4 exported async functions following the exact ClawOps special_handler pattern:
   ```js
   async ({ message, runId, agent, agentConfig }) => {
     // use fetch() for Brave Search + HTTP calls to my site
     // return { outputText, durationMs, costUsd: 0, extra: {} }
   }
   ```
   Use `BRAVE_API_KEY` from env (already set in .env.local). Use `[SITE_URL]` and `[SITE_SECRET]` env vars.

5. **Register handlers** in `server/routes/runs.js` after the SPECIAL_HANDLERS closing brace:
   ```js
   const [siteName] = require('../services/[siteName]');
   SPECIAL_HANDLERS.[site_slug]_lead_monitor = [siteName].[siteName]LeadMonitor;
   // etc.
   ```

6. **Add agents** to `scripts/seed-all-agents.js` AGENT_FLEET array — group: '[SITE-SLUG]'

7. **Add schedules** to `scripts/seed-all-schedules.js` SCHEDULES array:
   - Scout: daily 5am
   - Monitor: daily 7am
   - Research queue: Monday 6am

8. **Env vars** in `.env.local`:
   ```
   [SITE_SLUG_UPPER]_URL=http://localhost:[PORT]
   [SITE_SLUG_UPPER]_SECRET=[shared-webhook-secret]
   ```

9. **Env var** on my site's `.env`:
   ```
   OPENCLAW_WEBHOOK_SECRET=[shared-webhook-secret]
   ```

**Important constraints:**
- All agents use Brave Search only (no LLM calls) — cost must be $0
- Brave has 2,000 queries/month — keep each agent run to ≤10 searches
- All HTTP calls to my site must include `X-OpenClaw-Secret: [SECRET]` header
- Max 5 new leads per scout run (quality over quantity)
- Every auto-created lead must be labeled `"Scout: ..."` so I know it needs human review
- Call `brain.observe()` for Collective Brain memory after each run (same as other dc-intel handlers)
- Follow the exact error handling and return shape pattern from `server/services/dcIntel.js`

Please implement all of this. Start with the webhook endpoints on my site, then the handler file, then the wiring. Show me what env vars to set at the end.

---

## WHAT TO FILL IN

| Placeholder | Example for packaging leads site |
|-------------|----------------------------------|
| `[SITE NAME]` | PackagInate Lead Finder |
| `[SITE-SLUG]` | pkg-intel |
| `[siteName]` | pkgIntel (camelCase for JS) |
| `[PORT]` | 8096 (or whatever your site uses) |
| `[SITE_SLUG_UPPER]` | PKG_INTEL |
| `[shared-webhook-secret]` | pkgi-openclaw-2026 |
| Target market | CPG brands 10-500 employees seeking co-packing |
| Agent missions | Lead monitor, company researcher, batch queue, scout |
| Brave queries | "{company} co-packing partner RFQ", "{industry} contract packaging demand 2026" |

## TIPS

- **The more specific your target market description, the better the Brave Search queries will be.** Don't say "leads" — say "CPG brands with 10-500 employees who just raised a Series A and are launching new SKUs."
- **Describe your existing webhook endpoints** if you have them. If not, tell Claude your DB schema and it will design the right endpoints.
- **The MANDATE.md is the most important doc** — it tells the agents what a "good" lead is vs. noise. Be precise about what makes a lead worth creating.
- **Brave Search query design is everything.** Think about what signals appear in press releases, job postings, or news when a company needs what you sell. That's your query language.
