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

  // ── CFO Marketing (7) ──
  { name: 'cfo-content-engine', description: 'Steve Pilcher voice content — LinkedIn posts, blogs, emails', group: 'cfo-marketing' },
  { name: 'cfo-outreach-agent', description: 'Personalized cold emails to FL contractors (Vista/Sage/QBE)', group: 'cfo-marketing' },
  { name: 'cfo-lead-scout', description: 'DBPR license scraper — discovers FL contractor leads', group: 'cfo-marketing', special_handler: 'cfo_lead_scout' },
  { name: 'cfo-social-scheduler', description: 'Schedules and posts CFO marketing content to social platforms', group: 'cfo-marketing' },
  { name: 'cfo-analytics-monitor', description: 'Tracks marketing analytics — open rates, click-through, conversions', group: 'cfo-marketing' },
  { name: 'cfo-offer-proof-builder', description: 'Builds case studies and proof points from pilot results', group: 'cfo-marketing' },
  { name: 'cfo-pilot-deliverer', description: 'Coordinates pilot delivery — Spend Leak, Close Accel, Get Paid Faster', group: 'cfo-marketing' },

  // ── Jake Marketing (7) ──
  { name: 'jake-content-engine', description: 'Jake-voice content — LinkedIn posts, blog articles, emails', group: 'jake-marketing' },
  { name: 'jake-outreach-agent', description: 'Personalized cold emails to construction SMBs nationally', group: 'jake-marketing' },
  { name: 'jake-lead-scout', description: 'LLM-powered construction SMB lead discovery and qualification', group: 'jake-marketing' },
  { name: 'jake-social-scheduler', description: 'Formats and schedules Jake content for social platforms', group: 'jake-marketing' },
  { name: 'jake-analytics-monitor', description: 'Daily pipeline health — leads, outreach, content performance', group: 'jake-marketing' },
  { name: 'jake-offer-proof-builder', description: 'Case studies, demo scripts, ROI calculators, proof materials', group: 'jake-marketing' },
  { name: 'jake-pilot-deliverer', description: 'Pilot delivery coordination — kickoff to results', group: 'jake-marketing' },
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
