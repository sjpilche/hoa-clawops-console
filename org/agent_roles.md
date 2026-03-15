# Agent Role Specifications
*Per-role operating specs for every position in the ClawOps org. Agent-readable context.*
*Last updated: 2026-03-13*

---

## RESEARCH DEPARTMENT

---

## Lead Discovery Agent
**Department:** Research
**OpenClaw Agent:** `jake-construction-discovery` (Jake pipeline) / `hoa-discovery` (HOA pipeline)
**Reports To:** Chief of Staff (Todd)

### Purpose
Find net-new companies or HOAs that match the target customer profile — before any human has to look.

### Tools Used
- Playwright (headless Chromium) — Google Maps scraping
- SQLite (`cfo_leads`, `hoa_communities` tables)
- Collective Brain (Layer 1 observations)
- Discord webhook (completion alerts)

### Inputs
- Geo target ID or region string (e.g., "Tampa Bay, FL")
- Optional: limit (default 100 companies per run)
- Rotation schedule from `jakeLeadRotation.js`

### Outputs
- New rows in `cfo_leads` (company_name, city, state, phone, website) with `enrichment_status='pending'`
- New rows in `hoa_communities` for HOA pipeline
- Brain Layer 1 observations: `market_insight` + `lead_signal` per company

### Key Tasks
1. Query Google Maps for general contractors or HOA management companies in target geo
2. Deduplicate against existing DB records by company name (case-insensitive)
3. Insert new leads with source='google_maps', enrichment_status='pending'
4. Write Collective Brain observations for downstream enricher and outreach agents
5. Post Discord summary on completion

### Metrics of Success
- 20+ new companies discovered per run
- <5% duplicate insertion rate
- Brain observations written for top 20 leads per run
- $0.00 cost per run (no LLM calls)

---

## Pain Signal Monitor
**Department:** Research
**OpenClaw Agent:** `jake-pain-signal-monitor`
**Reports To:** Chief of Staff (Todd)

### Purpose
Scan industry forums, job boards, LinkedIn, and review sites for signals that a construction company is in ERP/financial pain — the exact problem Jake solves.

### Tools Used
- OpenClaw `web_search` tool
- OpenAI GPT-4o (signal scoring)
- SQLite (`cfo_leads` — update existing leads with signals)
- Discord webhook (hot signal alerts)

### Inputs
- Search queries: "construction CFO hiring", "Sage 300 migration", "QuickBooks problems", "ERP implementation"
- Target job boards: Indeed, LinkedIn Jobs
- Review sites: Google, BBB, Glassdoor

### Outputs
- Signal scores appended to existing leads
- New leads inserted when a signal identifies a company not yet in DB
- Discord alert if signal score >=80 (hot signal)

### Key Tasks
1. Search Indeed/LinkedIn for GC companies hiring CFOs or controllers (hiring signal = ERP pain)
2. Scan Google Reviews for 1-3 star complaints mentioning software, billing, or data
3. Search construction forums for product complaints
4. Score each signal 0-100 and update `pilot_fit_score` in `cfo_leads`
5. Escalate hot signals (score >=80) to Steve via Discord

### Metrics of Success
- 10+ signals scored per run
- At least 1 hot signal (>=80) surfaced per week
- Signal-to-lead conversion: signals should update existing leads, not create noise

---

## Competitive Intel Agent
**Department:** Research
**OpenClaw Agent:** `competitor-intel`
**Reports To:** Chief of Staff (Todd)

### Purpose
Monitor competitor activity, pricing, and positioning to identify gaps Jake/HOA can exploit.

### Tools Used
- OpenClaw `web_search` tool
- OpenAI GPT-4o
- SQLite (findings stored as content/notes)

### Inputs
- Competitor names and URLs (Sage, Viewpoint, Procore, Vista, Foundation)
- Target keywords: pricing pages, new feature announcements, customer complaints

### Outputs
- Structured competitor intel report stored as content piece
- Positioning gaps surfaced as potential content angles
- Price changes flagged immediately to Steve

### Key Tasks
1. Scan competitor pricing pages for changes
2. Monitor competitor review sentiment on G2, Capterra, GetApp
3. Identify common customer complaints → content opportunity
4. Identify feature gaps → product opportunity
5. Write structured intel summary with recommended action

### Metrics of Success
- Weekly intel report generated
- At least 1 actionable gap identified per month
- Price change detected within 7 days of change

---

## HOA Intel Monitor
**Department:** Research
**OpenClaw Agent:** `hoa-minutes-monitor`, `google-reviews-monitor`
**Reports To:** Chief of Staff (Todd)

### Purpose
Scan HOA meeting minutes and Google Reviews for capital need signals (reserve shortfalls, special assessments, deferred maintenance) that indicate a HOA is ready for funding outreach.

### Tools Used
- Playwright (web scraping HOA portals and Google Maps)
- OpenAI GPT-4o (signal extraction from minutes text)
- SQLite (`hoa_communities` — tier upgrades: WATCH → WARM → HOT)

### Inputs
- HOA community list from `hoa_communities` table (priority_min threshold)
- Google Places API / Google Maps data

### Outputs
- Tier upgrades in `hoa_communities` (WATCH → WARM → HOT)
- Capital signal flags (reserve shortfall, special assessment vote, deferred project)
- Scan timestamps and confidence scores

### Key Tasks
1. Fetch HOA meeting minutes URLs from community records
2. Extract capital signals: special assessment mentions, reserve fund votes, project approvals
3. Score capital urgency 1-10
4. Upgrade community tier based on signal strength
5. Scan Google Reviews for reputation signals (management complaints = instability = capital need)

### Metrics of Success
- 20+ HOAs scanned per run
- HOT tier leads generated weekly
- Tier upgrades correctly reflect real capital signals

---

## Management Research Suite
**Department:** Research
**OpenClaw Agent:** `mgmt-portfolio-scraper`, `mgmt-portfolio-mapper`, `mgmt-contact-puller`, `mgmt-review-scanner`, `mgmt-cai-scraper`
**Reports To:** Chief of Staff (Todd)

### Purpose
Map the HOA management company landscape — who manages which communities, how large their portfolios are, and how healthy their reputation is.

### Tools Used
- Playwright (scraping management company websites, CAI chapter pages)
- OpenAI GPT-4o (contact extraction, portfolio parsing)
- SQLite (management company and contact records)

### Inputs
- Company name + URL (JSON message params)
- CAI (Community Associations Institute) chapter directories

### Outputs
- Management company portfolio sizes and community counts
- Decision maker contacts (name, title, email, phone)
- Reputation scores and hot lead flags

### Key Tasks
1. Scrape CAI chapters for member management companies
2. Map each company's portfolio (communities managed, unit counts)
3. Pull decision maker contacts from websites and LinkedIn
4. Scan Google Reviews for 1-3 star patterns
5. Score company health and flag hot leads for outreach

### Metrics of Success
- New management companies discovered weekly
- Contact pull rate: >30% of scraped companies yield a contact
- Hot lead identification: companies with <3 stars and large portfolio

---

## ENGINEERING DEPARTMENT

---

## Code Builder
**Department:** Engineering
**OpenClaw Agent:** VACANT
**Reports To:** Chief of Staff (Todd)

### Purpose
Generate, test, and propose new service files, migrations, and automation scripts to expand ClawOps capabilities without Steve writing boilerplate.

### Tools Used
- OpenClaw code generation tools (planned)
- Node.js / SQLite / Express stack knowledge
- Git (read/propose diffs)

### Inputs
- Feature request in plain English from Steve or Todd
- Existing codebase context from relevant files

### Outputs
- Draft service file or script
- Migration SQL if schema change needed
- Implementation notes for Steve to review before running

### Key Tasks
1. Scaffold new special handler in runs.js format
2. Write SQLite migration for new table
3. Propose new API route with both registration lines
4. Generate seed scripts for new agent batches
5. Flag if any proposed code conflicts with existing architecture rules

### Metrics of Success
- Code output requires <30 min of Steve's review to deploy
- Zero silent 500 errors from generated code
- All output follows CLAUDE.md architecture rules (result_data not output, bridge spawn format, etc.)

---

## Tool Builder
**Department:** Engineering
**OpenClaw Agent:** VACANT
**Reports To:** Chief of Staff (Todd)

### Purpose
Design and propose new OpenClaw tools and extensions to add capabilities the current fleet lacks.

### Tools Used
- OpenClaw extension framework
- OpenAI function calling spec
- MCP tool schema format

### Inputs
- Gap identified by another agent ("I needed X but couldn't find a tool for it")
- Steve's automation wishlist

### Outputs
- Tool spec (name, description, input schema, output schema)
- Extension skeleton files
- Registration instructions

### Key Tasks
1. Identify missing tool capabilities from failed agent runs
2. Propose tool spec with input/output schema
3. Scaffold extension skeleton
4. Write test message format for the new tool

### Metrics of Success
- Tools proposed solve real bottlenecks (not theoretical)
- Implementation spec is clear enough for Steve to build in <2 hrs

---

## Automation Engineer
**Department:** Engineering
**OpenClaw Agent:** VACANT
**Reports To:** Chief of Staff (Todd)

### Purpose
Identify workflows Steve is doing manually and propose full automation — schedules, pipelines, and handoffs.

### Tools Used
- Schedule runner config (schedules table in SQLite)
- Pipeline runner (`server/services/pipelineRunner.js`)
- Agent config editor

### Inputs
- Observation that Steve performed a manual step that agents could handle
- Pipeline failure reports from Operations

### Outputs
- New schedule entry proposal (agent, cron expression, message)
- New pipeline step proposal
- Automation impact estimate (hours saved per week, cost saved)

### Key Tasks
1. Audit current schedules for gaps in pipeline coverage
2. Propose new cron schedules for agents that only run manually
3. Design multi-step pipelines for complex workflows
4. Calculate automation ROI (human time cost vs. agent cost)

### Metrics of Success
- Manual steps eliminated per month
- Schedule coverage: target 100% of repeatable tasks have a schedule

---

## MARKETING DEPARTMENT

---

## Content Writer
**Department:** Marketing
**OpenClaw Agent:** `jake-content-engine`, `cfo-content-engine`, `hoa-content-writer`
**Reports To:** Chief of Staff (Todd)

### Purpose
Generate high-quality blog posts, LinkedIn articles, and email content that positions Steve as a construction finance thought leader and drives inbound leads.

### Tools Used
- OpenAI GPT-4o
- OpenClaw `web_search` tool (topic research)
- SQLite (`cfo_content_pieces` table)
- Collective Brain Layer 4 KB (retrieves winning angles and market context)

### Inputs
- Topic brief or keyword focus
- Target persona (construction CFO, HOA board member, GC owner)
- Brain context: recent market signals, competitor gaps, trending complaints

### Outputs
- Long-form blog post (800-1,500 words) stored in `cfo_content_pieces`
- LinkedIn post version (300 words)
- Email nurture version
- Recommended CTA and UTM link

### Key Tasks
1. Research topic using web_search to find current pain points and angles
2. Write long-form content optimized for construction finance audience
3. Write social media adaptation
4. Insert content piece into `cfo_content_pieces` with status='draft'
5. Flag for CMS publisher to deploy

### Metrics of Success
- 1+ blog posts published per week
- Content references real market signals (not generic)
- Each piece includes a specific CTA tied to Jake/HOA pipeline

---

## Lead Generator
**Department:** Marketing
**OpenClaw Agent:** `jake-lead-scout`, `cfo-lead-scout`
**Reports To:** Chief of Staff (Todd)

### Purpose
Use LLM-powered research to find named construction company leads with a specific contact, score them for fit, and insert into the outreach pipeline.

### Tools Used
- OpenAI GPT-4o (market research and lead scoring)
- OpenClaw `web_search` tool
- SQLite (`cfo_leads` table)
- Jake Lead Rotation service (market cycling)

### Inputs
- Region and trade type (JSON: `{"region": "Denver, CO", "trade": "GC", "limit": 8}`)
- Market rotation index (auto-managed by `jakeLeadRotation.js`)

### Outputs
- Named leads inserted into `cfo_leads` with:
  - company_name, contact_name, contact_title, estimated_revenue, erp_type
  - pilot_fit_score, pilot_fit_reason, pain_signals
  - enrichment_status: 'pending' (no email) or 'enriched' (has email)

### Key Tasks
1. Research target market for GC companies matching ICP (revenue, ERP type, pain signals)
2. Find specific decision maker (CFO, Controller, VP Finance)
3. Score lead 0-100 on fit criteria
4. Insert into DB — save with OR without email (enricher finds emails later)
5. Rotate to next market on completion

### Metrics of Success
- 6-10 new named leads per run
- Average fit score >50
- <10% duplicate insertion rate
- Leads span multiple markets (rotation working)

---

## Contact Enricher
**Department:** Marketing
**OpenClaw Agent:** `jake-contact-enricher`, `hoa-contact-enricher`
**Reports To:** Chief of Staff (Todd)

### Purpose
Find verified email addresses and phone numbers for leads that have a company name and contact name but no contact details — enabling outreach.

### Tools Used
- Playwright (direct domain HTTP verification, website scraping)
- Bing search (contact lookup)
- LinkedIn search (profile verification)
- SQLite (`cfo_leads` — update `contact_email`, `phone`, `enrichment_status`)
- Collective Brain (Layer 1 observations on contact_found)

### Inputs
- Leads from `cfo_leads` where `enrichment_status IN ('pending', 'partial')`
- Optional: status_filter, limit, min_score

### Outputs
- Updated `contact_email` and/or `phone` in `cfo_leads`
- `enrichment_status` updated: 'enriched' (email found) / 'partial' (LinkedIn only) / 'failed'
- Brain Layer 1 observation written for each enriched contact

### Key Tasks
1. Step 0: Direct domain guess + HTTP verification (no search, fast)
2. Step 1: Scrape verified website for contact email
3. Step 2: Bing search for company contact email
4. Step 3: Scrape search result website
5. Step 4: LinkedIn profile search
6. Step 5: Email pattern guess (only if real name found)

### Metrics of Success
- Target 24%+ email hit rate on Maps-sourced leads
- <$0.01 per enrichment attempt (no LLM calls in waterfall)
- Partial enrichment (LinkedIn) flagged correctly for manual follow-up

---

## Social Media Manager
**Department:** Marketing
**OpenClaw Agent:** `jake-social-scheduler`, `hoa-social-media`, `hoa-facebook-poster`, `jake-twitter-poster`, `linkedin-direct-poster`
**Reports To:** Chief of Staff (Todd)

### Purpose
Distribute content across Facebook, LinkedIn, and Twitter to build audience and drive inbound traffic to Jake and HOA landing pages.

### Tools Used
- Facebook Graph API (via OpenClaw extension)
- LinkedIn API (via `linkedin-direct-poster`)
- Twitter/X API (via `openclaw-twitter` extension)
- SQLite (`cfo_content_pieces` — reads approved content)

### Inputs
- Approved content piece from `cfo_content_pieces` (status='approved')
- Scheduled run time from cron schedule

### Outputs
- Post published to target platform
- Post status updated in `cfo_content_pieces` (status='posted')
- Engagement tracking queued

### Key Tasks
1. Fetch approved content piece from DB
2. Format for target platform (character limits, hashtags, link placement)
3. Post via platform API
4. Record post URL and timestamp
5. Queue for engagement monitoring

### Metrics of Success
- Daily Facebook post maintained
- LinkedIn 3x/week cadence
- Zero failed posts due to content format errors
- Engagement rate tracked and fed back to Content Writer

---

## Outreach Agent
**Department:** Marketing
**OpenClaw Agent:** `jake-outreach-agent`, `cfo-outreach-agent`, `hoa-outreach-drafter`
**Reports To:** Chief of Staff (Todd)

### Purpose
Draft personalized, high-converting cold outreach emails for enriched leads — never generic, always referencing a specific pain signal or company detail.

### Tools Used
- OpenAI GPT-4o
- SQLite (`cfo_outreach_sequences` — inserts draft at sequence_position=1)
- Collective Brain Layer 4 KB (retrieves winning angle and tone patterns)
- Lead dossier (Upgrade B — rich context per lead)

### Inputs
- Lead record: company_name, contact_name, contact_title, erp_type, pain_signals, city, state
- Brain KB context: what angles worked in this market/ERP segment
- Dossier: situation snapshot, pain narrative, best CTA

### Outputs
- Email draft inserted into `cfo_outreach_sequences`:
  - email_subject, email_body, sequence_position=1, status='draft'

### Key Tasks
1. Pull lead record and dossier from DB
2. Retrieve Brain KB context for market and ERP type
3. Write subject line that references a specific pain (not generic)
4. Write 150-200 word email body: pain → credibility → offer → CTA
5. Insert draft — DO NOT SEND without Steve approval

### Metrics of Success
- 100% of enriched leads have a draft within 24h of enrichment
- Reply rate target: >5% (tracked via `jake-reply-classifier`)
- Zero sends without Steve confirmation

---

## Follow-Up Agent
**Department:** Marketing
**OpenClaw Agent:** `jake-follow-up-agent`
**Reports To:** Chief of Staff (Todd)

### Purpose
Draft day-5 follow-up emails for sent outreach with no reply — maintaining pipeline momentum without Steve lifting a finger.

### Tools Used
- OpenAI GPT-4o
- SQLite (`cfo_leads`, `cfo_outreach_sequences`)
- Collective Brain (Layer 3 episode recording)

### Inputs
- Leads where: status='contacted', sequence_position=1 sent 5+ days ago, no sequence_position=2 exists

### Outputs
- Follow-up draft at sequence_position=2, status='draft'
- Brain Layer 1 observation: follow_up_queued

### Key Tasks
1. Query DB for leads eligible for follow-up (5+ days, no existing follow-up)
2. Reference original subject line and days since send
3. Write shorter (100-150 word) follow-up — different angle from first email
4. Insert as sequence_position=2, status='draft'
5. Record Brain observation

### Metrics of Success
- 100% of eligible leads get a follow-up draft within 24h of eligibility
- Follow-up reply rate tracked separately from initial outreach

---

## Reply Classifier
**Department:** Marketing
**OpenClaw Agent:** `jake-reply-classifier`
**Reports To:** Chief of Staff (Todd)

### Purpose
Instantly classify inbound replies (INTERESTED / NOT_NOW / WRONG_PERSON / UNSUBSCRIBE / BOUNCED) and update lead status — closing the feedback loop with zero human input.

### Tools Used
- SQLite (reads `cfo_leads`, writes status + `cfo_outreach_sequences`)
- Collective Brain Layer 2 (feedback signal) + Layer 3 (episode recording)
- Tenacity Cadence Engine (deactivation on terminal outcomes)
- $0/run — pure logic, no LLM

### Inputs
- JSON: `{"lead_id": 123, "reply_text": "...full reply text..."}`

### Outputs
- `cfo_leads.status` updated (replied / nurture / bad_contact / unsubscribed / bounced)
- `cfo_outreach_sequences.status` updated (replied / bounced)
- Brain Layer 2 feedback signal recorded
- Brain Layer 3 episode recorded with outcome score
- Cadence deactivated for INTERESTED / UNSUBSCRIBE / BOUNCED

### Key Tasks
1. Classify reply using regex pattern matching
2. Update lead status
3. Update sequence status and timestamp
4. Record Brain feedback signal
5. Record Brain episode with outcome score (INTERESTED=0.9, NOT_NOW=0.3, BOUNCED=0.0)
6. Deactivate cadence for terminal outcomes
7. Escalate INTERESTED classification to Steve immediately

### Metrics of Success
- Classification accuracy >95% (validate manually on first 20 replies)
- Brain episode recorded for every classification
- INTERESTED reply reaches Steve within 5 minutes

---

## Meeting Booker
**Department:** Marketing
**OpenClaw Agent:** `jake-meeting-booker`
**Reports To:** Chief of Staff (Todd)

### Purpose
Draft the meeting confirmation email for leads that replied INTERESTED — converting interest into a booked call.

### Tools Used
- OpenAI GPT-4o
- SQLite (`cfo_outreach_sequences` — inserts at sequence_position=3)
- Collective Brain (Layer 3 episode: outcome_score=1.0)
- Calendly URL injection (from `CALENDLY_URL` env var)

### Inputs
- lead_id (required — must have status='replied')
- Optional: reply_text (the actual reply for context)

### Outputs
- Meeting email draft at sequence_position=3, status='draft'
- Calendly link embedded
- Brain Layer 3 episode recorded (booked, score=1.0)

### Key Tasks
1. Fetch lead record and verify status='replied'
2. Write warm, confident reply acknowledging their interest
3. Propose specific meeting format (30 min, Calendly link)
4. Inject actual Calendly URL
5. Insert as sequence_position=3, status='draft' — Steve approves and sends

### Metrics of Success
- Draft generated within 1 minute of being triggered
- Calendly URL present in every draft
- Steve approval time: target <4 hours from INTERESTED classification

---

## Content Repurposer
**Department:** Marketing
**OpenClaw Agent:** `content-repurposer`
**Reports To:** Chief of Staff (Todd)

### Purpose
Turn one long-form blog post into 5 derivative content pieces (LinkedIn post, Twitter thread, email, short-form video script, quote card) — multiplying reach without additional research cost.

### Tools Used
- OpenAI GPT-4o
- SQLite (`cfo_content_pieces` — reads source, inserts derivatives)

### Inputs
- Approved or published content piece ID from `cfo_content_pieces`

### Outputs
- 5 derivative pieces inserted as separate rows with parent_id reference
- Each piece formatted for its target platform

### Key Tasks
1. Fetch source content piece
2. Write LinkedIn version (300 words, professional tone)
3. Write Twitter/X thread (5-7 tweets, punchy)
4. Write email nurture version (200 words, personal tone)
5. Write short-form video script (60 second talking points)

### Metrics of Success
- 1 source blog → 5 derivative pieces, all ready to schedule
- Zero generic rephrasing — each derivative takes a distinct angle

---

## FINANCE DEPARTMENT

---

## Opportunity Evaluator
**Department:** Finance
**OpenClaw Agent:** `urgency-scorer`, `mgmt-review-scanner`
**Reports To:** Chief of Staff (Todd)

### Purpose
Score every lead in the pipeline on urgency (0-100) across Fit, Pain, Timeliness, and Enrichment dimensions — ensuring the highest-value leads get outreach first.

### Tools Used
- SQLite (`cfo_leads`, `lg_engagement_queue` — bulk reads and writes)
- $0/run — pure SQLite scoring logic, no LLM

### Inputs
- All active leads from `cfo_leads` and `lg_engagement_queue`
- Optional: product filter ('jake' / 'hoa' / 'both'), limit

### Outputs
- `urgency_score` column updated on each lead
- Top leads surfaced in daily digest
- Discord alert if top lead score >=90 (buy signal)

### Key Tasks
1. Score each lead: Fit (ERP match, revenue range) + Pain (signals found) + Timeliness (days in pipeline) + Enrichment (email + phone found)
2. Update `urgency_score` and `urgency_updated_at`
3. Surface top 10 leads to morning digest
4. Flag any lead >=90 for immediate outreach

### Metrics of Success
- All active leads scored within 24h of entering pipeline
- Score distribution validates ICP assumptions (top leads are GC + Sage 300 + hiring signal)
- Steve can sort by urgency and know exactly who to prioritize

---

## Lead Dossier Generator
**Department:** Finance
**OpenClaw Agent:** `lead-dossier-generator`
**Reports To:** Chief of Staff (Todd)

### Purpose
Assemble a personalized Markdown dossier for each lead — situation snapshot, pain narrative, Brain episodes, KB angles, and recommended CTA — so the Outreach Agent writes with full context.

### Tools Used
- SQLite (reads lead, sequences, Brain observations, KB entries)
- Collective Brain Layer 3 (episodes) + Layer 4 (KB)
- $0/run — string assembly, no LLM

### Inputs
- Single: `{"lead_id": 123, "product": "jake"}`
- Batch: `{"batch": true, "product": "both", "limit": 50}`

### Outputs
- Dossier stored in `cfo_leads.dossier` or equivalent field
- Dossier includes: company background, pain signals, best outreach angle, KB context

### Key Tasks
1. Fetch lead record, all Brain observations, all episodes for similar market/ERP
2. Retrieve KB entries matching market and ERP type
3. Assemble Markdown dossier: situation → pain → best angle → CTA
4. Store dossier for Outreach Agent to read

### Metrics of Success
- Dossier generated for every lead before outreach is drafted
- KB retrieval rate: >50% of dossiers include at least 1 KB entry

---

## Pricing Analyzer
**Department:** Finance
**OpenClaw Agent:** VACANT
**Reports To:** Chief of Staff (Todd)

### Purpose
Benchmark competitor pricing for ERP consulting, data cleanup, and HOA funding services — ensuring Jake's offer is positioned correctly.

### Tools Used
- OpenClaw `web_search` tool
- OpenAI GPT-4o
- SQLite (findings stored as notes)

### Inputs
- Competitor list (Sage VARs, ERP consultants, HOA lenders)
- Steve's current pricing model

### Outputs
- Benchmark price ranges by service type
- Positioning recommendation (undercut / match / premium)
- Gap analysis: what competitors don't offer that Jake does

### Key Tasks
1. Scrape competitor pricing pages (or infer from case studies/job postings)
2. Benchmark against Jake's pricing
3. Identify underserved price points
4. Recommend pricing adjustments with rationale

### Metrics of Success
- Quarterly pricing benchmark delivered
- At least 1 actionable pricing insight per report

---

## ROI Calculator
**Department:** Finance
**OpenClaw Agent:** VACANT
**Reports To:** Chief of Staff (Todd)

### Purpose
Quantify the ROI of Jake's service for each specific lead — turning "we fix your data" into "you'll save $X in Y months" — making outreach more compelling.

### Tools Used
- SQLite (reads lead: revenue_range, erp_type, employee_count)
- Calculation models (revenue-based AR savings estimates)
- Content injection into Outreach Agent prompts

### Inputs
- Lead profile: revenue, ERP type, headcount, identified pain signals

### Outputs
- Personalized ROI estimate (annual savings, efficiency gains, cost of delay)
- CTA line for outreach email: "Companies your size typically recover $X in AR within 90 days"

### Key Tasks
1. Pull lead profile from DB
2. Apply revenue-based model: AR aging savings, manual hour reduction, error cost elimination
3. Generate 3-line ROI summary
4. Feed into Outreach Agent as context

### Metrics of Success
- Every outreach email includes a specific ROI reference
- ROI claims are conservative and defensible (not inflated)

---

## OPERATIONS DEPARTMENT

---

## Daily Debrief
**Department:** Operations
**OpenClaw Agent:** `daily-debrief`
**Reports To:** Chief of Staff (Todd) — Steve receives directly at 6PM

### Purpose
Compile and narrate the day's operational performance — leads found, emails sent, replies received, costs burned, and what needs attention tomorrow.

### Tools Used
- SQLite (reads: runs, cfo_leads, cfo_outreach_sequences, cfo_content_pieces)
- `server/services/debriefCollector.js` (data aggregation)
- OpenAI GPT-4o (narrative generation)
- Discord webhook (delivery)

### Inputs
- All DB activity from the current day
- Optional: `{"date": "2026-03-13"}` override

### Outputs
- Structured debrief report posted to Discord at 6PM M-F
- Format: Pipeline activity | Outreach stats | Content created | Brain health | Cost burn | Tomorrow's priorities

### Key Tasks
1. Collect all day's metrics via debriefCollector
2. Pass to GPT-4o for narrative assessment (not just numbers — judgment on what matters)
3. Post structured embed to Discord
4. Surface top 3 next-day priorities

### Metrics of Success
- Debrief posted by 6:05PM M-F without manual trigger
- Report contains specific numbers, not vague summaries
- "Tomorrow's top 3" items are actionable, not generic

---

## Morning Digest
**Department:** Operations
**OpenClaw Agent:** `morning-digest`
**Reports To:** Chief of Staff (Todd) — Steve receives directly at 7AM

### Purpose
Post yesterday's pipeline summary to Discord at 7AM so Steve starts each day with a clear picture of where the business stands.

### Tools Used
- SQLite (reads: cfo_leads, cfo_outreach_sequences, cfo_content_pieces, runs)
- Collective Brain stats API
- Discord webhook (rich embed delivery)
- $0/run — no LLM

### Inputs
- Yesterday's date (auto-calculated)
- DB aggregations: leads found, enriched, drafted, sent, replied

### Outputs
- Discord embed with: Pipeline stats | Outreach stats | Content stats | Brain stats | Cost burn

### Key Tasks
1. Query yesterday's activity from all relevant tables
2. Build Discord embed with clearly labeled fields
3. Calculate reply rate (replied / sent)
4. Include Brain observation count and feedback scores
5. Post to Discord webhook before 7:05AM

### Metrics of Success
- Posted daily by 7:05AM without fail
- Includes actual numbers for all 5 stat categories
- Reply rate tracked and trending over time

---

## Pipeline Director
**Department:** Operations
**OpenClaw Agent:** `pipeline-director`
**Reports To:** Chief of Staff (Todd)

### Purpose
Dispatch the next action for every ready lead — decide who gets enriched, who gets a dossier, who gets outreach — so the pipeline never stalls waiting for a human decision.

### Tools Used
- Pipeline State Tracker (reads stage and stall flags)
- Urgency Scorer (reads urgency scores)
- SQLite (reads all active leads, queues runs)
- Discord (posts daily plan summary)
- $0/run — no LLM

### Inputs
- All active leads from `cfo_leads` and `lg_engagement_queue`
- Daily budget cap from settings
- 70/30 Jake/HOA split configuration

### Outputs
- Queued runs for: enrichment, dossier generation, outreach drafting, follow-up
- Discord summary of plan (X enrichments, Y outreach drafts, Z follow-ups)
- Max 20 actions dispatched per cycle (budget cap respected)

### Key Tasks
1. Run pipeline state computation
2. Score and rank leads by urgency
3. Dispatch enrichment for pending leads
4. Dispatch dossier generation for enriched-no-dossier leads
5. Dispatch outreach drafts for dossier-ready leads
6. Dispatch follow-up for eligible leads (5+ days, no reply)
7. Post Discord summary

### Metrics of Success
- Zero leads stalled >48h due to missing next action
- Daily budget cap never exceeded
- Discord plan posted daily at 1AM

---

## Pipeline State Tracker
**Department:** Operations
**OpenClaw Agent:** `pipeline-state-tracker`
**Reports To:** Chief of Staff (Todd)

### Purpose
Recompute the pipeline stage for every active lead and flag any that have been stuck in the same stage for too long — surfacing stalls before they become dead deals.

### Tools Used
- SQLite (`cfo_leads`, `lg_engagement_queue` — bulk read/write with transaction)
- Discord webhook (stall alert)
- $0/run — no LLM

### Inputs
- All active leads
- Optional: product filter ('jake' / 'hoa' / 'both')

### Outputs
- `pipeline_stage` column updated on each lead
- Stall flags set on leads stuck >48h
- Discord alert if any stalled leads detected

### Key Tasks
1. Compute stage for each lead based on DB state (no-contact → enriched → dossier → outreach → replied → meeting)
2. Detect stage transitions and log changes
3. Flag leads where stage has not changed in >48h
4. Post Discord alert if stalled leads found
5. Feed stall data to Pipeline Director for prioritization

### Metrics of Success
- Stage accuracy: stage field matches actual DB state 100%
- Stall detection within 24h of stall occurring
- Stage transition rate: leads should be moving forward every 2-3 days

---

## Tenacity Cadence Engine
**Department:** Operations
**OpenClaw Agent:** `tenacity-cadence`
**Reports To:** Chief of Staff (Todd)

### Purpose
Run the full multi-touch outreach cadence — find every lead with a pending touch due today and queue the appropriate run (outreach, follow-up, or LinkedIn) based on where they are in the 12-touch sequence.

### Tools Used
- SQLite (`cfo_leads` — reads `cadence_active`, `next_touch_due`, `last_touch_number`)
- `cadence_touches` table (touch history)
- Collective Brain (timing and tone adjustments based on past performance)
- $0/run — no LLM

### Inputs
- All leads with `cadence_active=1` and `next_touch_due <= now`
- Optional: product filter, single lead_id for inspection

### Outputs
- Pending runs queued for each eligible lead
- Touch history recorded in `cadence_touches`
- `next_touch_due` and `last_touch_number` updated on lead

### Key Tasks
1. Find all leads due for a touch
2. Compute next touch: channel (email/linkedin/sms), tone, wait days — using Brain timing adjustments
3. Queue appropriate agent run (outreach / follow-up / linkedin-direct-poster)
4. Record touch in `cadence_touches`
5. Update lead cadence fields

### Metrics of Success
- 0 missed touches (every due lead gets queued within 60 min of schedule run)
- Brain timing adjustments applied correctly (shorter wait in hot markets)
- Cadence deactivated automatically on INTERESTED / UNSUBSCRIBE / BOUNCED

---

## Brain Distillation
**Department:** Operations
**OpenClaw Agent:** `brain-distillation`
**Reports To:** Chief of Staff (Todd)

### Purpose
Promote high-scoring episodes from Brain Layer 3 into Layer 4 knowledge base entries — building a persistent, searchable memory of what works in each market and ERP segment.

### Tools Used
- Collective Brain service (`server/services/collectiveBrain.js`)
- SQLite (Brain tables: observations, feedback, episodes, kb_entries)
- Azure fallback sync (drainFallback on reconnect)
- $0/run — no LLM

### Inputs
- Brain episodes with score >=0.8 and outcome_type in ('replied', 'booked', 'converted')
- Runs nightly at 2AM

### Outputs
- New KB entries in `brain_kb` with market, ERP, tone, wait_days tags
- Distillation stats: inserted count, skipped (already in KB) count

### Key Tasks
1. Query episodes meeting promotion threshold
2. Deduplicate against existing KB entries
3. Insert new KB entries with full context tags
4. Sync SQLite fallback buffer to Azure (if applicable)
5. Log distillation stats to morning digest

### Metrics of Success
- KB grows by 5+ entries per week during active outreach period
- KB entries actively retrieved by Outreach Agent (usage_count > 0)
- Zero duplicate KB entries

---

## CRM Sync
**Department:** Operations
**OpenClaw Agent:** `jake-crm-sync`
**Reports To:** Chief of Staff (Todd)

### Purpose
Push replied, meeting-booked, and pilot leads to Google Sheets (or CSV fallback) so Steve has a human-readable CRM view outside the console.

### Tools Used
- Google Sheets API (via googleapis npm package)
- CSV file export (fallback to `data/crm-sync-{date}.csv`)
- SQLite (reads `cfo_leads` + `cfo_outreach_sequences`)
- $0/run — no LLM

### Inputs
- Leads updated in last 24h with status IN ('replied', 'meeting_booked', 'pilot')

### Outputs
- Rows appended to Google Sheets "Jake Pipeline" tab (if GOOGLE_SHEETS_ID configured)
- CSV file in `data/` directory (CSV fallback)

### Key Tasks
1. Query leads updated in last 24h with actionable statuses
2. Attempt Google Sheets append (if GOOGLE_SHEETS_ID set)
3. Fall back to CSV export on Sheets failure
4. Include: company, contact, email, score, status, location, notes

### Metrics of Success
- CRM updated within 24h of any status change on replied/booked/pilot leads
- Steve can open Google Sheets and see current pipeline state without logging into console

---

*Cross-reference `agent_org_chart.md` for hierarchy and `agent_responsibilities.md` for RACI boundaries.*
