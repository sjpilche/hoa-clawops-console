# 03 — Shared Assets and Cross-Agent Coupling

---

## Shared Services (Used By Multiple Agents)

### Tier 1: Used by ALL agents

| Service | File | What It Does | Who Uses It |
|---------|------|-------------|-------------|
| `collectiveBrain.js` | server/services/collectiveBrain.js | 4-layer learning + brain context injection | Every agent via `buildAgentContext()` |
| `scheduleRunner.js` | server/services/scheduleRunner.js | 60s heartbeat cron, dispatches all 59 schedules | All scheduled agents |
| `runs.js` | server/routes/runs.js | SPECIAL_HANDLERS registry + LLM dispatch | All agents |
| `openclawBridge.js` | server/services/openclawBridge.js | OpenClaw CLI spawner + founder mandate injection | All LLM agents |
| `discordNotifier.js` | server/services/discordNotifier.js | Discord webhook post after every run | All agents (via scheduleRunner) |

### Tier 2: Used by agent subsets

| Service | File | Who Uses It |
|---------|------|-------------|
| `postProcessor.js` | server/services/postProcessor.js | All LLM agents — routes output to DB tables |
| `pipelineRunner.js` | server/services/pipelineRunner.js | Pipeline-chained agents |
| `pipelineDirector.js` | server/services/pipelineDirector.js | Dispatches to enrichment/outreach/follow-up agents |
| `playwrightPool.js` | server/services/playwrightPool.js | All Playwright scraper agents (discovery, enrichment, intel) |
| `ollamaBridge.js` | server/services/ollamaBridge.js | RSE, Opportunity Engine, some fallback agents |
| `llmClient.js` | server/services/llmClient.js | Unified LLM client (GPT-4o, Ollama) |
| `ralphQA.js` | server/services/ralphQA.js | Reviews all content + outreach agents' output |
| `tenacityCadenceEngine.js` | server/services/tenacityCadenceEngine.js | Jake + HOA follow-up agents |

---

## Shared Database Tables

### Tables written by multiple agents

| Table | Writers | Purpose |
|-------|---------|---------|
| `cfo_leads` | jake-construction-discovery, jake-lead-scout, jake-contact-enricher, cfo-lead-scout, competitor-intel, jake-pain-signal-monitor, bid-result-scraper, jake-permit-scanner | Unified lead store (Jake + CFO) |
| `cfo_content_pieces` | jake-content-engine, hoa-content-writer, jake-social-scheduler, hoa-social-media, jake-offer-proof-builder, jake-case-study-builder, content-repurposer | All content |
| `cfo_outreach_sequences` | jake-outreach-agent, hoa-email-campaigns, hoa-outreach-drafter, jake-follow-up-agent, jake-pilot-deliverer | All outreach emails |
| `lg_engagement_queue` | hoa-social-engagement, hoa-networker, hoa-discovery | HOA engagement tracking |
| `runs` | Every agent | Execution log |
| `audit_log` | Every agent | Governance trail |
| `brain_fallback_*` | collectiveBrain.js (on behalf of all agents) | Brain SQLite fallback |

### Tables read by pipeline/operations agents

| Reader Agent | Tables Read |
|-------------|-------------|
| `pipeline-state-tracker` | cfo_leads, lg_engagement_queue, enrichment_attempts, cfo_outreach_sequences |
| `pipeline-director` | cfo_leads, lg_engagement_queue (pipeline_stage, next_action) |
| `urgency-scorer` | cfo_leads, lg_engagement_queue |
| `lead-dossier-generator` | cfo_leads + brain context (all 4 layers) |
| `tenacity-cadence-engine` | cfo_leads, lg_engagement_queue, cadence_touches |
| `ralph-qa` | cfo_content_pieces, cfo_outreach_sequences |
| `outreach-sender` | cfo_outreach_sequences (status=approved) |
| `dream-team-nightly` | agents, runs, cfo_leads (all agent scores) |

---

## Founder Mandate Injection Chain

```
founder/agent_mandate.md
    ↓
openclawBridge.js (line ~47: loadFounderMandate())
    ↓
Appended to every LLM agent's prompt
    ↓
Also used by: ollamaBridge.js
```

**Impact of modifying:** Changes behavior of ALL 27 LLM agents simultaneously.

---

## Cross-Agent Data Flow (Pipeline Sequences)

### Jake Construction Pipeline
```
jake-construction-discovery (Google Maps → cfo_leads, status=new)
    ↓
jake-contact-enricher (enriches email/phone → cfo_leads, status=enriched)
    ↓
urgency-scorer (scores 0-100 → cfo_leads.urgency_score)
    ↓
lead-dossier-generator (builds dossier → lead_dossier table)
    ↓
pipeline-director (dispatches next action based on pipeline_stage)
    ↓
jake-outreach-agent (drafts email → cfo_outreach_sequences, status=draft)
    ↓
ralph-qa (scores draft → cfo_outreach_sequences.qa_status)
    ↓
outreach-sender (sends via SendGrid → cfo_outreach_sequences, status=sent)
    ↓
jake-reply-classifier (classifies reply → cfo_leads.status updated)
    ↓
jake-meeting-booker (if INTERESTED → meeting email, status=pending)
    ↓
tenacity-cadence-engine (if NOT_NOW → 12-touch cadence)
```

### HOA Pipeline
```
hoa-discovery (Google Maps → lg_engagement_queue)
    ↓
hoa-contact-finder → hoa-contact-enricher → hoa-outreach-drafter
    ↓
ralph-qa → outreach-sender
```

### Content Pipeline
```
jake-content-engine OR hoa-content-writer (→ cfo_content_pieces, status=draft)
    ↓
ralph-qa (reviews → qa_status=approved/flagged)
    ↓
hoa-cms-publisher (→ GitHub API → Netlify deploy)
    ↓
jake-social-scheduler OR hoa-social-media (→ social derivatives)
    ↓
jake-twitter-poster / linkedin-direct-poster / hoa-facebook-poster
```

### RSE Pipeline
```
rse-channel-monitor (YouTube RSS → rse_sources)
    ↓
rse-transcript-extractor (yt-dlp → rse_transcripts)
    ↓
rse-signal-scorer (Ollama → rse_signals, scored)
    ↓
rse-build-spec-generator (GPT-4o → build spec)
    ↓
rse-code-builder (Ollama/GPT-4o → prototype code)
    ↓
rse-feedback-loop (updates trust scores)
```

---

## Shared Scripts

| Script | Used By | Purpose |
|--------|---------|---------|
| `scripts/seed-all-agents.js` | All agents | Seeds 66 agents to DB |
| `scripts/seed-all-schedules.js` | All scheduled agents | Seeds 59 schedules |
| `scripts/seed-pipelines.js` | Pipeline agents | Seeds 6 pipeline definitions |
| `scripts/backup-database.js` | database-backup agent | Creates timestamped DB copy |

---

## Shared Configuration

| Config | Location | Who Reads It |
|--------|----------|-------------|
| `.env.local` | root | server, all services |
| `.env.trader` | services/trader-service/ | trader service only |
| `ecosystem.config.cjs` | root | pm2 |
| `founder/agent_mandate.md` | founder/ | All LLM agents |
| `org/agent_org_chart.md` | org/ | Dream team nightly, documentation |

---

## Fragile Coupling Points

### 1. postProcessor.js routing logic
Routes LLM output to tables based on agent name patterns. If an agent is renamed, its output silently stops being routed.

### 2. SPECIAL_HANDLERS in runs.js
Handler names are strings matching `agent.config.special_handler`. If the handler name in seed-all-agents.js doesn't match runs.js, the agent falls through to LLM execution (costs money instead of $0).

### 3. pipeline-director's action dispatch
Hardcodes agent names for dispatch targets. If discovery/enricher/outreach agent names change, the director silently stops dispatching to them.

### 4. collectiveBrain.buildAgentContext()
Queries Azure SQL + SQLite for context. If Azure SQL is unreachable AND SQLite fallback tables don't exist, agents run without brain context (degraded but functional).

### 5. dream-team-nightly scorecard generation
Reads runs table for ALL agents by name. If agent names change without updating the nightly service, scorecards will show empty data.

### 6. Ralph QA → outreach-sender chain
Ralph sets `qa_status` on drafts. Outreach-sender only sends `qa_status=approved`. If Ralph stops running, no emails get sent (safe fail-closed).

---

## Naming Conventions

- Agent names use kebab-case: `jake-content-engine`
- Handler names use snake_case: `jake_content_engine`
- Agent groups match product lines: `jake-marketing`, `hoa-marketing`, `core`, etc.
- Database columns use snake_case: `cfo_leads`, `result_data`, `pipeline_stage`
- SOUL.md files: `openclaw-skills/<agent-name>/SOUL.md`
- Service files: `server/services/camelCase.js`

Mixing these conventions will cause silent failures.
