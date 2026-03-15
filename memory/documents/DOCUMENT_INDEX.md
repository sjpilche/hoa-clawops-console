# Document Index
*Master index of all important files in the ClawOps repo that agents should know about. Use this before any run to find the right files to load. Last updated: 2026-03-13.*

---

## How to Use This Index

Do not load this index on every run. Load it when:
- You need to find a file you don't know the path of
- You are starting a new type of task and need to know what context exists
- You are doing a system change and need to know what files will be affected

For operational runs (enrichment, outreach, discovery), skip this file and go directly to the relevant project memory file.

---

## Founder Context (`founder/`)

Load these files for strategic alignment. They define what Steve wants, how he thinks, and what counts as a good result.

| File | Description | When to Load |
|------|-------------|-------------|
| `founder/agent_mandate.md` | Standing operating orders for every agent. Defines the revenue hierarchy, what a good run looks like, and the standing question. | Any time you're not sure if your planned output is valuable |
| `founder/founder_profile.md` | Steve's background, construction CFO expertise, communication style, time constraints, and what he cares about | Content creation runs, outreach tone calibration, offer positioning |
| `founder/founder_goals.md` | Near-term revenue targets, opportunity criteria, what "winning" looks like in the next 90 days | Opportunity scoring, pipeline director decisions, weekly priorities |
| `founder/decision_frameworks.md` | ICE scoring, leverage hierarchy, escalation triggers, kill criteria | Evaluating new ideas, scoring opportunities, deciding what to build vs. skip |
| `founder/industries.md` | Industries Steve targets: construction GC, HOA management, property management. Buyer personas per industry. | Lead scoring, outreach personalization, new market evaluation |
| `founder/current_projects.md` | Live snapshot of Steve's active projects, current focus, and what he's working on personally | Todd's morning brief, reverse prompt engine context load |

---

## Org Structure (`org/`)

Defines the agent hierarchy and role assignments.

| File | Description | When to Load |
|------|-------------|-------------|
| `org/agent_org_chart.md` | Full chain of command: Steve → Todd → Departments → Agents. Includes VACANT roles. | Assigning a new task, understanding who should run what, identifying coverage gaps |
| `org/agent_roles.md` | Detailed role descriptions for each agent position (not agent-specific — the role) | Hiring (creating a new agent), redefining what an agent should do |
| `org/agent_responsibilities.md` | What each agent is accountable for, what they are not responsible for, hand-off rules | Debugging ownership confusion, determining escalation path |

---

## Agent Personalities (`openclaw-skills/*/SOUL.md`)

Every agent's SOUL.md is their operating instruction set. Never run an agent without its SOUL.md loaded. Listed here for reference only — agents load their own automatically via OpenClaw.

### Executive Agents (Orchestrators)
| Agent | SOUL.md Path | Role |
|-------|-------------|------|
| todd | `openclaw-skills/todd/SOUL.md` | Chief of Staff — routes tasks, monitors fleet, surfaces priorities |
| main | `openclaw-skills/main/SOUL.md` | Chat router — interprets user requests, delegates to agents |
| scout | `openclaw-skills/scout/SOUL.md` | Opportunity scout — finds and scores new business ideas |
| charlie | `openclaw-skills/charlie/SOUL.md` | [Defined in SOUL.md] |
| quill | `openclaw-skills/quill/SOUL.md` | Content writer — all written output, blog, social, outreach copy |
| ralph | `openclaw-skills/ralph/SOUL.md` | Memory manager — handles brain distillation and knowledge management |

### Jake Pipeline Agents
| Agent | SOUL.md Path | Role |
|-------|-------------|------|
| jake-construction-discovery | `openclaw-skills/jake-construction-discovery/SOUL.md` | *(no SOUL.md found — uses special handler only)* |
| jake-contact-enricher | `openclaw-skills/jake-contact-enricher/SOUL.md` | 5-step email enrichment waterfall |
| jake-lead-scout | `openclaw-skills/jake-lead-scout/SOUL.md` | LLM-powered national lead scout with market rotation |
| jake-outreach-agent | `openclaw-skills/jake-outreach-agent/SOUL.md` | Cold email outreach and sequencing |
| jake-follow-up-agent | `openclaw-skills/jake-follow-up-agent/SOUL.md` | Follow-up on leads 5+ days with no reply |
| jake-meeting-booker | `openclaw-skills/jake-meeting-booker/SOUL.md` | Meeting confirmation drafts for INTERESTED replies |
| jake-content-engine | `openclaw-skills/jake-content-engine/SOUL.md` | Jake brand content (blog, social, case studies) |
| jake-social-scheduler | `openclaw-skills/jake-social-scheduler/SOUL.md` | Schedules Jake social posts across channels |
| jake-analytics-monitor | `openclaw-skills/jake-analytics-monitor/SOUL.md` | Monitors pipeline metrics, flags anomalies |
| jake-offer-proof-builder | `openclaw-skills/jake-offer-proof-builder/SOUL.md` | Builds proof assets from pilot outcomes |
| jake-pilot-deliverer | `openclaw-skills/jake-pilot-deliverer/SOUL.md` | Delivers pilot engagements |
| jake-crm-sync | `openclaw-skills/jake-crm-sync/SOUL.md` | Pushes pipeline to Google Sheets / CSV |
| jake-pain-signal-monitor | `openclaw-skills/jake-pain-signal-monitor/SOUL.md` | Monitors forums/job boards for pain signals |
| jake-hiring-signal-agent | `openclaw-skills/jake-hiring-signal-agent/SOUL.md` | Monitors job postings for CFO/controller hires |
| jake-permit-scanner | `openclaw-skills/jake-permit-scanner/SOUL.md` | County permit portal lead discovery |
| jake-twitter-poster | `openclaw-skills/jake-twitter-poster/SOUL.md` | Twitter/X posts for Jake brand |
| jake-case-study-builder | `openclaw-skills/jake-case-study-builder/SOUL.md` | Converts pilot results into case studies |
| bid-result-scraper | `openclaw-skills/bid-result-scraper/SOUL.md` | FL/TX procurement portal GC contract awards |
| competitor-intel | `openclaw-skills/competitor-intel/SOUL.md` | Competitor and market intelligence gathering |
| linkedin-direct-poster | `openclaw-skills/linkedin-direct-poster/SOUL.md` | LinkedIn posts |
| sms-follow-up | `openclaw-skills/sms-follow-up/SOUL.md` | SMS follow-up via Twilio |
| content-repurposer | `openclaw-skills/content-repurposer/SOUL.md` | Converts 1 post → 5 channel variants |

### CFO Marketing Agents (unified with Jake tables)
| Agent | SOUL.md Path |
|-------|-------------|
| cfo-lead-scout | `openclaw-skills/cfo-lead-scout/SOUL.md` |
| cfo-outreach-agent | `openclaw-skills/cfo-outreach-agent/SOUL.md` |
| cfo-content-engine | `openclaw-skills/cfo-content-engine/SOUL.md` |
| cfo-social-scheduler | `openclaw-skills/cfo-social-scheduler/SOUL.md` |
| cfo-analytics-monitor | `openclaw-skills/cfo-analytics-monitor/SOUL.md` |
| cfo-offer-proof-builder | `openclaw-skills/cfo-offer-proof-builder/SOUL.md` |
| cfo-pilot-deliverer | `openclaw-skills/cfo-pilot-deliverer/SOUL.md` |

### HOA Pipeline Agents
| Agent | SOUL.md Path |
|-------|-------------|
| hoa-discovery | `openclaw-skills/hoa-discovery/SOUL.md` |
| hoa-contact-finder | `openclaw-skills/hoa-contact-finder/SOUL.md` |
| hoa-contact-enricher | `openclaw-skills/hoa-contact-enricher/SOUL.md` |
| hoa-outreach-drafter | `openclaw-skills/hoa-outreach-drafter/SOUL.md` |
| hoa-minutes-monitor | `openclaw-skills/hoa-minutes-monitor/SOUL.md` |
| hoa-special-assessment-monitor | `openclaw-skills/hoa-special-assessment-monitor/SOUL.md` |
| google-reviews-monitor | `openclaw-skills/google-reviews-monitor/SOUL.md` |
| hoa-content-writer | `openclaw-skills/hoa-content-writer/SOUL.md` |
| hoa-cms-publisher | `openclaw-skills/hoa-cms-publisher/SOUL.md` |
| hoa-social-media | `openclaw-skills/hoa-social-media/SOUL.md` |
| hoa-social-engagement | `openclaw-skills/hoa-social-engagement/SOUL.md` |
| hoa-networker | `openclaw-skills/hoa-networker/SOUL.md` |
| hoa-email-campaigns | `openclaw-skills/hoa-email-campaigns/SOUL.md` |
| hoa-facebook-poster | `openclaw-skills/hoa-facebook-poster/SOUL.md` |
| hoa-website-publisher | `openclaw-skills/hoa-website-publisher/SOUL.md` |

### Data Rehab Agents
| Agent | SOUL.md Path |
|-------|-------------|
| data-rehab-outreach | `openclaw-skills/data-rehab-outreach/SOUL.md` |
| data-rehab-content | `openclaw-skills/data-rehab-content/SOUL.md` |
| data-rehab-scout | `openclaw-skills/data-rehab-scout/SOUL.md` |

### Management Research Agents
| Agent | SOUL.md Path |
|-------|-------------|
| mgmt-portfolio-scraper | `openclaw-skills/mgmt-portfolio-scraper/SOUL.md` |
| mgmt-contact-puller | `openclaw-skills/mgmt-contact-puller/SOUL.md` |
| mgmt-portfolio-mapper | `openclaw-skills/mgmt-portfolio-mapper/SOUL.md` |
| mgmt-review-scanner | `openclaw-skills/mgmt-review-scanner/SOUL.md` |
| mgmt-cai-scraper | `openclaw-skills/mgmt-cai-scraper/SOUL.md` |

### Core / Operations Agents
| Agent | SOUL.md Path |
|-------|-------------|
| daily-debrief | `openclaw-skills/daily-debrief/SOUL.md` |

---

## Systems (`systems/`)

Operational specs for the platform's intelligent systems.

| File | Description | When to Load |
|------|-------------|-------------|
| `systems/reverse_prompt_engine.md` | Full spec for the Reverse Prompt Engine — how agents analyze system state and surface ranked recommendations proactively. Includes the scoring frameworks and output format. | When running a reverse prompt analysis, when Todd prepares Steve's morning brief |
| `systems/daily_mission_brief_template.md` | Template for Steve's daily morning brief — what Todd assembles from the engine output. | Todd's morning brief generation |
| `systems/opportunity_log.md` | Master list of all scored business opportunities. Ranked by priority score. Includes status: EVALUATING / APPROVED / TESTING / VALIDATED / KILLED. | Opportunity scoring runs, weekly strategy review, scoring new ideas |

---

## Memory (`memory/`)

The Layer 0 file-based memory system.

| File | Description | When to Load |
|------|-------------|-------------|
| `memory/MEMORY_ARCHITECTURE.md` | Master spec for the 5-layer memory model. How all layers relate, what goes where, TTLs, compression rules. | Before any system change to memory, when adding a new agent that needs memory access |
| `memory/AGENT_MEMORY_INSTRUCTIONS.md` | How agents read, write, and compress memory. Trigger rules, write format, retrieval priority order. | Before performing any memory operation (read or write) |
| `memory/documents/DOCUMENT_INDEX.md` | This file. Self-referential. | When you don't know where something lives |

---

## Active Project Memory (`memory/project_memory/`)

Pre-populated with current state. Update after every pipeline milestone.

| File | Project | Status |
|------|---------|--------|
| `memory/project_memory/jake_pipeline.md` | Jake Construction GC Pipeline | ACTIVE |
| `memory/project_memory/hoa_pipeline.md` | HOA Project Funding Pipeline | ACTIVE |
| `memory/project_memory/data_rehab.md` | Data Rehab ERP Cleanup | EVALUATING |

---

## Key Scripts (`scripts/`)

Operational scripts. Run from project root. Not agent runs — these are one-off Node.js tools.

### Agent Management
| Script | What It Does |
|--------|-------------|
| `scripts/seed-all-agents.js` | Seeds all 35+ agents to DB. Run after any agent config change or fresh DB. |
| `scripts/list-agents.js` | Lists all agents in DB with status. Use to verify registration. |
| `scripts/fix-agents-and-schedules.js` | Repairs malformed agent configs and schedule records. |
| `scripts/fix-agent-configs.js` | Fixes JSON config fields on agent records. |
| `scripts/seed-schedules.js` | Seeds all 41 auto-schedules to DB. |

### Jake Pipeline Operations
| Script | What It Does |
|--------|-------------|
| `scripts/trigger-discovery.js` | Triggers jake-construction-discovery for a specific market. Usage: `node scripts/trigger-discovery.js "Tampa Bay, FL" 50` |
| `scripts/trigger-enricher.js` | Triggers jake-contact-enricher. Usage: `node scripts/trigger-enricher.js 30 pending maps` |
| `scripts/trigger-scout.js` | Triggers jake-lead-scout manually. |
| `scripts/reset-enrichment.js` | Resets failed enrichment records so they can be retried. Usage: `node scripts/reset-enrichment.js maps` or `maps CO` for state filter |
| `scripts/check-enriched.js` | Reports enrichment status counts from DB. |
| `scripts/check-cfo-leads.js` | Shows current cfo_leads table summary. |
| `scripts/send-outreach-emails.js` | Sends drafted outreach sequences via SendGrid. |
| `scripts/send-outreach-batch.js` | Batch send from outreach queue. |

### Data Rehab
| Script | What It Does |
|--------|-------------|
| `scripts/send-datarehab-blast.js` | Outreach blast for Data Rehab product. **UNREVIEWED** — read before running. |

### HOA Pipeline Operations
| Script | What It Does |
|--------|-------------|
| `scripts/run-hoa-discovery.js` | Runs HOA discovery for a geo-target. |
| `scripts/run-hoa-search.js` | Runs HOA search query. |
| `scripts/run-minutes-monitor.js` | Triggers minutes monitor manually. |
| `scripts/run-contact-enricher.js` | Triggers HOA contact enricher. |
| `scripts/run-outreach-drafter.js` | Triggers outreach draft generation. |
| `scripts/run-google-reviews-monitor.js` | Triggers reviews monitor. |
| `scripts/seed-geo-targets.js` | Seeds 19 geo-targets to DB. |
| `scripts/init-hoa-leads-db.js` | Initializes HOA leads database tables. |

### Database Operations
| Script | What It Does |
|--------|-------------|
| `scripts/fix-stuck-runs.js` | Resets runs stuck in 'running' status (after crash/restart). |
| `scripts/check-stats.js` | Overall DB stats summary. |
| `scripts/check-db-companies.js` | Reports company count by source. |
| `scripts/explore-azure-db.js` | Queries Azure PostgreSQL for Collective Brain stats. |
| `scripts/check-azure-sync.js` | Checks Azure sync status for Collective Brain. |

### Pipelines
| Script | What It Does |
|--------|-------------|
| `scripts/seed-pipelines.js` | Seeds 6 predefined pipeline definitions. Run AFTER server starts. |
| `scripts/run-pipeline-batch.js` | Runs a pipeline batch manually. |

---

## Server Routes and Services (Reference)

Key server files agents may need to understand:

| File | Description |
|------|-------------|
| `server/index.js` | Main Express app — all routes registered here. Add new routes here. |
| `server/routes/runs.js` | Agent run management + all SPECIAL_HANDLERS. Read before adding new handlers. |
| `server/services/openclawBridge.js` | Spawns OpenClaw CLI. Bridge between Express and agent runtime. |
| `server/services/scheduleRunner.js` | Fires every 60s. Checks schedules, dispatches pending runs. |
| `server/services/postProcessor.js` | Routes LLM output to DB tables (cfo_leads, cfo_content_pieces, etc.). |
| `server/services/collectiveBrain.js` | Collective Brain service — observe, recordFeedback, recordEpisode, distill. |
| `server/services/jakeConstructionDiscovery.js` | Google Maps scraper for GC companies. |
| `server/services/jakeContactEnricher.js` | 5-step email enrichment waterfall. |
| `server/db/schema.sql` | Full DB schema — read before writing any SQL. |
| `server/db/migrations/` | All DB migrations in numbered sequence. |

---

## What to Load Before Starting Any Task

**Decision tree — use the first branch that matches your task:**

```
Starting a run →

  Is this a lead discovery / enrichment task?
  → Load: memory/project_memory/jake_pipeline.md (Jake)
       OR memory/project_memory/hoa_pipeline.md (HOA)
  → Also: today's daily log if it exists

  Is this an outreach / follow-up task?
  → Load: memory/project_memory/(pipeline).md
  → Also: Collective Brain context via /api/brain/context-preview?q=outreach
  → Also: today's daily log

  Is this a content creation task?
  → Load: openclaw-skills/quill/SOUL.md (always)
  → Load: founder/founder_profile.md (tone calibration)
  → Skip project memory unless writing about a specific pipeline

  Is this an opportunity evaluation / scoring task?
  → Load: memory/business_ideas/SCORING_RUBRIC.md
  → Load: systems/opportunity_log.md
  → Do NOT load pipeline memory (different context)

  Is this a system change / debugging task?
  → Load: memory/documents/DOCUMENT_INDEX.md (this file)
  → Load: memory/MEMORY_ARCHITECTURE.md
  → Also: server/routes/runs.js (if touching handlers)
  → Also: server/db/schema.sql (if touching DB)

  Is this Todd preparing Steve's morning brief?
  → Load: systems/reverse_prompt_engine.md
  → Load: systems/daily_mission_brief_template.md
  → Load: memory/daily_logs/(yesterday).md

  Is this an unknown or novel task?
  → Load: founder/agent_mandate.md (grounds you in what matters)
  → Load: today's daily log (prevents duplicate work)
  → Ask Todd before proceeding if still unclear
```

**Hard rule:** If you need more than 3 memory files to start, the task is either too broad or needs to be broken into subtasks. Ask Todd.
