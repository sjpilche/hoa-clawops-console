# Current Projects — Steve Pilcher
*OpenClaw Agent Context File*
*Last updated: 2026-03-13*

---

## PROJECT STATUS KEY
- **ACTIVE** — Live, agents running, generating output daily
- **BUILDING** — In development, not yet generating revenue
- **EXPLORING** — Hypothesis being validated, no commitment yet
- **PAUSED** — Real project, not current focus

---

## PROJECT 1: ClawOps Console
**Status:** ACTIVE — Production
**Type:** Internal infrastructure / potential SaaS

### What it is:
A full-stack AI agent operating system built on Node.js + OpenClaw CLI. Hosts 53 agents, custom scheduler, pipeline orchestration, Collective Brain memory layer, and a React console UI.

### What it does:
- Runs automated marketing, lead gen, content, and outreach pipelines 24/7
- Manages all other projects listed below as agent fleets
- Tracks costs, runs, schedules, and pipeline state
- Routes low-cost tasks to local Ollama (free) vs. GPT-4o (paid)

### Revenue potential:
- Could be productized as a SaaS for construction operators, HOA managers, or small business owners
- Potential white-label for marketing agencies

### Current agents online: 53
### Schedules running: 41 active cron jobs

---

## PROJECT 2: Jake / CFO Marketing Automation
**Status:** ACTIVE — Pipeline running
**Type:** Lead generation + outreach SaaS marketing

### What it is:
Automated pipeline targeting construction CFOs and controllers selling a data cleanup / ERP automation service.

### Pipeline stages:
1. Jake Construction Discovery — Google Maps scraper finds GC companies ($0/run)
2. Jake Contact Enricher — 5-step waterfall finds email/phone ($0/run)
3. Jake Lead Scout — LLM-powered national lead research (GPT-4o)
4. Jake Outreach Agent — personalized cold email drafts
5. Jake Follow-Up Agent — day-5 follow-up drafts
6. Jake Reply Classifier — auto-categorizes replies ($0)
7. Jake Meeting Booker — meeting confirmation drafts

### Current pipeline state:
- 54 Maps leads: 13 email found, 12 partial, 29 failed, 4 pending
- 24% email hit rate on Maps leads
- Outreach drafts generating, pending send approval

### What agents should do:
- Keep running enrichment on pending leads
- Scout new markets on rotation
- Flag any INTERESTED replies immediately

---

## PROJECT 3: HOA Project Funding Pipeline
**Status:** ACTIVE — Discovery running
**Type:** Deal sourcing + financing referral / SaaS

### What it is:
Automated pipeline discovering HOAs with capital needs (reserve shortfalls, special assessments) and matching them with funding options.

### Pipeline stages:
1. HOA Discovery — Google Maps + county data ($0, Playwright)
2. HOA Contact Finder — finds board members/managers
3. HOA Contact Enricher — email/phone enrichment
4. HOA Outreach Drafter — personalized funding outreach
5. HOA Minutes Monitor — scans meeting minutes for capital signals
6. Google Reviews Monitor — reputation signals for tier upgrades

### Revenue model being tested:
- Referral fees from lenders/funding sources
- SaaS tool for HOA managers
- Done-for-you capital sourcing service

### Current state:
- South Florida test: 568 HOAs discovered, 162 queries, $0 cost
- 19 geo-targets configured (FL, TX, AZ, NV, GA, CA)

---

## PROJECT 4: Data Rehab / ERP Automation Services
**Status:** BUILDING
**Type:** Professional services → productized SaaS

### What it is:
Consulting + tool service for construction companies with messy financial data — bad chart of accounts, QB/Sage/BC migrations, historical data cleanup, AR automation.

### Steve's edge:
- Deep ERP expertise (Sage 300, QuickBooks, Business Central, Procore)
- Has lived these problems as a construction CFO
- Can build AI tools to automate what consultants currently charge $200/hr for

### Revenue model:
- Project-based cleanup engagements ($5K–$50K)
- Recurring automation subscriptions
- ERP implementation augmentation

### Current state:
- Brand identity via Jake/CFO agents
- Outreach pipeline being built
- No paying customers yet — this is the target

---

## PROJECT 5: Owen CFO Content Brand
**Status:** ACTIVE — Content publishing
**Type:** Thought leadership → inbound leads

### What it is:
Content marketing brand (Owen CFO) targeting construction CFOs with useful financial operations content.

### Channels:
- Blog (published via GitHub/Netlify)
- LinkedIn posts
- Facebook
- Email sequences

### Agents running:
- Content engine (Mon 8AM)
- CMS publisher (Mon 8:30AM)
- Social scheduler
- Analytics monitor

### Purpose:
- Build credibility in construction finance niche
- Drive inbound leads to Jake/CFO outreach pipeline
- Position Steve as a thought leader for future product launches

---

## PIPELINE OVERVIEW

```
Discovery → Enrichment → Outreach → Reply → Meeting → Close
  Jake          Jake          Jake      Jake     Jake
  HOA           HOA           HOA       HOA      HOA
```

Both pipelines share the same DB tables (cfo_leads, cfo_outreach_sequences) with `source_agent` tracking Jake vs HOA origin.

---

## UPCOMING EXPERIMENTS (Queue)

| Idea | ICE Score | Status |
|------|-----------|--------|
| AI micro-SaaS for construction job cost reporting | TBD | Exploring |
| HOA capital funding referral network | TBD | Exploring |
| ClawOps as SaaS for small operators | TBD | Exploring |
| Permit data → construction lead signal | TBD | Queued |
| Bid result scraper → Jake pipeline | TBD | Queued |

---

*Agents: treat Projects 1-3 as the active core. Generate leads, escalate opportunities, and flag anything that could accelerate revenue in any of these pipelines.*
