# 02 — Agent Fleet Inventory

**Source of truth:** `scripts/seed-all-agents.js` (66 agents defined)
**Agent SOUL.md files:** `openclaw-skills/<agent-name>/SOUL.md`
**UUID generation:** MD5 hash of agent name (deterministic, idempotent)

---

## Fleet Summary

| Cluster | Active | Frozen | Total | Special Handlers | LLM Agents |
|---------|--------|--------|-------|-----------------|------------|
| Core Ops | 7 | 0 | 7 | 6 | 1 |
| Jake Construction | 18 | 0 | 18 | 9 | 9 |
| HOA Project Funding | 14 | 0 | 14 | 6 | 8 |
| Management Research | 5 | 0 | 5 | 5 | 0 |
| Revenue Signal Engine | 8 | 0 | 8 | 6 | 2 |
| Opportunity Engine | 4 | 0 | 4 | 4 | 0 |
| Owen CFO (frozen) | 0 | 5 | 5 | 1 | 4 |
| Data Rehab (frozen) | 0 | 3 | 3 | 0 | 3 |
| **TOTAL** | **56** | **8** | **64** | **37** | **27** |

*Note: seed-all-agents.js lists these as the canonical fleet. The org chart references 66 — the delta is the 6 ghost CFO agents + 1 HOA agent cut in the 2026-03-14 compliance audit.*

---

## Cluster 1: Core Ops (7 agents)

| Agent | Handler | Cost | Schedule | Key Files | Coupling |
|-------|---------|------|----------|-----------|----------|
| `main` | (chat router) | varies | — | openclawBridge.js | Routes to all agents |
| `daily-debrief` | `daily_debrief` | varies | 6 PM M-F | runs.js inline | Reads all run data |
| `pipeline-digest` | `morning_digest` | $0 | 7 AM M-F | runs.js inline | Discord webhook |
| `outreach-sender` | `outreach_sender` | $0 | 10 AM M-F | runs.js inline, sendgrid.js | Reads cfo_outreach_sequences |
| `database-backup` | `database_backup` | $0 | 3 AM daily | runs.js inline | Copies clawops.db |
| `weekly-portfolio-review` | `weekly_portfolio_review` | $0 | 5 PM Fri | runs.js inline | Reads all agent scores |
| `ralph-qa` | `ralph_qa` | $0 | 9:30 AM M-F | server/services/ralphQA.js | Reviews cfo_content_pieces + cfo_outreach_sequences |

**Portability risk: LOW** — All deterministic handlers, no Playwright dependency.

---

## Cluster 2: Jake Construction (18 agents)

### Discovery & Enrichment (4)

| Agent | Handler | Cost | Schedule | Key Files | Coupling |
|-------|---------|------|----------|-----------|----------|
| `jake-construction-discovery` | `jake_construction_discovery` | $0 | Mon/Thu 6 AM | jakeConstructionDiscovery.js | **Playwright** → cfo_leads |
| `jake-lead-scout` | `jake_lead_scout` | varies | Mon 7 AM | smartRouter.js | → cfo_leads |
| `jake-contact-enricher` | `jake_contact_enricher` | $0 | M-F 8:30 AM | jakeContactEnricher.js | **Playwright** → enrichment_attempts |
| `cfo-lead-scout` | `cfo_lead_scout` | $0 | — | cfoLeadScout.js | **Playwright** → cfo_leads |

### Marketing & Content (7)

| Agent | Handler | Cost | Schedule | Key Files | Coupling |
|-------|---------|------|----------|-----------|----------|
| `jake-content-engine` | (LLM) | ~$0.03 | Mon 8 AM | openclawBridge.js → postProcessor.js | → cfo_content_pieces |
| `jake-outreach-agent` | (LLM) | ~$0.03 | Tue/Thu 10 AM | openclawBridge.js → postProcessor.js | → cfo_outreach_sequences |
| `jake-follow-up-agent` | (LLM) | ~$0.03 | Wed/Fri 9 AM | runs.js inline | Reads cfo_leads (status=contacted, 5+ days) |
| `jake-social-scheduler` | (LLM) | ~$0.03 | — | openclawBridge.js | → cfo_content_pieces (channel=social) |
| `jake-analytics-monitor` | (LLM) | ~$0.03 | 7:30 AM daily | openclawBridge.js | → Discord embed + audit_log |
| `jake-offer-proof-builder` | (LLM) | ~$0.03 | — | openclawBridge.js | → cfo_content_pieces (pillar=pilot_proof) |
| `jake-pilot-deliverer` | (LLM) | ~$0.03 | — | openclawBridge.js | → cfo_outreach_sequences (type=pilot) |

### Reply & Booking (3)

| Agent | Handler | Cost | Schedule | Key Files | Coupling |
|-------|---------|------|----------|-----------|----------|
| `jake-reply-classifier` | `jake_reply_classifier` | $0 | — (manual) | runs.js inline | → cfo_leads.status + brain Layer 2+3 |
| `jake-meeting-booker` | (LLM) | ~$0.03 | — (manual) | runs.js inline | Reads cfo_leads, **status=pending gate** |
| `jake-crm-sync` | `jake_crm_sync` | $0 | 11 PM daily | runs.js inline | Reads cfo_leads → Google Sheets |

### Social Publishing (3)

| Agent | Handler | Cost | Schedule | Key Files | Coupling |
|-------|---------|------|----------|-----------|----------|
| `jake-twitter-poster` | (LLM) | ~$0.03 | Tue/Thu 11 AM | openclaw-twitter ext | Reads cfo_content_pieces |
| `linkedin-direct-poster` | (LLM) | ~$0.03 | Wed 11 AM | openclawBridge.js | Reads cfo_content_pieces |
| `sms-follow-up` | (LLM) | $0.0075/sms | — | Twilio | Reads cfo_leads (10+ days no reply) |

### Signal Sources (3)

| Agent | Handler | Cost | Schedule | Key Files | Coupling |
|-------|---------|------|----------|-----------|----------|
| `jake-permit-scanner` | `jake_permit_scanner` | $0 | Wed 6 AM | runs.js inline | **Playwright** → cfo_leads |
| `jake-hiring-signal-agent` | (LLM) | ~$0.03 | — | openclawBridge.js | → cfo_leads |
| `bid-result-scraper` | `jake_bid_scraper` | $0 | Tue 6 AM | runs.js inline | **Playwright** → cfo_leads |

### Intel & Content (2)

| Agent | Handler | Cost | Schedule | Key Files | Coupling |
|-------|---------|------|----------|-----------|----------|
| `competitor-intel` | (LLM) | ~$0.03 | Fri 9 AM | openclawBridge.js | → cfo_leads (source=competitor_intel) |
| `jake-pain-signal-monitor` | (LLM) | ~$0.03 | — | openclawBridge.js | → cfo_leads (source=pain_signal) |
| `jake-case-study-builder` | (LLM) | ~$0.03 | — | openclawBridge.js | → cfo_content_pieces (pillar=pilot_proof) |
| `content-repurposer` | (LLM) | ~$0.03 | — | openclawBridge.js | Reads cfo_content_pieces → 5 derivatives |

**Portability risk: HIGH** — 4 agents depend on Playwright/Chromium for scraping.

---

## Cluster 3: HOA Project Funding (14 agents)

### Pipeline (4)

| Agent | Handler | Cost | Schedule | Key Files | Coupling |
|-------|---------|------|----------|-----------|----------|
| `hoa-discovery` | `hoa_discovery` | $0 | — | googleMapsDiscovery.js | **Playwright** → lg_engagement_queue |
| `hoa-contact-finder` | `hoa_contact_scraper` | $0 | — | hoaContactScraper.js | **Playwright** → hoa_contacts |
| `hoa-contact-enricher` | `hoa_contact_enricher` | $0 | — | hoaContactEnricher.js | **Playwright** → enrichment_results |
| `hoa-outreach-drafter` | `hoa_outreach_drafter` | varies | — | hoaOutreachDrafter.js | → cfo_outreach_sequences |

### Marketing & Content (8)

| Agent | Handler | Cost | Schedule | Key Files | Coupling |
|-------|---------|------|----------|-----------|----------|
| `hoa-content-writer` | (LLM) | ~$0.03 | Mon 8 AM | openclawBridge.js → postProcessor.js | → cfo_content_pieces |
| `hoa-cms-publisher` | `github_publisher` | $0 | Mon 8:30 AM | githubPublisher.js | GitHub API → Netlify deploy |
| `hoa-social-media` | (LLM) | ~$0.03 | — | openclawBridge.js | → cfo_content_pieces (channel=social) |
| `hoa-social-engagement` | (LLM) | ~$0.03 | — | openclawBridge.js | → lg_engagement_queue |
| `hoa-networker` | (LLM) | ~$0.03 | — | openclawBridge.js | → lg_engagement_queue |
| `hoa-email-campaigns` | (LLM) | ~$0.03 | — | openclawBridge.js | → cfo_outreach_sequences |
| `hoa-website-publisher` | (LLM) | ~$0.03 | — | openclawBridge.js | → cfo_content_pieces |
| `hoa-facebook-poster` | (LLM) | ~$0.03 | Daily 10 AM | openclawBridge.js | Facebook API |

### Intel (2)

| Agent | Handler | Cost | Schedule | Key Files | Coupling |
|-------|---------|------|----------|-----------|----------|
| `hoa-minutes-monitor` | `hoa_minutes_monitor` | $0 | — | runs.js inline | **Playwright** |
| `google-reviews-monitor` | `google_reviews_monitor` | $0 | — | googleReviewsMonitor.js | **Playwright** |

**Portability risk: HIGH** — 6 agents depend on Playwright, 1 depends on GitHub API + Netlify.

---

## Cluster 4: Management Research (5 agents)

| Agent | Handler | Cost | Schedule | Key Files | Coupling |
|-------|---------|------|----------|-----------|----------|
| `mgmt-portfolio-scraper` | `mgmt_portfolio_scraper` | $0 | — | mgmtPortfolioScraper.js | **Playwright** |
| `mgmt-contact-puller` | `mgmt_contact_puller` | $0 | — | mgmtContactPuller.js | **Playwright** |
| `mgmt-portfolio-mapper` | `mgmt_portfolio_mapper` | $0 | — | mgmtPortfolioMapper.js | — |
| `mgmt-review-scanner` | `mgmt_review_scanner` | $0 | — | mgmtReviewScanner.js | **Playwright** |
| `mgmt-cai-scraper` | `mgmt_cai_scraper` | $0 | — | mgmtCaiScraper.js | **Playwright** |

**Portability risk: HIGH** — All 5 use Playwright.

---

## Cluster 5: Revenue Signal Engine (8 agents)

| Agent | Handler | Cost | Schedule | Key Files | Coupling |
|-------|---------|------|----------|-----------|----------|
| `rse-channel-monitor` | `rse_channel_monitor` | $0 | 5 AM daily | runs.js inline | YouTube RSS |
| `rse-transcript-extractor` | `rse_transcript_extractor` | $0 | 5:30 AM daily | rseTranscriptService.js | **yt-dlp CLI** |
| `rse-signal-scorer` | `rse_signal_scorer` | $0 | 6 AM daily | rseSignalScorer.js | **Ollama** |
| `rse-build-spec-generator` | (LLM) | ~$0.03 | 7 AM daily | openclawBridge.js | GPT-4o |
| `rse-campaign-builder` | (LLM) | ~$0.03 | — | openclawBridge.js | GPT-4o |
| `rse-expert-librarian` | `rse_expert_librarian` | $0 | — | rseExpertLibrary.js | — |
| `rse-code-builder` | `rse_code_builder` | $0-$0.10 | — | rseCodeBuilder.js | **Ollama** (DeepSeek) or GPT-4o |
| `rse-feedback-loop` | `rse_feedback_loop` | $0 | — | runs.js inline | Updates rse_sources trust scores |

**Portability risk: MEDIUM** — Depends on yt-dlp CLI and Ollama, both easy to install.

---

## Cluster 6: Opportunity Engine (4 agents)

| Agent | Handler | Cost | Schedule | Key Files | Coupling |
|-------|---------|------|----------|-----------|----------|
| `opportunity-scanner` | `opportunity_scanner` | $0 | 3 AM daily | runs.js inline + scanners | **Ollama** |
| `opportunity-scorer` | `opportunity_scorer` | ~$0.01/cluster | 4 AM daily | opportunityScorer.js | GPT-4o |
| `software-factory` | `software_factory` | $0-$0.10 | 5 AM daily | softwareFactory.js | **Ollama** or GPT-4o |
| `traction-monitor` | `traction_monitor` | $0 | 6 AM daily | runs.js inline | — |

**Portability risk: MEDIUM** — Depends on Ollama models being pulled.

---

## Cluster 7: Pipeline & Operations (5 agents)

| Agent | Handler | Cost | Schedule | Key Files | Coupling |
|-------|---------|------|----------|-----------|----------|
| `urgency-scorer` | `urgency_scorer` | $0 | Mon 6 AM | urgencyScorer.js | Reads cfo_leads + lg_engagement_queue |
| `lead-dossier-generator` | `lead_dossier_generator` | $0 | — | leadDossierGenerator.js | Reads brain context |
| `pipeline-state-tracker` | `pipeline_state_tracker` | $0 | 1 AM daily | pipelineStateTracker.js | Reads all lead tables |
| `pipeline-director` | `pipeline_director` | $0 | 6:30 AM M-F | pipelineDirector.js | **Dispatches to 20+ agents** |
| `tenacity-cadence-engine` | `tenacity_cadence` | $0 | Mon/Wed/Fri 9 AM | tenacityCadenceEngine.js | Reads/writes cadence_touches |

**Portability risk: LOW** — All deterministic, but pipeline-director is highly coupled.

---

## Cluster 8: Dream Team + Training (2 agents)

| Agent | Handler | Cost | Schedule | Key Files | Coupling |
|-------|---------|------|----------|-----------|----------|
| `dream-team-nightly` | `dream_team_nightly` | ~$0.07 | 11 PM daily | dreamTeamNightly.js | **Touches ALL agents** (scorecards) |
| `idle-trainer` | `idle_training` | $0 | — | idleTrainer.js | rseTranscriptService.js |

**Portability risk: MEDIUM** — Dream team reads all agent data; idle-trainer needs yt-dlp.

---

## Cluster 9: Owen CFO — FROZEN (5 agents)

| Agent | Handler | Cost | Status | Notes |
|-------|---------|------|--------|-------|
| `owen-content-engine` | (LLM) | ~$0.03 | **disabled** | Schedules frozen |
| `owen-outreach-agent` | (LLM) | ~$0.03 | **disabled** | Schedules frozen |
| `owen-lead-scout` | `jake_lead_scout` | varies | **disabled** | Shares Jake's handler |
| `owen-social-scheduler` | (LLM) | ~$0.03 | **disabled** | Schedules frozen |
| `owen-analytics-monitor` | (LLM) | ~$0.03 | **disabled** | Schedules frozen |

**DO NOT DELETE** — May be reactivated. Owen shares Jake's lead scout handler.

---

## Cluster 10: Data Rehab — FROZEN (3 agents)

| Agent | Handler | Cost | Status | Notes |
|-------|---------|------|--------|-------|
| `data-rehab-outreach` | (LLM) | ~$0.03 | **disabled** | Schedules frozen |
| `data-rehab-content` | (LLM) | ~$0.03 | **disabled** | Schedules frozen |
| `data-rehab-scout` | (LLM) | ~$0.03 | **disabled** | Schedules frozen |

**DO NOT DELETE** — May be reactivated for foot-in-door campaigns.

---

## Agents That Would Break If Renamed

Every agent name is used as:
1. Database key in `agents` table
2. MD5 hash seed for UUID generation
3. Folder name in `openclaw-skills/<name>/`
4. Reference in `seed-all-schedules.js`
5. Reference in `postProcessor.js` routing logic
6. Possible hardcoded references in other agents' SOUL.md files

**Renaming any agent requires:** re-seeding agents, re-seeding schedules, updating SOUL.md cross-references, and verifying postProcessor routing.
