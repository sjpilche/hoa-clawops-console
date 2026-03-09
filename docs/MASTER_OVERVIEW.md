# ClawOps Console
## Master Overview Document

> **What is ClawOps?** An enterprise AI agent operations platform that automates construction company marketing and HOA lead generation. 50+ agents — some powered by OpenAI GPT-4o, others pure deterministic logic — run on a shared schedule, share a collective intelligence layer, and funnel everything into a unified marketing pipeline.

---

## Table of Contents
1. [Business Context](#1-business-context)
2. [What It Does](#2-what-it-does)
3. [System Architecture](#3-system-architecture)
4. [The Two Marketing Engines](#4-the-two-marketing-engines)
5. [Agent Fleet (50 agents)](#5-agent-fleet)
6. [The Collective Brain](#6-the-collective-brain)
7. [Pipelines & Orchestration](#7-pipelines--orchestration)
8. [Tech Stack](#8-tech-stack)
9. [How to Run](#9-how-to-run)
10. [Current State](#10-current-state)
11. [External Integrations](#11-external-integrations)
12. [Key Files Reference](#12-key-files-reference)

---

## 1. Business Context

**Platform**: ClawOps Console — AI agent ops for construction marketing
**Products marketed**:
1. **Jake** — Construction finance software (CFO/Controller audience, SMB contractors, $5M–$50M revenue)
2. **HOA Project Funding** — HOA reserve loan brokering (hoaprojectfunding.com)

**Problem it solves**: Construction company marketing at scale is expensive, slow, and generic. ClawOps automates the entire funnel — discovery → enrichment → outreach → follow-up → close — using agents that run on a schedule with zero human touch required for the routine work.

**Operating cost**: ~$20–25/month (mostly OpenAI API). Discovery, enrichment, and most pipeline agents are $0/run (Playwright, deterministic logic).

---

## 2. What It Does

ClawOps runs two parallel marketing machines that share infrastructure but have distinct audiences and content strategies.

### End-to-End Funnel (both engines)

```
DISCOVERY          → Find target companies in a market
ENRICHMENT         → Find decision-maker name, email, phone
OUTREACH DRAFTING  → Write personalized cold email
APPROVAL / SEND    → Human reviews, agent sends via SendGrid
FOLLOW-UP          → Auto-detect no-reply → draft follow-up
CLASSIFY REPLY     → Auto-classify inbound: INTERESTED / NOT_NOW / BOUNCED
MEETING BOOKING    → Draft meeting confirmation
CRM SYNC           → Export replied/interested leads to Google Sheets
```

### Content Pipeline (both engines)

```
CONTENT ENGINE     → Writes blog post or LinkedIn article
CMS PUBLISHER      → Pushes to GitHub → Netlify auto-deploys live
SOCIAL SCHEDULER   → Converts to platform-specific posts
FACEBOOK POSTER    → Posts to company Facebook page
CONTENT REPURPOSER → 1 piece → 5 derivatives (tweet, email, LinkedIn, FB, YouTube)
```

### Intelligence & Signals (Jake engine)

```
PERMIT SCANNER     → County permits for $250K+ commercial builds
HIRING SIGNALS     → Indeed/LinkedIn CFO/Controller job postings
BID RESULT SCRAPER → FL/TX awarded contracts $500K+
COMPETITOR INTEL   → Procore/Sage forum complaints
PAIN SIGNAL MONITOR → Liens, judgments, BBB complaints
```

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React 19 + Vite)                   │
│               http://localhost:5174                              │
│                                                                  │
│  Dashboard · Agents · Leads · Content · Schedules · Blitz      │
│  Pipelines · Cost Tracker · Chat · Audit Log · Settings         │
│  ──────────────────────────────────────────────────────────     │
│  Real-time logs via Socket.io · TanStack Query caching          │
└────────────────────────┬────────────────────────────────────────┘
                         │ /api/* + Socket.io
┌────────────────────────▼────────────────────────────────────────┐
│              EXPRESS BACKEND  (Node.js 24, port 3001)           │
│                                                                  │
│  /api/agents      · /api/runs        · /api/schedules           │
│  /api/leads       · /api/content     · /api/discovery           │
│  /api/blitz       · /api/pipelines   · /api/brain               │
│  /api/discord     · /api/chat                                   │
│                                                                  │
│  scheduleRunner.js  → fires every 60s, no confirmation gate     │
│  pipelineRunner.js  → multi-agent workflow chains               │
│  postProcessor.js   → routes LLM output to marketing tables     │
│  collectiveBrain.js → 4-layer cross-agent learning              │
└────────────┬────────────────────────┬───────────────────────────┘
             │ child_process.spawn()  │ SQL reads/writes
             ▼                        ▼
┌────────────────────────┐   ┌─────────────────────────┐
│   OPENCLAW CLI         │   │   SQLITE DATABASE       │
│   openclaw agent       │   │   ./data/clawops.db     │
│   --local --json       │   │   35+ tables            │
│   --agent {name}       │   │   Agents, runs, leads,  │
│   --message "{params}" │   │   content, schedules,   │
│                        │   │   brain layers, audit   │
│  Path 1: LLM agents    │   └─────────────────────────┘
│  → OpenAI GPT-4o       │
│  → $0.025/run avg      │
│                        │
│  Path 2: SPECIAL_HANDLERS (server/routes/runs.js)
│  → Deterministic code  │
│  → $0/run              │
└────────────────────────┘
```

### Two Agent Execution Paths

**LLM Agents** — routed through OpenClaw CLI → OpenAI GPT-4o
- Each agent has a `SOUL.md` personality file in `openclaw-skills/{name}/`
- Multi-turn sessions (`scheduled-{agent}-{date}` session IDs)
- Brain context prepended to every scheduled run
- ~$0.01–$0.03 per run

**Special Handlers** — deterministic code registered in `server/routes/runs.js`
- Pure Node.js / Playwright — no LLM, $0/run
- 30+ handlers covering all pipeline agents
- Registered as `SPECIAL_HANDLERS[key]` — called directly by name
- Used for: Google Maps scraping, email enrichment, DB operations, CRM sync

---

## 4. The Two Marketing Engines

### Jake Engine — Construction Finance Software

**Target**: SMB contractors ($5M–$50M revenue) with outdated ERP/accounting systems
**Pain point**: "Stop the data bullshit" — QB/BC/Excel chaos, messy AR, no real-time visibility
**Voice**: Jake (peer CFO who solved it himself)
**Content tone**: Authentic, numbers-driven, "we were you"

**Pipeline**:
1. **Discovery** → Google Maps GC scraper (50–150 companies/market, 60 US markets)
2. **Enrichment** → 5-step email finder (domain guess → scrape → Bing → LinkedIn)
3. **Lead Scout** → LLM agent, searches LinkedIn/web, ~8 leads/run with scoring
4. **Outreach** → Personalized cold emails via jake-outreach-agent
5. **Follow-up** → jake-follow-up-agent (5+ days no reply, auto-drafted)
6. **Reply Classifier** → INTERESTED/NOT_NOW/WRONG_PERSON/BOUNCED ($0, instant)
7. **Meeting Booker** → Draft meeting confirmation email
8. **CRM Sync** → Export to Google Sheets or CSV

**Content**:
- jake-content-engine (Mon 9 AM) — LinkedIn articles, blogs
- jake-social-scheduler — platform-specific posts
- content-repurposer — 1 piece → 5 derivatives
- jake-case-study-builder — pilot results → proof

### HOA Engine — Project Funding

**Target**: HOA property managers, board members, GCs who work on HOA projects
**Pain point**: Reserve study says $400K roof needed. Bank says 6 months. Special assessment = angry neighbors.
**Voice**: Steve Pilcher (trusted lender, solution-oriented)
**Site**: hoaprojectfunding.com (GitHub → Netlify)

**Pipeline**:
1. **Discovery** → Google Maps + NSG livempaint contact import, 19 geo-targets
2. **Contact Finding** → Board members, PMs, GC contacts
3. **Enrichment** → Email + phone enrichment
4. **Outreach Drafting** → Personalized emails per segment
5. **Minutes Monitor** → Board meeting minutes scanner for project signals
6. **Reviews Monitor** → Management company review tracking for tier upgrades
7. **Special Assessment Monitor** → FL condo division filings

**Content**:
- hoa-content-writer (Mon 8 AM) — 1,400–1,800 word blog posts
- hoa-cms-publisher (Mon 8:30 AM) → GitHub → Netlify deploy
- hoa-facebook-poster (Daily 10 AM) — Facebook page posting
- hoa-social-media — LinkedIn + other channels

---

## 5. Agent Fleet

50 agents across 6 groups. Each agent has a `SOUL.md` personality file and lives in `openclaw-skills/{name}/`.

### Core (2)
| Agent | Schedule | Type | Purpose |
|-------|----------|------|---------|
| main | On-demand | LLM | Natural language chat router — routes messages to right agent |
| daily-debrief | Daily 6 PM M-F | LLM | War room report — all activity, costs, pipeline status |

### HOA Marketing (8)
| Agent | Schedule | Type | Purpose |
|-------|----------|------|---------|
| hoa-content-writer | Mon 8 AM | LLM | Blog posts, 1,400–1,800 words, SEO-optimized |
| hoa-cms-publisher | Mon 8:30 AM | Special | GitHub push → Netlify auto-deploy |
| hoa-social-media | On-demand | LLM | Blog → Facebook/LinkedIn posts |
| hoa-social-engagement | On-demand | LLM | Responds to FB group comments |
| hoa-networker | On-demand | LLM | LinkedIn/community networking |
| hoa-email-campaigns | On-demand | LLM | Email sequences (abandonment, post-consult, newsletter) |
| hoa-website-publisher | On-demand | LLM | Updates hoaprojectfunding.com |
| hoa-facebook-poster | Daily 10 AM | Special ($0) | Posts to HOA Project Funding FB page |

### HOA Pipeline (5)
| Agent | Schedule | Type | Purpose |
|-------|----------|------|---------|
| hoa-discovery | On-demand | Special ($0) | Google Maps, 19 geo-targets (FL/TX/AZ/NV/GA/CA), 200–600 HOAs/run |
| hoa-contact-finder | On-demand | Special | Finds board member contacts |
| hoa-contact-enricher | On-demand | Special ($0) | Email + phone enrichment |
| hoa-outreach-drafter | On-demand | Special | Personalized outreach emails |
| hoa-special-assessment-monitor | On-demand | LLM | FL Division of Condominiums filings |

### HOA Intel (2)
| Agent | Schedule | Type | Purpose |
|-------|----------|------|---------|
| hoa-minutes-monitor | On-demand | Special ($0) | Board meeting minute scanning |
| google-reviews-monitor | On-demand | Special ($0) | Management company review tracking + tier upgrades |

### Management Company Research (5)
| Agent | Schedule | Type | Purpose |
|-------|----------|------|---------|
| mgmt-portfolio-scraper | On-demand | Special ($0) | Company portfolio scraping |
| mgmt-contact-puller | On-demand | Special ($0) | Decision maker extraction |
| mgmt-portfolio-mapper | On-demand | Special ($0) | HOA ↔ management company mapping |
| mgmt-review-scanner | On-demand | Special ($0) | Review site sentiment |
| mgmt-cai-scraper | On-demand | Special ($0) | Community Associations Institute directories |

### Jake Marketing — Core Brand (7)
| Agent | Schedule | Type | Purpose |
|-------|----------|------|---------|
| jake-content-engine | Mon 9 AM | LLM | Jake-voice blog posts and LinkedIn articles |
| jake-outreach-agent | On-demand | LLM | Personalized cold emails to construction SMBs |
| jake-lead-scout | Mon 7 AM | Special+LLM | National lead scout, 60-market rotation, stores leads |
| jake-social-scheduler | On-demand | LLM | Schedules Jake content to social platforms |
| jake-analytics-monitor | Daily 10 AM | LLM | Pipeline health dashboard |
| jake-offer-proof-builder | On-demand | LLM | Case studies, ROI calculators, pilot materials |
| jake-pilot-deliverer | On-demand | LLM | Pilot kickoff to results coordination |

### Jake Marketing — CFO Brand (7)
Same capabilities, Steve Pilcher voice, writes to same DB tables (`source_agent='cfo'`)
- cfo-content-engine, cfo-outreach-agent, cfo-lead-scout (FL DBPR scraper)
- cfo-social-scheduler, cfo-analytics-monitor, cfo-offer-proof-builder, cfo-pilot-deliverer

### Jake Pipeline — Discovery & Enrichment (2)
| Agent | Schedule | Type | Purpose |
|-------|----------|------|---------|
| jake-construction-discovery | Mon 6 AM | Special ($0) | Google Maps GC scraper, 50–150 companies/market |
| jake-contact-enricher | Mon 8 AM | Special ($0) | 5-step email waterfall: domain guess → scrape → Bing → scrape → LinkedIn |

### Jake Pipeline — Follow-up Loop (3)
| Agent | Schedule | Type | Purpose |
|-------|----------|------|---------|
| jake-follow-up-agent | Wed/Fri 9 AM | LLM | Drafts follow-up for 5+ day no-reply leads |
| jake-reply-classifier | On-demand | Special ($0) | Classifies inbound replies: INTERESTED/NOT_NOW/WRONG_PERSON/UNSUBSCRIBE/BOUNCED |
| jake-meeting-booker | On-demand | LLM | Drafts meeting confirmation email for interested leads |

### Jake Pipeline — Signal Sources (3)
| Agent | Schedule | Type | Purpose |
|-------|----------|------|---------|
| jake-permit-scanner | On-demand | Special ($0) | County permit portals, $250K+ commercial permits |
| jake-hiring-signal-agent | On-demand | LLM | Indeed/LinkedIn CFO/Controller job postings |
| bid-result-scraper | On-demand | Special ($0) | FL/TX procurement, awarded contracts $500K+ |

### Jake Pipeline — Close Loops (3)
| Agent | Schedule | Type | Purpose |
|-------|----------|------|---------|
| jake-crm-sync | Daily | Special ($0) | Replied/meeting_booked leads → Google Sheets or CSV |
| content-repurposer | On-demand | LLM | 1 blog post → 5 derivatives (tweet, LinkedIn, email, FB, YouTube) |
| jake-case-study-builder | On-demand | LLM | Pilot results → sanitized case studies |

### Jake Intel (3)
| Agent | Schedule | Type | Purpose |
|-------|----------|------|---------|
| competitor-intel | On-demand | LLM | Procore/Sage/Vista forum complaints |
| jake-pain-signal-monitor | On-demand | LLM | Liens, judgments, BBB complaints |
| linkedin-direct-poster | On-demand | Special | LinkedIn long-form + short takes |

### Jake Social (2)
| Agent | Schedule | Type | Purpose |
|-------|----------|------|---------|
| jake-twitter-poster | On-demand | Special | Tweet threads via openclaw-twitter extension |
| sms-follow-up | On-demand | Special | SMS via Twilio ($0.0075/SMS) |

### Operations (1)
| Agent | Schedule | Type | Purpose |
|-------|----------|------|---------|
| morning-digest | Daily 7 AM M-F | Special ($0) | Posts yesterday's stats to Discord |

---

## 6. The Collective Brain

The Collective Brain is the cross-agent learning layer. Agents share what they've learned so every future run is smarter than the last.

### Four Layers

| Layer | Table | Written By | What It Stores |
|-------|-------|-----------|---------------|
| **1 — Observations** | `brain_observations` | Any agent during a run | Real-time signals: market insights, lead signals, content gaps |
| **2 — Feedback** | `brain_feedback` | Manual approval/rejection in the UI | Which outputs worked (approved) vs. didn't (rejected) |
| **3 — Episodes** | `brain_episodes` | On meaningful outcomes | Full context snapshot: market, ERP, action taken, outcome, score |
| **4 — Knowledge Base** | `brain_knowledge_base` | Nightly distillation at 2 AM | Distilled best practices from Layers 2 + 3 |

### How It Flows

```
Agent writes discovery run
  → Layer 1: "Tampa Bay: 23 GC companies found, 4 with $10M+ revenue"

CFO Manager / user approves outreach draft
  → Layer 2: "jake-outreach-agent: approved — erp=QuickBooks, FL market"

Lead replies INTERESTED
  → Layer 3: "Episode: firm tone + QuickBooks pain + FL → interested reply in 7 days"

2 AM nightly distillation
  → Layer 4: "For QuickBooks users in FL: firm tone converts at 73%"

Next Monday, jake-outreach-agent runs
  → Brain context prepended: "For QB users in FL, use firm tone (73% conversion)"
  → Agent generates better outreach automatically
```

### Storage

- **Primary**: Azure SQL (`cfoinsight` database)
- **Fallback**: SQLite (`brain_observations`, `brain_feedback` etc. tables in clawops.db)
- If Azure is unreachable, writes queue in SQLite → `drainFallback()` syncs on next successful connection

### Schedule

- **2:00 AM every night** → `scheduleRunner.js` calls `brain.runDistillation()` automatically
- **Every server start** → logs current brain stats to console (observations, feedback, episodes, KB total)

---

## 7. Pipelines & Orchestration

### Schedule Runner

`server/services/scheduleRunner.js` — the heartbeat of ClawOps.

- Fires every **60 seconds**, aligned to minute boundary
- Reads all `schedules WHERE enabled=1` from DB
- For each due schedule: fires SPECIAL_HANDLER (if configured) or OpenClaw CLI
- **No confirmation gate** — scheduled runs execute automatically
- **Daily spend cap** — skips runs if daily budget exceeded (max_cost_per_run × max_runs_per_hour)
- **Brain context injection** — prepends 4-layer brain context to every LLM agent's message

### Pipeline Runner

`server/services/pipelineRunner.js` — chains agents into workflows.

6 predefined pipelines:
```
jake-full-pipeline:        discovery → enricher → lead-scout → outreach
hoa-content-pipeline:      content-writer → cms-publisher → facebook-poster
hoa-lead-pipeline:         discovery → contact-finder → enricher → outreach-drafter
mgmt-research-pipeline:    portfolio-scraper → contact-puller → mapper → review-scanner
jake-signal-pipeline:      permit-scanner → hiring-signal → bid-scraper → lead-scout
jake-close-pipeline:       reply-classifier → meeting-booker → crm-sync
```

### Post-Processor

`server/services/postProcessor.js` — routes LLM agent output to the right DB table.

Every time an LLM agent completes, the post-processor parses the output and routes it:
- Outreach emails → `cfo_outreach_sequences`
- Blog posts / social content → `cfo_content_pieces`
- Lead data → `cfo_leads`
- Analytics / metrics → Discord embed

### Confirmation Gate (Manual Runs)

When a run is triggered manually from the UI:
1. Run created in `pending` state
2. User sees confirmation dialog with agent name + message
3. User clicks Confirm → `POST /api/runs/:id/confirm`
4. Server executes SPECIAL_HANDLER or OpenClaw CLI
5. Result streamed back via Socket.io in real time

---

## 8. Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19 + Vite 7 + Tailwind CSS v4 |
| **State** | Zustand v5 + TanStack Query v5 |
| **Realtime** | Socket.io 4.8 |
| **Backend** | Express 5.2 (Node.js 24) |
| **Database** | SQLite (sql.js 1.13) — pure JS, single file |
| **Auth** | JWT 9.0 + bcrypt 3.0 |
| **AI** | OpenAI GPT-4o via OpenClaw CLI |
| **Agent Runtime** | OpenClaw CLI v2026.2.19 |
| **Web Scraping** | Playwright 1.58 (headless Chrome) |
| **Email** | SendGrid 8.1 |
| **Notifications** | Discord Webhooks + discord.js 14.25 |
| **Blog Publishing** | GitHub API → Netlify |
| **Charts** | Recharts 3.7 |

---

## 9. How to Run

```bash
# Install
npm install

# Configure — minimum required
cp .env.example .env.local
# Set: OPENAI_API_KEY, JWT_SECRET, DISCORD_WEBHOOK_URL, GITHUB_TOKEN, SENDGRID_API_KEY

# Seed agents into DB
node scripts/seed-all-agents.js

# Start everything
npm run dev
# → Backend:  http://localhost:3001
# → Frontend: http://localhost:5174
# → Trader:   http://localhost:3002

# Login
# admin@clawops.local / changeme123

# Verify OpenClaw
openclaw agents list          # should show all registered agents
openclaw doctor               # check gateway — may show 'stopped' (false negative)
netstat -ano | findstr ':18789' # real check — if listening, gateway is up

# Kill stale Node (Windows)
powershell -Command "Get-Process node | Stop-Process -Force"
```

---

## 10. Current State (Feb 26, 2026)

### What's Live & Working
- ✅ 50+ agents registered and schedulable
- ✅ Jake construction discovery (Google Maps, $0, Tampa Bay: 23 leads, Denver: 31)
- ✅ Jake contact enricher (24% email hit rate on Maps leads — 13/54)
- ✅ HOA discovery (South Florida: 568 HOAs, 162 queries)
- ✅ Blog pipeline (content-writer → cms-publisher → GitHub → Netlify live)
- ✅ Discord notifications (every run + 7 AM morning digest)
- ✅ Reply classifier ($0, instant, INTERESTED/NOT_NOW/BOUNCED/UNSUBSCRIBE/WRONG_PERSON)
- ✅ Follow-up agent (auto-detects 5+ day no-reply, drafts sequence_position=2)
- ✅ Meeting booker (drafts confirmation email for INTERESTED leads)
- ✅ Collective Brain all 4 layers (nightly distillation at 2 AM)
- ✅ Brain context injected into every scheduled LLM run
- ✅ Morning digest → Discord (yesterday's stats, costs, pipeline health)

### Active Schedule (Automatic, No Human Touch)
```
Mon 6:00 AM  jake-construction-discovery  ← Google Maps GC scraper
Mon 7:00 AM  jake-lead-scout              ← LLM national lead scout
Mon 8:00 AM  hoa-content-writer           ← Blog post
Mon 8:30 AM  hoa-cms-publisher            ← GitHub → Netlify deploy
Mon 9:00 AM  jake-content-engine          ← LinkedIn article
Daily 7 AM   morning-digest               ← Discord stats (M-F)
Daily 10 AM  hoa-facebook-poster          ← FB page post
Daily 10 AM  jake-analytics-monitor       ← Pipeline dashboard
Daily 6 PM   daily-debrief                ← War room report (M-F)
Wed/Fri 9 AM jake-follow-up-agent         ← Follow-ups for no-reply leads
Daily 2 AM   [brain distillation]         ← Nightly KB update
```

### Data in DB
- 54 construction leads (Maps discovery) — 13 email, 12 partial, 29 failed enrichment
- 568 HOA communities (South Florida)
- 2 KB entries in brain (social posts, distilled from approved content)
- All agents at `idle` status

### Known Workarounds
- Playwright page.close() hangs → fixed: `Promise.race([page.close(), setTimeout(3s)])`
- Browser state degradation → restart every 5 leads in enricher
- Email false matches → validate page text vs. company name before accepting
- Contact name blacklist → reject "with", "our", "the" as person names

---

## 11. External Integrations

| Service | Purpose | Cost |
|---------|---------|------|
| **OpenAI GPT-4o** | LLM intelligence for all LLM agents | ~$0.025/run |
| **OpenClaw CLI** | Agent runtime (spawned per run) | $0 (local) |
| **Google Maps** (via Playwright) | Company discovery for both engines | $0 |
| **SendGrid** | Outreach email sending | ~$0.001/email |
| **Discord** | Run notifications + morning digest | $0 |
| **GitHub API** | Blog publishing → Netlify | $0 |
| **Netlify** | hoaprojectfunding.com hosting | $0 (free tier) |
| **Twitter API v2** | Tweet posting | $0 |
| **Twilio** | SMS follow-up | $0.0075/SMS |
| **Alpaca** | Stock trading (TradingPage) | $0–20/mo |
| **Azure SQL** | Collective Brain backend | Pay-as-you-go |
| **Google Sheets** | CRM sync for replied leads | $0 |
| **LinkedIn** | People/job search (via web_search) | $0 |
| **Bing Search** | Email domain hunting in enricher | $0 |

---

## 12. Key Files Reference

| File | Purpose |
|------|---------|
| `CLAUDE.md` | AI assistant instructions — stack, commands, architecture rules |
| `server/index.js` | Entry point — ALL routes registered here (both lines required) |
| `server/routes/runs.js` | Run confirmation gate + all 30+ SPECIAL_HANDLERS |
| `server/services/scheduleRunner.js` | Cron engine — fires every 60s, brain context injection, nightly distillation |
| `server/services/postProcessor.js` | Routes LLM output to cfo_leads / cfo_content_pieces / cfo_outreach_sequences |
| `server/services/openclawBridge.js` | Spawns `openclaw agent --local --json`, parses output |
| `server/services/collectiveBrain.js` | 4-layer learning system — Azure SQL + SQLite fallback |
| `server/services/pipelineRunner.js` | Multi-agent workflow orchestration |
| `server/services/jakeConstructionDiscovery.js` | Google Maps GC scraper ($0) |
| `server/services/jakeContactEnricher.js` | 5-step email waterfall ($0) |
| `server/services/discordNotifier.js` | Discord webhook + embed formatting |
| `server/services/githubPublisher.js` | Blog → GitHub → Netlify |
| `server/db/schema.sql` | Full SQLite schema (35+ tables) |
| `server/db/migrations/` | 27 incremental migration files |
| `scripts/seed-all-agents.js` | Seeds all 50 agents to DB (idempotent) |
| `openclaw-skills/{name}/SOUL.md` | Agent personality — auto-loaded by OpenClaw |
| `client/src/pages/` | 30+ React page components |
| `.env.local` | All secrets (never committed to git) |

---

*Last updated: 2026-02-26 | ClawOps Console | Jake Marketing + HOA Project Funding*
