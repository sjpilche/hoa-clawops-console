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
  { name: 'main', description: 'Natural language chat router — routes messages to the right agent', group: 'core' },
  { name: 'daily-debrief', description: 'End-of-day war room report — reviews all agent activity, trading, leads, costs', group: 'core', special_handler: 'daily_debrief' },

  // ── HOA Marketing (8) ──
  { name: 'hoa-content-writer', description: 'Blog posts for HOA Project Funding — 1,400-1,800 word SEO articles', group: 'hoa-marketing' },
  { name: 'hoa-cms-publisher', description: 'Publishes blog posts to GitHub → Netlify (deterministic, no LLM)', group: 'hoa-marketing', special_handler: 'github_publisher' },
  { name: 'hoa-social-media', description: 'Converts blog posts to Facebook page/group + LinkedIn content', group: 'hoa-marketing' },
  { name: 'hoa-social-engagement', description: 'Facebook group engagement — responds to comments, builds credibility', group: 'hoa-marketing' },
  { name: 'hoa-networker', description: 'LinkedIn/community networking and relationship building', group: 'hoa-marketing' },
  { name: 'hoa-email-campaigns', description: 'Email sequences — abandonment, post-consult, newsletter', group: 'hoa-marketing' },
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

  // ── Jake Marketing (14) — includes Steve-voice (cfo-*) agents ──
  { name: 'cfo-content-engine', description: 'Steve Pilcher voice content — LinkedIn posts, blogs, emails', group: 'jake-marketing' },
  { name: 'cfo-outreach-agent', description: 'Personalized cold emails to FL contractors (Vista/Sage/QBE)', group: 'jake-marketing' },
  { name: 'cfo-lead-scout', description: 'DBPR license scraper — discovers FL contractor leads', group: 'jake-marketing', special_handler: 'cfo_lead_scout' },
  { name: 'cfo-social-scheduler', description: 'Schedules and posts CFO marketing content to social platforms', group: 'jake-marketing' },
  { name: 'cfo-analytics-monitor', description: 'Tracks marketing analytics — open rates, click-through, conversions', group: 'jake-marketing' },
  { name: 'cfo-offer-proof-builder', description: 'Builds case studies and proof points from pilot results', group: 'jake-marketing' },
  { name: 'cfo-pilot-deliverer', description: 'Coordinates pilot delivery — Spend Leak, Close Accel, Get Paid Faster', group: 'jake-marketing' },
  { name: 'jake-content-engine', description: 'Jake-voice content — LinkedIn posts, blog articles, emails', group: 'jake-marketing' },
  { name: 'jake-outreach-agent', description: 'Personalized cold emails to construction SMBs nationally', group: 'jake-marketing' },
  { name: 'jake-lead-scout', description: 'National lead scout — finds named finance contacts at construction SMBs via LinkedIn/Facebook/web (rotates through 60 US markets)', group: 'jake-marketing', special_handler: 'jake_lead_scout' },
  { name: 'jake-contact-enricher', description: 'Playwright web scraper — finds emails for leads ($0/run)', group: 'jake-marketing', special_handler: 'jake_contact_enricher' },
  { name: 'jake-construction-discovery', description: 'Google Maps GC scraper — bulk construction company discovery across 60 national markets ($0/run, 50-150 companies per run)', group: 'jake-marketing', special_handler: 'jake_construction_discovery' },
  { name: 'jake-social-scheduler', description: 'Formats and schedules Jake content for social platforms', group: 'jake-marketing' },
  { name: 'jake-analytics-monitor', description: 'Daily pipeline health — leads, outreach, content performance', group: 'jake-marketing' },
  { name: 'jake-offer-proof-builder', description: 'Case studies, demo scripts, ROI calculators, proof materials', group: 'jake-marketing' },
  { name: 'jake-pilot-deliverer', description: 'Pilot delivery coordination — kickoff to results', group: 'jake-marketing' },
  { name: 'jake-follow-up-agent', description: 'Generates follow-up emails for leads contacted 5+ days ago with no reply', group: 'jake-marketing' },
  { name: 'jake-reply-classifier', description: 'Classifies inbound email replies (INTERESTED/NOT_NOW/WRONG_PERSON/UNSUBSCRIBE/BOUNCED) and updates lead status ($0/run)', group: 'jake-marketing', special_handler: 'jake_reply_classifier' },
  { name: 'jake-meeting-booker', description: 'Drafts personalized meeting confirmation + agenda email for interested leads', group: 'jake-marketing' },

  // ── Core Ops ──
  { name: 'pipeline-digest', description: 'Morning Discord digest — posts yesterday pipeline stats at 7 AM ($0/run)', group: 'core', special_handler: 'morning_digest' },

  // ── Tier 1: Social Publishing ──
  { name: 'jake-twitter-poster', description: 'Posts Jake-voice tweet threads from approved content pieces via openclaw-twitter extension', group: 'jake-marketing' },
  { name: 'linkedin-direct-poster', description: 'Posts Jake-voice LinkedIn long-form posts and short takes from approved content pieces', group: 'jake-marketing' },
  { name: 'sms-follow-up', description: 'Sends 1-2 sentence SMS via Twilio to enriched leads with phone after 10+ days no reply ($0.0075/sms)', group: 'jake-marketing' },

  // ── Tier 2: New Signal Sources ──
  { name: 'jake-permit-scanner', description: 'Scrapes county building permit portals for recently issued $250K+ commercial permits — GC lead source ($0/run)', group: 'jake-marketing', special_handler: 'jake_permit_scanner' },
  { name: 'jake-hiring-signal-agent', description: 'Monitors Indeed/LinkedIn Jobs for construction companies posting CFO/Controller/AP roles — high-intent leads', group: 'jake-marketing' },
  { name: 'hoa-special-assessment-monitor', description: 'Monitors FL Division of Condominiums and county records for newly filed special assessments and milestone failures', group: 'hoa-pipeline' },

  // ── Tier 3: Close Loops ──
  { name: 'jake-crm-sync', description: 'Pushes replied/meeting_booked/pilot leads to Google Sheets or CSV ($0/run)', group: 'jake-marketing', special_handler: 'jake_crm_sync' },
  { name: 'content-repurposer', description: 'Takes one approved blog/LinkedIn post and generates 5 derivative pieces (tweet thread, short LinkedIn, email snippet, FB, YouTube outline)', group: 'jake-marketing' },
  { name: 'jake-case-study-builder', description: 'Writes sanitized case studies from pilot leads — populates pilot_proof content pillar', group: 'jake-marketing' },

  // ── Tier 4: Creative Intel ──
  { name: 'competitor-intel', description: 'Monitors Procore/Sage/Vista/QB forums and review sites for construction finance complaints — surfaces high-intent leads', group: 'jake-marketing' },
  { name: 'jake-pain-signal-monitor', description: 'Scans public records for construction company financial stress signals (liens, judgments, BBB complaints)', group: 'jake-marketing' },
  { name: 'bid-result-scraper', description: 'Scrapes FL/TX procurement portals for recently awarded $500K+ construction contracts — GC lead source ($0/run)', group: 'jake-marketing', special_handler: 'jake_bid_scraper' },
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
