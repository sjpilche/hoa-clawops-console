/**
 * @file seed-all-agents.js
 * @description Syncs all 28 OpenClaw-registered agents into the Console's SQLite database.
 *
 * Run: node scripts/seed-all-agents.js
 * Safe to re-run — uses INSERT OR IGNORE so existing agents are not overwritten.
 */

const path = require('path');
const fs = require('fs');

// Agent definitions grouped by domain
const AGENT_FLEET = [
  // ── Core ──
  { name: 'main', description: 'Todd — Chief of Staff. Chat router + task dispatcher. Output: routed messages to correct agents, escalation flags to Steve. Not a scheduled agent — chat-only.', group: 'core' },
  { name: 'daily-debrief', description: 'End-of-day war room report — reviews all agent activity, trading, leads, costs', group: 'core', special_handler: 'daily_debrief' },

  // ── HOA Marketing (8) ──
  { name: 'hoa-content-writer', description: 'Blog posts for HOA Project Funding — 1,400-1,800 word SEO articles', group: 'hoa-marketing' },
  { name: 'hoa-cms-publisher', description: 'Publishes blog posts to GitHub → Netlify (deterministic, no LLM)', group: 'hoa-marketing', special_handler: 'github_publisher' },
  { name: 'hoa-social-media', description: 'Converts each published blog post into 1 Facebook post + 1 LinkedIn post. Output: cfo_content_pieces with channel=social. Scorecard: posts created per blog.', group: 'hoa-marketing' },
  { name: 'hoa-social-engagement', description: 'Drafts 3-5 helpful replies to HOA Facebook group questions per run. Output: lg_engagement_queue rows (status=pending_review). Scorecard: approval rate, engagement per post.', group: 'hoa-marketing' },
  { name: 'hoa-networker', description: 'Finds 5-10 HOA community posts on Reddit/BiggerPockets/Nextdoor and drafts helpful replies. Output: lg_engagement_queue rows. Scorecard: posts found, approval rate.', group: 'hoa-marketing' },
  { name: 'hoa-email-campaigns', description: 'Drafts 3-email nurture sequences for warm HOA leads. Output: cfo_outreach_sequences with sequence_type=nurture. Scorecard: open rate, reply rate.', group: 'hoa-marketing' },
  { name: 'hoa-website-publisher', description: 'Website content updates for hoaprojectfunding.com', group: 'hoa-marketing' },
  { name: 'hoa-facebook-poster', description: 'Posts content to HOA Project Funding Facebook page', group: 'hoa-marketing' },

  // ── HOA Pipeline (4) ──
  { name: 'hoa-discovery', description: 'Google Maps scraper — discovers HOAs across FL/TX/AZ/NV/GA/CA', group: 'hoa-pipeline', special_handler: 'hoa_discovery' },
  { name: 'hoa-contact-finder', description: 'Finds board member contact info for discovered HOAs', group: 'hoa-pipeline', special_handler: 'hoa_contact_scraper' },
  { name: 'hoa-contact-enricher', description: 'Enriches HOA contacts with email, phone, LinkedIn', group: 'hoa-pipeline', special_handler: 'hoa_contact_enricher' },
  { name: 'hoa-outreach-drafter', description: 'Drafts personalized outreach messages for HOA contacts', group: 'hoa-pipeline', special_handler: 'hoa_outreach_drafter' },

  // ── HOA Intel (2) ──
  { name: 'hoa-minutes-monitor', description: 'Monitors HOA board meeting minutes for project signals', group: 'hoa-intel', special_handler: 'hoa_minutes_monitor' },
  { name: 'google-reviews-monitor', description: 'Tracks Google review changes for management companies', group: 'hoa-intel', special_handler: 'google_reviews_monitor' },

  // ── Mgmt Research (5) ──
  { name: 'mgmt-portfolio-scraper', description: 'Scrapes management company portfolios and HOA listings', group: 'mgmt-research', special_handler: 'mgmt_portfolio_scraper' },
  { name: 'mgmt-contact-puller', description: 'Extracts contact info from management company websites', group: 'mgmt-research', special_handler: 'mgmt_contact_puller' },
  { name: 'mgmt-portfolio-mapper', description: 'Maps HOA-to-management-company relationships', group: 'mgmt-research', special_handler: 'mgmt_portfolio_mapper' },
  { name: 'mgmt-review-scanner', description: 'Scans review sites for management company sentiment', group: 'mgmt-research', special_handler: 'mgmt_review_scanner' },
  { name: 'mgmt-cai-scraper', description: 'Scrapes CAI (Community Associations Institute) directories', group: 'mgmt-research', special_handler: 'mgmt_cai_scraper' },

  // ── Jake Marketing ──
  // NOTE: cfo-content-engine, cfo-outreach-agent, cfo-social-scheduler, cfo-analytics-monitor,
  // cfo-offer-proof-builder, cfo-pilot-deliverer were CUT (2026-03-14 audit).
  // Reason: Ghost duplicates of Jake agents — no SOUL.md, no handler, no schedule, no output.
  // Rule 3: "One clear agent doing one job well beats five doing the same job badly."
  // cfo-lead-scout kept because it has a unique special_handler (DBPR scraper).
  { name: 'cfo-lead-scout', description: 'DBPR license scraper — discovers FL contractor leads ($0/run, deterministic)', group: 'jake-marketing', special_handler: 'cfo_lead_scout' },
  { name: 'jake-content-engine', description: 'Writes 1 LinkedIn post + 1 blog article per run in Jake voice. Output: cfo_content_pieces rows (status=draft). Scorecard: publish rate, engagement.', group: 'jake-marketing' },
  { name: 'jake-outreach-agent', description: 'Drafts 5-10 personalized cold emails per run for enriched leads with email. Output: cfo_outreach_sequences rows (status=draft). Scorecard: reply rate, QA pass rate.', group: 'jake-marketing' },
  { name: 'jake-lead-scout', description: 'National lead scout — finds named finance contacts at construction SMBs via LinkedIn/Facebook/web (rotates through 60 US markets)', group: 'jake-marketing', special_handler: 'jake_lead_scout' },
  { name: 'jake-contact-enricher', description: 'Playwright web scraper — finds emails for leads ($0/run)', group: 'jake-marketing', special_handler: 'jake_contact_enricher' },
  { name: 'jake-construction-discovery', description: 'Google Maps GC scraper — bulk construction company discovery across 60 national markets ($0/run, 50-150 companies per run)', group: 'jake-marketing', special_handler: 'jake_construction_discovery' },
  { name: 'jake-social-scheduler', description: 'Converts approved Jake content into 1 LinkedIn + 1 Twitter post per piece. Output: cfo_content_pieces with channel=social. Scorecard: posts scheduled per content piece.', group: 'jake-marketing' },
  { name: 'jake-analytics-monitor', description: 'Reports daily pipeline stats: new leads, emails sent, replies, cost. Output: Discord embed + audit_log entry. Scorecard: report accuracy, anomaly detection.', group: 'jake-marketing' },
  { name: 'jake-offer-proof-builder', description: 'Writes 1 case study or ROI calculator per closed pilot. Output: cfo_content_pieces with pillar=pilot_proof. Scorecard: pieces created per pilot.', group: 'jake-marketing' },
  { name: 'jake-pilot-deliverer', description: 'Creates pilot kickoff email + 30-day milestone checklist when lead status=pilot. Output: cfo_outreach_sequences with sequence_type=pilot. Scorecard: pilots kicked off, completion rate.', group: 'jake-marketing' },
  { name: 'jake-follow-up-agent', description: 'Generates follow-up emails for leads contacted 5+ days ago with no reply', group: 'jake-marketing' },
  { name: 'jake-reply-classifier', description: 'Classifies inbound email replies (INTERESTED/NOT_NOW/WRONG_PERSON/UNSUBSCRIBE/BOUNCED) and updates lead status ($0/run)', group: 'jake-marketing', special_handler: 'jake_reply_classifier' },
  { name: 'jake-meeting-booker', description: 'Drafts personalized meeting confirmation + agenda email for interested leads', group: 'jake-marketing' },

  // ── Core Ops ──
  { name: 'pipeline-digest', description: 'Morning Discord digest — posts yesterday pipeline stats at 7 AM ($0/run)', group: 'core', special_handler: 'morning_digest' },

  // ── Tier 1: Social Publishing ──
  { name: 'jake-twitter-poster', description: 'Posts Jake-voice tweet threads from approved content pieces via Twitter API v2 ($0/run)', group: 'jake-marketing', special_handler: 'twitter_poster' },
  { name: 'linkedin-direct-poster', description: 'Posts Jake-voice LinkedIn long-form posts and articles via LinkedIn API v2 ($0/run)', group: 'jake-marketing', special_handler: 'linkedin_poster' },
  { name: 'sms-follow-up', description: 'Sends 1-2 sentence SMS via Twilio to enriched leads with phone after 10+ days no reply ($0.0075/sms)', group: 'jake-marketing' },

  // ── Tier 2: New Signal Sources ──
  { name: 'jake-permit-scanner', description: 'Scrapes county building permit portals for recently issued $250K+ commercial permits — GC lead source ($0/run)', group: 'jake-marketing', special_handler: 'jake_permit_scanner' },
  { name: 'jake-hiring-signal-agent', description: 'Monitors Indeed/LinkedIn Jobs for construction companies posting CFO/Controller/AP roles — high-intent leads', group: 'jake-marketing', special_handler: 'hiring_signal_agent' },
  { name: 'hoa-special-assessment-monitor', description: 'Scans FL Division of Condominiums filings, SIRS/SB4D reserve studies for HOA capital project signals', group: 'hoa-marketing', special_handler: 'hoa_assessment_monitor' },

  // ── Tier 3: Close Loops ──
  { name: 'jake-crm-sync', description: 'Pushes replied/meeting_booked/pilot leads to Google Sheets or CSV ($0/run)', group: 'jake-marketing', special_handler: 'jake_crm_sync' },
  { name: 'content-repurposer', description: 'Takes one approved blog/LinkedIn post and generates 5 derivative pieces (tweet thread, short LinkedIn, email snippet, FB, YouTube outline)', group: 'jake-marketing' },
  { name: 'jake-case-study-builder', description: 'Writes sanitized case studies from pilot leads — populates pilot_proof content pillar', group: 'jake-marketing' },

  // ── Tier 4: Creative Intel ──
  { name: 'competitor-intel', description: 'Scrapes Procore/Sage/Vista forums for finance complaints. Output: cfo_leads rows with source=competitor_intel. Scorecard: leads found, conversion to contacted.', group: 'jake-marketing' },
  { name: 'jake-pain-signal-monitor', description: 'Scrapes public records (liens, judgments, BBB) for GC financial stress — auto-creates leads and boosts urgency. Scorecard: signals found, leads created, urgency boosts.', group: 'jake-marketing', special_handler: 'pain_signal_monitor' },
  { name: 'bid-result-scraper', description: 'Scrapes FL/TX procurement portals for recently awarded $500K+ construction contracts — GC lead source ($0/run)', group: 'jake-marketing', special_handler: 'jake_bid_scraper' },

  // ── Owen CFO Marketing (7) — Property Management powerhouse ──
  { name: 'owen-pm-discovery', description: 'Google Maps PM company scraper — discovers property management companies across 25 target markets. $0/run.', group: 'owen-marketing', special_handler: 'owen_pm_discovery' },
  { name: 'owen-content-engine', description: 'Owen-voice content — trust accounting, CAM recon, reserve studies for PM CFO audience. Self-evaluating.', group: 'owen-marketing' },
  { name: 'owen-outreach-agent', description: 'Personalized cold emails to PM companies — trust accounting, CAM recon, owner distribution pain. Self-evaluating.', group: 'owen-marketing' },
  { name: 'owen-lead-scout', description: 'Discovers property management companies (500–5,000 units) across target markets via web search', group: 'owen-marketing', special_handler: 'jake_lead_scout' },
  { name: 'owen-social-scheduler', description: 'Formats Owen content for LinkedIn, Twitter, Facebook — PM CFO voice', group: 'owen-marketing' },
  { name: 'owen-analytics-monitor', description: 'Owen pipeline health — leads, outreach, content, costs', group: 'owen-marketing' },
  { name: 'owen-contact-enricher', description: 'Enriches Owen PM leads with CFO/controller contacts — CAM license lookup, PM directories, LinkedIn. $0/run.', group: 'owen-marketing', special_handler: 'jake_contact_enricher' },

  // ── Data Rehab (5) — Foot-in-door data cleaning → Jake/Owen upsell ──
  { name: 'data-rehab-discovery', description: 'Cross-sell mining — finds existing leads with data chaos signals for Data Rehab pitch. $0/run.', group: 'data-rehab', special_handler: 'data_rehab_discovery' },
  { name: 'data-rehab-outreach', description: 'Cold outreach for Data Rehab — low-risk data audit offer, bridges to Jake/Owen upsell. Self-evaluating.', group: 'data-rehab' },
  { name: 'data-rehab-content', description: 'Content for Data Rehab — GIGO messaging, hidden cost of messy data, AI-readiness education. Self-evaluating.', group: 'data-rehab' },
  { name: 'data-rehab-scout', description: 'Finds SMBs with data chaos signals — QB+Excel mix, hiring accountants, ERP migration issues. Self-evaluating.', group: 'data-rehab' },
  { name: 'data-rehab-scorer', description: 'Scores leads on data-readiness: ERP age, employee count, manual processes, failed migrations. $0/run.', group: 'data-rehab', special_handler: 'data_rehab_discovery' },

  // Data Rehab — Reply Classifier
  { name: 'data-rehab-reply-classifier', description: 'Classify inbound email replies to Data Rehab outreach (INTERESTED, NOT_NOW, WRONG_PERSON, etc.)', group: 'data-rehab', special_handler: 'data_rehab_reply_classifier' },

  // Data Rehab — Follow-Up
  { name: 'data-rehab-follow-up', description: 'Generate personalized follow-up emails for Data Rehab leads with no reply after 5+ days. Multi-touch cadence.', group: 'data-rehab', special_handler: 'data_rehab_follow_up' },

  // Data Rehab — Analytics Monitor
  { name: 'data-rehab-analytics', description: 'Daily Data Rehab pipeline health — leads, outreach stats, reply breakdown, conversion rates. Posts summary to Discord.', group: 'data-rehab', special_handler: 'data_rehab_analytics' },

  // Data Rehab — Meeting Booker
  { name: 'data-rehab-meeting-booker', description: 'Draft Autopsy kickoff scheduling emails for INTERESTED Data Rehab replies. Requires manual confirmation before send.', group: 'data-rehab', special_handler: 'data_rehab_meeting_booker' },

  // Data Rehab — Contact Enricher
  { name: 'data-rehab-enricher', description: 'Find contact emails and phone numbers for Data Rehab leads using web search and pattern matching.', group: 'data-rehab', special_handler: 'data_rehab_enricher' },

  // ── ClawOps 2.0 Upgrades ──
  { name: 'urgency-scorer', description: 'Scores all leads 0-100 across Fit/Pain/Timeliness/Enrichment. Dual-product (Jake + HOA). $0/run — no LLM.', group: 'jake-marketing', special_handler: 'urgency_scorer' },
  { name: 'lead-dossier-generator', description: 'Assembles a personalized Markdown dossier per lead: pain narrative, brain episode proof, KB winning angles, CTA. Dual-product (Jake + HOA). $0/run.', group: 'jake-marketing', special_handler: 'lead_dossier_generator' },
  { name: 'pipeline-state-tracker', description: 'Computes pipeline_stage for all active leads (New→Enriched→Dossiered→Outreached→Replied→…). Flags stalled. $0/run.', group: 'jake-marketing', special_handler: 'pipeline_state_tracker' },
  { name: 'pipeline-director', description: 'Claw Director — reads next_action queue and dispatches enrich/dossier/outreach/follow-up actions for ready leads. Runs 6:30 AM M-F.', group: 'jake-marketing', special_handler: 'pipeline_director' },
  { name: 'tenacity-cadence-engine', description: 'Adaptive multi-touch persistence (12 touches, 3 channels). Queues cadence touches for Jake + HOA leads. Brain v2 adjusts timing/tone from winning episodes. $0/run.', group: 'jake-marketing', special_handler: 'tenacity_cadence' },

  // ── Opportunity Engine ──
  { name: 'opportunity-scanner', description: 'Scans 10 free internet sources (Reddit, HN, PH, GitHub, etc.) for pain signals, classifies via Ollama ($0), clusters semantically. Daily 3 AM.', group: 'opportunity-engine', special_handler: 'opportunity_scanner' },
  { name: 'opportunity-scorer', description: 'Scores opportunity clusters (signal_count >= 3) using ICE+RPS+ALS via GPT-4o. ~$0.01/cluster. Daily 4 AM.', group: 'opportunity-engine', special_handler: 'opportunity_scorer' },
  { name: 'software-factory', description: 'Takes top-scored opportunities (score >= 75) and scaffolds prototypes from 5 templates (SaaS, CLI, landing page, API wrapper, Chrome ext). Phase 3.', group: 'opportunity-engine', special_handler: 'software_factory' },
  { name: 'traction-monitor', description: 'Tracks deployed prototype metrics daily (page views, signups, stars, revenue). 14-day kill gate. Phase 3.', group: 'opportunity-engine', special_handler: 'traction_monitor' },
  { name: 'prototype-deployer', description: 'Deploys scaffolded prototypes to GitHub + Vercel with Stripe payment. Lane 2.', group: 'opportunity-engine', special_handler: 'prototype_deployer' },

  // ── Revenue Intelligence ──
  { name: 'revenue-radar', description: 'Cross-lane revenue intelligence scanner — surfaces top Money Moves across Trading, SaaS, Service, and Pipeline lanes. Daily.', group: 'core', special_handler: 'revenue_radar' },

  // ── Google Maps Discovery (shared, any vertical) ──
  { name: 'google-maps-discovery', description: 'Shared Google Maps lead scraper — supports construction, HOA, PM, or custom verticals. $0/run.', group: 'core', special_handler: 'google_maps_discovery' },

  // ── Signal Performance ──
  { name: 'signal-performance-rollup', description: 'Nightly 30-day rolling conversion rates by signal source. Feeds back into agent context. $0/run.', group: 'core', special_handler: 'signal_performance' },

  // ── Dream Team Nightly ──
  { name: 'dream-team-nightly', description: 'Nightly cycle — deterministic scorecards (Operations/Pipeline/Outreach), system diagnostics, Todd overnight actions, morning report. $0/night.', group: 'core', special_handler: 'dream_team_nightly' },

  // ── Outreach Delivery ──
  { name: 'outreach-sender', description: 'Sends approved outreach emails via SendGrid. Daily 10 AM. Urgency-ranked. Tracks delivery. $0/run.', group: 'core', special_handler: 'outreach_sender' },
  { name: 'database-backup', description: 'Daily SQLite backup with 7-day retention. $0/run.', group: 'core', special_handler: 'database_backup' },
  { name: 'weekly-portfolio-review', description: 'Friday 5 PM — scores all agents, posts scorecard to Discord. $0/run.', group: 'core', special_handler: 'weekly_portfolio_review' },
  { name: 'ralph-qa', description: 'Reviews pending outreach drafts + content pieces. Deterministic scoring. $0/run.', group: 'core', special_handler: 'ralph_qa' },

  // ── Idle Training ──
  { name: 'idle-trainer', description: 'Self-training system — agents study YouTube videos when idle + system has spare capacity. Grows skills, levels up, posts funny quips. $0/run.', group: 'core', special_handler: 'idle_training' },

  // ── Marketing Intelligence ──
  { name: 'db-health-monitor', description: 'Daily database integrity: missing tables, broken columns, orphaned records, stale data, anomalies. $0/run.', group: 'core', special_handler: 'db_health_monitor' },
  { name: 'ralph-code-reviewer', description: 'Static code analysis: SQL injection, schema mismatches, missing error handling, hardcoded secrets. Reviews git diff or specific files. $0/run.', group: 'core', special_handler: 'ralph_code_review' },
  { name: 'marketing-learner', description: 'Weekly self-recursive learning cycle: scores content, extracts patterns, generates writer briefings, extends content calendar. $0/run.', group: 'core', special_handler: 'marketing_learner' },
  { name: 'welcome-sequence', description: 'Processes welcome email sequence for new newsletter subscribers. Sends next step to subscribers who are due. $0/run (SendGrid).', group: 'core', special_handler: 'welcome_sequence' },

  // ── Revenue Signal Engine (7) ──
  { name: 'rse-channel-monitor', description: 'Checks YouTube RSS feeds for new videos from curated creators. $0/run.', group: 'revenue-signal', special_handler: 'rse_channel_monitor' },
  { name: 'rse-transcript-extractor', description: 'Pulls transcripts via yt-dlp for pending videos. $0/run.', group: 'revenue-signal', special_handler: 'rse_transcript_extractor' },
  { name: 'rse-signal-scorer', description: 'Scores transcripts via Ollama — truth density, implementation depth, monetization relevance. Rejects fluff. $0/run.', group: 'revenue-signal', special_handler: 'rse_signal_scorer' },
  { name: 'rse-build-spec-generator', description: 'Turns accepted signals into actionable build specs with revenue models. ~$0.03/run (GPT-4o).', group: 'revenue-signal' },
  { name: 'rse-campaign-builder', description: 'Creates marketing campaigns from signals/specs — feeds into Jake/CFO pipeline. ~$0.03/run (GPT-4o).', group: 'revenue-signal' },
  { name: 'rse-expert-librarian', description: 'Extracts proven patterns from high-scoring signals into expert library. $0/run.', group: 'revenue-signal', special_handler: 'rse_expert_librarian' },
  { name: 'rse-code-builder', description: 'Builds working prototypes from approved build specs via Charlie/DeepSeek. $0 Ollama, ~$0.10 GPT-4o fallback.', group: 'revenue-signal', special_handler: 'rse_code_builder' },
  { name: 'rse-feedback-loop', description: 'Updates source trust scores, prunes fluff creators, tracks campaign outcomes. $0/run.', group: 'revenue-signal', special_handler: 'rse_feedback_loop' },

  // ── DC Site Intel (4) ──
  { name: 'dc-intel-deal-monitor', description: 'Daily 7am — scans target markets for DC/warehouse land signals: rezoning, permits, substation upgrades, competitor activity, owner distress. Posts intel notes to DC Site Intel. $0/run (Brave Search).', group: 'dc-intel', special_handler: 'dc_intel_deal_monitor' },
  { name: 'dc-intel-owner-research', description: 'On-demand — deep-researches a single land owner: SOS filings, litigation, news, distress signals. Posts findings to DC Site Intel owner-intel endpoint. $0/run.', group: 'dc-intel', special_handler: 'dc_intel_owner_research' },
  { name: 'dc-intel-research-queue', description: 'Weekly Mon 6am — polls all unresearched owners from DC Site Intel, runs dc-intel-owner-research on each. Batch enrichment pass. $0/run.', group: 'dc-intel', special_handler: 'dc_intel_research_queue' },
  { name: 'dc-intel-opportunity-scout', description: 'Daily 5am — hunts NEW land opportunities not yet in DC Site Intel: county transfers, rezoning filings, DC-related land acquisitions. Creates stub opportunities for promising finds. $0/run.', group: 'dc-intel', special_handler: 'dc_intel_opportunity_scout' },
  { name: 'dc-intel-daily-scorecard', description: 'Daily 8am — fetches morning lead scorecard from DC Site Intel, scores each new lead A/B/C/D, emails ranked HTML report to Steve + Doug via SendGrid. $0/run.', group: 'dc-intel', special_handler: 'dc_intel_daily_scorecard' },
  { name: 'dc-intel-learning-loop', description: 'Weekly Sunday 10pm — analyzes this week\'s validated/dismissed outcomes, uses Ollama to find patterns, updates market heat weights in DC Site Intel scoring engine. $0/run (local LLM).', group: 'dc-intel', special_handler: 'dc_intel_learning_loop' },
  { name: 'dc-intel-auto-generate', description: 'Weekly Tue 6am — sweeps DC Site Intel scored parcel DB for top-scored parcels (≥0.65) not yet in pipeline. Creates opportunity stubs with real APNs + power/zoning data, then triggers Apollo + skip-trace on each new owner. $0/run (DB-native, no search).', group: 'dc-intel', special_handler: 'dc_intel_auto_generate' },
  { name: 'dc-intel-rto-scanner', description: 'Mon/Wed/Fri 5:30am — polls PJM/MISO power interconnect queue for new large-MW filings (≥50MW) in target markets. A new 100MW+ request signals active hyperscaler site selection weeks before news coverage. $0/run (DB-native).', group: 'dc-intel', special_handler: 'dc_intel_rto_scanner' },
  { name: 'dc-intel-planning-scanner', description: 'Daily 5:15am — polls county planning event DB (Cook/DuPage/Will/Loudoun/Prince William) for new rezonings, permits, and variances. Primary-source government data — day-1 filings before any news article. $0/run (DB-native).', group: 'dc-intel', special_handler: 'dc_intel_planning_scanner' },
  { name: 'dc-intel-distress-scanner', description: 'Weekly Wed 6:30am — cross-references tax-delinquent + estate + stale-tenure owners with skip-trace phone results. Generates prioritized "call today" intel notes for every distressed owner with a phone on file. $0/run (DB-native).', group: 'dc-intel', special_handler: 'dc_intel_distress_scanner' },
  { name: 'dc-intel-meta-reviewer', description: 'Daily 9am — master AI reviewer. Scores every OpenClaw intel note from the past 24h on relevance, specificity, and actionability (0–10 via Ollama). Validated notes (≥7) post outcome signals; dismissed notes (<4) feed into the learning loop. The quality layer that makes all other agents improve. $0/run (local Ollama).', group: 'dc-intel', special_handler: 'dc_intel_meta_reviewer' },
];

async function main() {
  // Load environment
  const envPath = path.resolve(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  }

  // Initialize database
  const { initDatabase, get, run: dbRun } = require('../server/db/connection');
  await initDatabase();

  const workspaceRoot = path.resolve(__dirname, '..', 'openclaw-skills');
  let created = 0;
  let skipped = 0;

  for (const agent of AGENT_FLEET) {
    // Check if agent already exists by name
    const existing = get('SELECT id FROM agents WHERE name = ?', [agent.name]);
    if (existing) {
      skipped++;
      continue;
    }

    // Build config with openclaw_id pointing to the OpenClaw registration
    const config = {
      openclaw_id: agent.name, // OpenClaw agent ID matches the name
      openclaw_workspace: path.join(workspaceRoot, agent.name),
    };
    if (agent.special_handler) {
      config.special_handler = agent.special_handler;
    }

    // Read SOUL.md if it exists
    const soulPath = path.join(workspaceRoot, agent.name, 'SOUL.md');
    let instructions = '';
    if (fs.existsSync(soulPath)) {
      instructions = fs.readFileSync(soulPath, 'utf-8');
    }

    // Generate a stable UUID from the agent name (deterministic)
    const id = require('crypto').createHash('md5').update(agent.name).digest('hex');
    const uuid = `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20,32)}`;

    dbRun(
      `INSERT OR IGNORE INTO agents (id, name, description, config, instructions, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuid, agent.name, agent.description, JSON.stringify(config), instructions, 'idle']
    );
    created++;
    console.log(`  + ${agent.name} (${agent.group})`);
  }

  console.log(`\nDone: ${created} created, ${skipped} already existed, ${AGENT_FLEET.length} total`);

  // Verify
  const count = get('SELECT COUNT(*) as n FROM agents');
  console.log(`Database now has ${count.n} agents`);
}

main().catch(err => { console.error(err); process.exit(1); });
