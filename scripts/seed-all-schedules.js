/**
 * @file seed-all-schedules.js
 * @description Seeds ALL marketing schedules for every product line:
 *   - Jake CFO (construction finance)
 *   - Owen CFO (property management finance)
 *   - Data Rehab (foot-in-door data cleaning)
 *   - HOA Project Funding
 *   - Core ops (debrief, digest, pipeline)
 *
 * Run: node scripts/seed-all-schedules.js
 * Safe to re-run — skips existing schedules by name + agent_id.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { get, run, initDatabase } = require('../server/db/connection');
const { v4: uuidv4 } = require('uuid');

const SCHEDULES = [

  // ═══════════════════════════════════════════════════════════════
  // CORE OPS
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'Morning Digest — 7 AM Daily',
    description: 'Posts yesterday pipeline stats to Discord. $0/run.',
    agent_name: 'pipeline-digest',
    cron: '0 7 * * 1-5',
    message: '{}',
  },
  {
    name: 'Daily Debrief — 6 PM Weekdays',
    description: 'End-of-day war room report — all agent activity, leads, costs, next steps.',
    agent_name: 'daily-debrief',
    cron: '0 18 * * 1-5',
    message: '{}',
  },
  {
    name: 'Pipeline State Tracker — Daily 1 AM',
    description: 'Recomputes pipeline_stage for every active lead. Flags stalled. $0/run.',
    agent_name: 'pipeline-state-tracker',
    cron: '0 1 * * *',
    message: '{"product":"both"}',
  },
  {
    name: 'Pipeline Director — Weekdays 6:30 AM',
    description: 'Dispatches next actions for all ready leads across Jake + HOA.',
    agent_name: 'pipeline-director',
    cron: '30 6 * * 1-5',
    message: '{}',
  },
  {
    name: 'Urgency Scorer — Monday 6 AM',
    description: 'Scores all leads 0-100. Dual-product. $0/run.',
    agent_name: 'urgency-scorer',
    cron: '0 6 * * 1',
    message: '{"limit":500,"product":"both"}',
  },
  {
    name: 'Tenacity Cadence Engine — Mon/Wed/Fri 9 AM',
    description: 'Adaptive multi-touch cadence for Jake + HOA leads.',
    agent_name: 'tenacity-cadence-engine',
    cron: '0 9 * * 1,3,5',
    message: '{"product":"both"}',
  },
  {
    name: 'Brain Distillation — Nightly 2 AM',
    description: 'Promotes high-score episodes into knowledge base. $0/run.',
    agent_name: 'daily-debrief',   // piggyback until brain agent is separate
    cron: '0 2 * * *',
    message: '{"mode":"distillation_only"}',
  },
  {
    name: 'Outreach Sender — Daily 10 AM',
    description: 'Sends all approved outreach emails via SendGrid. Urgency-ranked. $0/run.',
    agent_name: 'outreach-sender',
    cron: '0 10 * * 1-5',
    message: '{"limit":50,"product":"both"}',
  },
  {
    name: 'Ralph QA — Daily 9:30 AM',
    description: 'Reviews pending outreach drafts before sender fires at 10 AM. $0/run.',
    agent_name: 'ralph-qa',
    cron: '30 9 * * 1-5',
    message: '{"mode":"both","limit":30}',
  },
  {
    name: 'Database Backup — Daily 3 AM',
    description: 'SQLite backup with 7-day retention. $0/run.',
    agent_name: 'database-backup',
    cron: '0 3 * * *',
    message: '{}',
  },
  {
    name: 'Weekly Portfolio Review — Friday 5 PM',
    description: 'Scores all active agents, posts scorecard to Discord. $0/run.',
    agent_name: 'weekly-portfolio-review',
    cron: '0 17 * * 5',
    message: '{}',
  },

  // ═══════════════════════════════════════════════════════════════
  // JAKE CFO — Construction Finance
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'Jake — Construction Discovery — Mon/Thu 6 AM',
    description: 'Google Maps GC scraper. 50-150 companies per run. $0/run.',
    agent_name: 'jake-construction-discovery',
    cron: '0 6 * * 1,4',
    message: '{"limit":100}',
  },
  {
    name: 'Jake — Contact Enricher — Weekdays 8:30 AM',
    description: 'Playwright scraper finds emails for pending leads. $0/run.',
    agent_name: 'jake-contact-enricher',
    cron: '30 8 * * 1-5',
    message: '{"limit":25,"min_score":0,"status_filter":"pending"}',
  },
  {
    name: 'Jake — Lead Scout — Mon 7 AM',
    description: 'LLM national lead scout — rotates through 60 US markets.',
    agent_name: 'jake-lead-scout',
    cron: '0 7 * * 1',
    message: '{}',
  },
  {
    name: 'Jake — Content Engine — Mon 8 AM',
    description: 'Writes LinkedIn posts, blog articles, email sequences in Jake voice.',
    agent_name: 'jake-content-engine',
    cron: '0 8 * * 1',
    message: '{"output_count":3}',
  },
  {
    name: 'Jake — Outreach Agent — Tue/Thu 10 AM',
    description: 'Personalized cold emails to enriched construction SMB leads.',
    agent_name: 'jake-outreach-agent',
    cron: '0 10 * * 2,4',
    message: '{"limit":10}',
  },
  {
    name: 'Jake — Follow-Up — Wed/Fri 9 AM',
    description: 'Generates follow-ups for leads contacted 5+ days ago with no reply.',
    agent_name: 'jake-follow-up-agent',
    cron: '0 9 * * 3,5',
    message: '{"limit":10}',
  },
  {
    name: 'Jake — Analytics Monitor — Daily 7:30 AM',
    description: 'Pipeline health dashboard — leads, outreach, content, costs.',
    agent_name: 'jake-analytics-monitor',
    cron: '30 7 * * 1-5',
    message: '{}',
  },
  {
    name: 'Jake — Social Scheduler — Tue 9 AM',
    description: 'Formats and queues Jake content for social platforms.',
    agent_name: 'jake-social-scheduler',
    cron: '0 9 * * 2',
    message: '{}',
  },
  {
    name: 'Jake — CRM Sync — Daily 11 PM',
    description: 'Pushes replied/meeting_booked leads to Google Sheets. $0/run.',
    agent_name: 'jake-crm-sync',
    cron: '0 23 * * *',
    message: '{}',
  },
  {
    name: 'Jake — Hiring Signal Agent — Mon 7:30 AM',
    description: 'Monitors job boards for construction companies hiring finance roles.',
    agent_name: 'jake-hiring-signal-agent',
    cron: '30 7 * * 1',
    message: '{"limit":20}',
  },
  {
    name: 'Jake — Permit Scanner — Wed 6 AM',
    description: 'Scrapes county permit portals for $250K+ commercial permits.',
    agent_name: 'jake-permit-scanner',
    cron: '0 6 * * 3',
    message: '{"limit":100}',
  },
  {
    name: 'Jake — Pain Signal Monitor — Fri 8 AM',
    description: 'Scans public records for construction company financial stress.',
    agent_name: 'jake-pain-signal-monitor',
    cron: '0 8 * * 5',
    message: '{}',
  },
  {
    name: 'Jake — Bid Result Scraper — Tue 6 AM',
    description: 'FL/TX procurement portals for awarded contracts.',
    agent_name: 'bid-result-scraper',
    cron: '0 6 * * 2',
    message: '{"states":["FL","TX"],"limit":50}',
  },
  {
    name: 'Jake — Content Repurposer — Thu 2 PM',
    description: 'Takes top approved post → 5 derivative pieces (tweet, LinkedIn short, email, FB, YouTube).',
    agent_name: 'content-repurposer',
    cron: '0 14 * * 4',
    message: '{"limit":2}',
  },
  {
    name: 'Jake — LinkedIn Poster — Wed 11 AM',
    description: 'Posts approved Jake content to LinkedIn.',
    agent_name: 'linkedin-direct-poster',
    cron: '0 11 * * 3',
    message: '{}',
  },
  {
    name: 'Jake — Twitter Poster — Tue/Thu 11 AM',
    description: 'Posts Jake tweet threads from approved content.',
    agent_name: 'jake-twitter-poster',
    cron: '0 11 * * 2,4',
    message: '{}',
  },
  {
    name: 'Jake — Competitor Intel — Fri 9 AM',
    description: 'Monitors Procore/Sage/QB forums for high-intent complaints.',
    agent_name: 'competitor-intel',
    cron: '0 9 * * 5',
    message: '{}',
  },

  // ═══════════════════════════════════════════════════════════════
  // OWEN CFO — Property Management Finance (FROZEN — reactivate when PM product launches)
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'Owen — Lead Scout — Tue 7 AM',
    description: 'Finds PM companies (500-5K units) across FL/TX/AZ/CA/NV/CO.',
    agent_name: 'owen-lead-scout',
    cron: '0 7 * * 2',
    message: '{"trade":"PM","region":"Florida","limit":8}',
    enabled: false,
  },
  {
    name: 'Owen — Content Engine — Tue 8 AM',
    description: 'Owen-voice content — trust accounting pain, CAM recon, owner distribution chaos.',
    agent_name: 'owen-content-engine',
    cron: '0 8 * * 2',
    message: '{"output_count":3}',
    enabled: false,
  },
  {
    name: 'Owen — Outreach Agent — Wed/Fri 10 AM',
    description: 'Personalized cold emails to PM CFOs/controllers.',
    agent_name: 'owen-outreach-agent',
    cron: '0 10 * * 3,5',
    message: '{"limit":10,"source_agent":"owen"}',
    enabled: false,
  },
  {
    name: 'Owen — Social Scheduler — Wed 9 AM',
    description: 'Formats Owen content for LinkedIn, Twitter, Facebook.',
    agent_name: 'owen-social-scheduler',
    cron: '0 9 * * 3',
    message: '{}',
    enabled: false,
  },
  {
    name: 'Owen — Analytics Monitor — Daily 7:45 AM',
    description: 'Owen pipeline health — leads, outreach, content, reply rates.',
    agent_name: 'owen-analytics-monitor',
    cron: '45 7 * * 1-5',
    message: '{}',
    enabled: false,
  },

  // ═══════════════════════════════════════════════════════════════
  // DATA REHAB — Foot-in-Door Data Cleaning (FROZEN — reactivate when data audit product launches)
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'Data Rehab — Scout — Mon/Wed 8 AM',
    description: 'Finds SMBs with data chaos signals: QB+Excel mix, ERP migrations, hiring accountants.',
    agent_name: 'data-rehab-scout',
    cron: '0 8 * * 1,3',
    message: '{"limit":10}',
    enabled: false,
  },
  {
    name: 'Data Rehab — Outreach — Tue/Thu 11 AM',
    description: 'Low-risk data audit cold email offer. Bridges to Jake/Owen upsell.',
    agent_name: 'data-rehab-outreach',
    cron: '0 11 * * 2,4',
    message: '{"limit":10}',
    enabled: false,
  },
  {
    name: 'Data Rehab — Content Engine — Wed 8 AM',
    description: 'GIGO content, hidden cost of messy data, AI-readiness education.',
    agent_name: 'data-rehab-content',
    cron: '0 8 * * 3',
    message: '{"output_count":2}',
    enabled: false,
  },

  // ═══════════════════════════════════════════════════════════════
  // HOA PROJECT FUNDING
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'HOA — Discovery — Mon/Thu 7 AM',
    description: 'Google Maps HOA scraper across 19 geo-targets.',
    agent_name: 'hoa-discovery',
    cron: '0 7 * * 1,4',
    message: '{"limit":3}',
  },
  {
    name: 'HOA — Contact Enricher — Weekdays 9 AM',
    description: 'Enriches HOA contacts with email, phone, LinkedIn.',
    agent_name: 'hoa-contact-enricher',
    cron: '0 9 * * 1-5',
    message: '{"limit":15}',
  },
  {
    name: 'HOA — Outreach Drafter — Tue/Thu 2 PM',
    description: 'Drafts personalized outreach for enriched HOA contacts.',
    agent_name: 'hoa-outreach-drafter',
    cron: '0 14 * * 2,4',
    message: '{"limit":10}',
  },
  {
    name: 'HOA — Content Writer — Mon 8 AM',
    description: 'SEO blog post for hoaprojectfunding.com.',
    agent_name: 'hoa-content-writer',
    cron: '0 8 * * 1',
    message: '{}',
  },
  {
    name: 'HOA — CMS Publisher — Mon 8:30 AM',
    description: 'Publishes approved blog to GitHub → Netlify.',
    agent_name: 'hoa-cms-publisher',
    cron: '30 8 * * 1',
    message: '{}',
  },
  {
    name: 'HOA — Facebook Poster — Daily 10 AM',
    description: 'Posts content to HOA Project Funding Facebook page.',
    agent_name: 'hoa-facebook-poster',
    cron: '0 10 * * *',
    message: '{}',
  },
  {
    name: 'HOA — Social Media — Tue 9 AM',
    description: 'Converts blog posts to Facebook group + LinkedIn content.',
    agent_name: 'hoa-social-media',
    cron: '0 9 * * 2',
    message: '{}',
  },
  {
    name: 'HOA — Minutes Monitor — Wed 8 AM',
    description: 'Scans HOA board minutes for reserve/special assessment signals.',
    agent_name: 'hoa-minutes-monitor',
    cron: '0 8 * * 3',
    message: '{"limit":20}',
  },
  {
    name: 'HOA — Google Reviews Monitor — Fri 8 AM',
    description: 'Tracks review changes for management companies.',
    agent_name: 'google-reviews-monitor',
    cron: '0 8 * * 5',
    message: '{"limit":10}',
  },

  // ═══════════════════════════════════════════════════════════════
  // OPPORTUNITY ENGINE
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'Opportunity Scanner — Daily 3 AM',
    description: 'Scans Reddit, HN, PH for pain signals. Classifies via Ollama ($0). Clusters semantically.',
    agent_name: 'opportunity-scanner',
    cron: '0 3 * * *',
    message: '{}',
  },
  {
    name: 'Opportunity Scorer — Daily 4 AM',
    description: 'Scores clusters with 3+ signals using ICE+RPS+ALS. GPT-4o ~$0.01/cluster.',
    agent_name: 'opportunity-scorer',
    cron: '0 4 * * *',
    message: '{"limit":10}',
  },
  {
    name: 'Software Factory — Daily 4:30 AM',
    description: 'Builds prototypes from top-scored clusters (score >= 75). DeepSeek $0, GPT-4o ~$0.10 fallback.',
    agent_name: 'software-factory',
    cron: '30 4 * * *',
    message: '{}',
  },
  {
    name: 'Traction Monitor — Daily 11 PM',
    description: 'Checks deployed prototype metrics. 14-day kill gate. Revenue alerts. $0/run.',
    agent_name: 'traction-monitor',
    cron: '0 23 * * *',
    message: '{}',
  },

  // ═══════════════════════════════════════════════════════════════
  // REVENUE SIGNAL ENGINE
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'RSE — Channel Monitor — Daily 5 AM',
    description: 'Checks YouTube RSS feeds for new videos from curated creators. $0/run.',
    agent_name: 'rse-channel-monitor',
    cron: '0 5 * * *',
    message: '{}',
  },
  {
    name: 'RSE — Transcript Extractor — Daily 5:30 AM',
    description: 'Pulls transcripts via yt-dlp for pending videos. $0/run.',
    agent_name: 'rse-transcript-extractor',
    cron: '30 5 * * *',
    message: '{"limit":15}',
  },
  {
    name: 'RSE — Signal Scorer — Daily 6 AM',
    description: 'Scores transcripts via Ollama. Rejects fluff aggressively. $0/run.',
    agent_name: 'rse-signal-scorer',
    cron: '0 6 * * *',
    message: '{"limit":10}',
  },
  {
    name: 'RSE — Build Spec Generator — Weekdays 7 AM',
    description: 'Generates build specs from accepted signals. ~$0.03/run.',
    agent_name: 'rse-build-spec-generator',
    cron: '0 7 * * 1-5',
    message: '{"limit":3}',
  },
  {
    name: 'RSE — Idea Evaluator — Weekdays 7:30 AM',
    description: 'Evaluates accepted signals into ranked business opportunities. Scores build effort, revenue potential, stack fit. ~$0.01/run.',
    agent_name: 'rse-code-builder',
    cron: '30 7 * * 1-5',
    message: '{"action":"evaluate","limit":10}',
  },
  {
    name: 'RSE — Campaign Builder — Tue/Thu 8 AM',
    description: 'Creates campaigns from signals + specs. Feeds Jake/CFO pipeline. ~$0.03/run.',
    agent_name: 'rse-campaign-builder',
    cron: '0 8 * * 2,4',
    message: '{"limit":3}',
  },
  {
    name: 'Dream Team — Nightly Cycle — 11 PM',
    description: 'Full Dream Team cycle: data collection, scorecards, self-assessment, Ralph QA, Todd actions. ~$0.07/night.',
    agent_name: 'dream-team-nightly',
    cron: '0 23 * * *',
    message: '{}',
  },
  {
    name: 'Dream Team — Morning Report — 6:30 AM',
    description: 'Todd assembles overnight accountability report → Discord. ~$0.006.',
    agent_name: 'dream-team-nightly',
    cron: '30 6 * * *',
    message: '{"phase":"report"}',
  },
  {
    name: 'RSE — Expert Librarian — Daily 2 AM',
    description: 'Extracts proven patterns from high-scoring signals into expert library. $0/run.',
    agent_name: 'rse-expert-librarian',
    cron: '0 2 * * *',
    message: '{"limit":10,"min_score":4.0}',
  },
  {
    name: 'RSE — Feedback Loop — Sunday 3 AM',
    description: 'Updates source trust scores, prunes fluff creators, tracks outcomes. $0/run.',
    agent_name: 'rse-feedback-loop',
    cron: '0 3 * * 0',
    message: '{}',
  },

  // ═══════════════════════════════════════════════════════════════
  // OWEN CFO — Property Management Pipeline
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'Owen — PM Discovery — Tue/Fri 6 AM',
    description: 'Google Maps PM company scraper across 25 target markets. $0/run.',
    agent_name: 'owen-pm-discovery',
    cron: '0 6 * * 2,5',
    message: '{"limit": 100}',
  },
  {
    name: 'Owen — Contact Enricher — Weekdays 9 AM',
    description: 'Enriches Owen PM leads with CFO/controller contacts. $0/run.',
    agent_name: 'owen-contact-enricher',
    cron: '0 9 * * 1-5',
    message: '{"limit": 20, "status_filter": "pending", "source": "owen"}',
  },
  {
    name: 'Owen — Lead Scout — Tue 7 AM',
    description: 'Web search for PM companies 500-5000 units. LLM agent.',
    agent_name: 'owen-lead-scout',
    cron: '0 7 * * 2',
    message: '{"markets": ["Tampa, FL", "Miami, FL", "Phoenix, AZ", "Dallas, TX"]}',
  },
  {
    name: 'Owen — Content Engine — Tue 8 AM',
    description: 'Owen-voice PM content — trust accounting, reserves, owner comms. LLM agent.',
    agent_name: 'owen-content-engine',
    cron: '0 8 * * 2',
    message: '{"pillar": "trust_accounting", "channel": "linkedin"}',
  },
  {
    name: 'Owen — Outreach Agent — Wed/Fri 10 AM',
    description: 'Personalized PM cold emails with research. LLM agent.',
    agent_name: 'owen-outreach-agent',
    cron: '0 10 * * 3,5',
    message: '{"batch_size": 5, "tone": "peer-frustrated"}',
  },
  {
    name: 'Owen — Social Scheduler — Thu 9 AM',
    description: 'Formats approved Owen content for social channels. LLM agent.',
    agent_name: 'owen-social-scheduler',
    cron: '0 9 * * 4',
    message: '{}',
  },
  {
    name: 'Owen — Analytics Monitor — Daily 7:45 AM',
    description: 'Owen pipeline health — leads, outreach, content, costs.',
    agent_name: 'owen-analytics-monitor',
    cron: '45 7 * * 1-5',
    message: '{}',
  },

  // ═══════════════════════════════════════════════════════════════
  // DATA REHAB — Foot-in-Door Data Cleaning
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'Data Rehab — Cross-Sell Discovery — Mon 8 AM',
    description: 'Mines existing leads for data chaos signals. Tags for Data Rehab outreach. $0/run.',
    agent_name: 'data-rehab-discovery',
    cron: '0 8 * * 1',
    message: '{"limit": 30}',
  },
  {
    name: 'Data Rehab — Scout — Wed 8 AM',
    description: 'Finds new SMBs with data chaos signals via web search. LLM agent.',
    agent_name: 'data-rehab-scout',
    cron: '0 8 * * 3',
    message: '{"industries": ["construction", "property_management", "professional_services"]}',
  },
  {
    name: 'Data Rehab — Content — Thu 8 AM',
    description: 'GIGO messaging content — hidden cost of messy data, data audit education. LLM agent.',
    agent_name: 'data-rehab-content',
    cron: '0 8 * * 4',
    message: '{"pillar": "gigo", "channel": "linkedin"}',
  },
  {
    name: 'Data Rehab — Outreach — Tue/Thu 11 AM',
    description: 'Low-risk data audit offer outreach to tagged leads. LLM agent.',
    agent_name: 'data-rehab-outreach',
    cron: '0 11 * * 2,4',
    message: '{"batch_size": 5}',
  },

  // ═══════════════════════════════════════════════════════════════
  // SIGNAL MONITORS — Escalation handlers create/boost leads
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'Pain Signal Monitor — Wed/Fri 6 AM',
    description: 'Scans liens, judgments, BBB for GC financial stress signals. Auto-creates leads + boosts urgency.',
    agent_name: 'jake-pain-signal-monitor',
    cron: '0 6 * * 3,5',
    message: '{"scan": true}',
  },
  {
    name: 'Hiring Signal Agent — Tue/Thu 7 AM',
    description: 'Monitors job postings for CFO/Controller/AP roles — high-intent lead creation.',
    agent_name: 'jake-hiring-signal-agent',
    cron: '0 7 * * 2,4',
    message: '{"scan": true}',
  },
  {
    name: 'HOA Assessment Monitor — Mon/Thu 8 AM',
    description: 'Scans FL condo filings, SIRS/SB4D reserve studies for HOA capital project signals.',
    agent_name: 'hoa-special-assessment-monitor',
    cron: '0 8 * * 1,4',
    message: '{"scan": true}',
  },
  {
    name: 'Signal Performance Rollup — Nightly 1:30 AM',
    description: 'Computes 30-day conversion rates by signal source. Posts Discord summary. $0/run.',
    agent_name: 'signal-performance-rollup',
    cron: '30 1 * * *',
    message: '{}',
  },

  // ═══════════════════════════════════════════════════════════════
  // MARKETING INTELLIGENCE
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'DB Health Monitor — Daily 2:30 AM',
    description: 'Checks table existence, column integrity, orphaned records, stale data, data anomalies. $0/run.',
    agent_name: 'db-health-monitor',
    cron: '30 2 * * *',
    message: '{}',
  },
  {
    name: 'Marketing Learner — Sunday 11 PM',
    description: 'Self-recursive learning: scores content, extracts patterns, generates writer briefings, extends calendar. $0/run.',
    agent_name: 'marketing-learner',
    cron: '0 23 * * 0',
    message: '{}',
  },
  {
    name: 'Welcome Sequence — Every Hour',
    description: 'Sends next welcome email to newsletter subscribers who are due. $0/run (SendGrid).',
    agent_name: 'welcome-sequence',
    cron: '0 * * * *',
    message: '{}',
  },
];

async function main() {
  await initDatabase();

  // --clean flag: wipe all existing schedules before seeding (fixes duplicates from legacy seed scripts)
  if (process.argv.includes('--clean')) {
    const count = get('SELECT COUNT(*) AS c FROM schedules')?.c || 0;
    run('DELETE FROM schedules');
    console.log(`🧹 Cleaned ${count} existing schedules`);
  }

  let created = 0;
  let skipped = 0;
  let missing = 0;

  for (const s of SCHEDULES) {
    const agent = get('SELECT id, name FROM agents WHERE name = ?', [s.agent_name]);
    if (!agent) {
      console.log(`⚠️  Agent not found: ${s.agent_name} — run seed-all-agents.js first`);
      missing++;
      continue;
    }

    const existing = get('SELECT id FROM schedules WHERE name = ? AND agent_id = ?', [s.name, agent.id]);
    if (existing) {
      skipped++;
      continue;
    }

    const id = uuidv4();
    const enabled = s.enabled !== undefined ? (s.enabled ? 1 : 0) : 1;
    run(
      'INSERT INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, s.name, s.description, agent.id, agent.name, s.cron, s.message, enabled]
    );
    console.log(`${enabled ? '✅' : '⏸️ '} Created: ${s.name} → ${agent.name} [${s.cron}]${enabled ? '' : ' (DISABLED — frozen product)'}`);
    created++;
  }

  console.log(`\nDone. Created: ${created} | Skipped (existing): ${skipped} | Missing agents: ${missing}`);
  if (missing > 0) {
    console.log('Run: node scripts/seed-all-agents.js  (then re-run this script)');
  }
}

main().catch(console.error);
