/**
 * Seed agent schedules into the database.
 * Run with: node scripts/seed-schedules.js
 */

const { initDatabase, run, get, all } = require('../server/db/connection');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

initDatabase(path.join(__dirname, '../data/clawops.db'));

setTimeout(() => {
  // Create schedules table if not exists
  run(`CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    agent_id TEXT NOT NULL,
    agent_name TEXT,
    cron_expression TEXT NOT NULL,
    message TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at TEXT,
    next_run_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  run(`CREATE INDEX IF NOT EXISTS idx_schedules_agent_id ON schedules(agent_id)`);
  run(`CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled)`);
  console.log('✅ schedules table ready');

  // Get all agents by openclaw_id
  const agents = all('SELECT id, name, config FROM agents');
  const byOpenClawId = {};
  agents.forEach(a => {
    try {
      const cfg = JSON.parse(a.config || '{}');
      if (cfg.openclaw_id) byOpenClawId[cfg.openclaw_id] = a;
    } catch (e) {}
  });
  console.log('Found agents:', Object.keys(byOpenClawId).join(', '));

  const schedules = [
    {
      name: 'Weekly Blog Post',
      description: 'Content Writer researches and writes one SEO-optimized blog post every Monday morning',
      openclaw_id: 'hoa-content-writer',
      cron: '0 9 * * 1',
      message: 'Research trending HOA financing topics and write one complete SEO-optimized blog post targeting HOA board members. Focus on topics like special assessments, reserve funding, or capital improvement projects. Save the completed post to the approved content directory.',
    },
    {
      name: 'Publish Approved Posts',
      description: 'CMS Publisher checks for approved blog posts and publishes them to hoaprojectfunding.com via Git/Netlify',
      openclaw_id: 'hoa-cms-publisher',
      cron: '0 11 * * 1',
      message: 'Check the approved content directory for new blog posts. Validate frontmatter and markdown formatting. Publish to hoaprojectfunding.com via Git commit and confirm the Netlify deploy succeeded.',
    },
    {
      name: 'Weekly Social Posts',
      description: 'Social Media creates Facebook and LinkedIn posts from the latest published blog post',
      openclaw_id: 'hoa-social-media',
      cron: '0 13 * * 1',
      message: 'Find the most recently published blog post on hoaprojectfunding.com. Create: (1) a Facebook company page post with link and CTA, (2) a Facebook group discussion post with no direct link, (3) a LinkedIn post. Tone: helpful and educational, never salesy. Primary CTA: loan application. Secondary CTA: free 15-min consult.',
    },
    {
      name: 'Daily Brand Monitoring',
      description: 'Social Engagement monitors LinkedIn and Facebook for comments, mentions, and messages',
      openclaw_id: 'hoa-social-engagement',
      cron: '0 8 * * 1-5',
      message: 'Monitor LinkedIn and Facebook for comments, mentions, and direct messages on HOA Project Funding posts. Score each interaction by lead quality. Draft professional responses to decision-makers (board members, property managers, CAMs). Flag any high-intent leads for immediate follow-up. Add all drafts to the engagement queue.',
    },
    {
      name: 'Community Scan — Morning',
      description: 'HOA Networker scans Reddit, Facebook groups, LinkedIn, and BiggerPockets for HOA financing discussions',
      openclaw_id: 'hoa-networker',
      cron: '0 9 * * *',
      message: 'Scan Reddit r/HOA, r/condoassociation, r/realestate, Facebook HOA board groups, LinkedIn property management groups, and BiggerPockets for posts mentioning: special assessment, reserve study, roof replacement, SIRS, SB 326, milestone inspection, underfunded reserves, or capital improvement. Draft 2-3 genuinely helpful expert responses. Add all drafts to the engagement queue for approval — never post directly.',
    },
    {
      name: 'Community Scan — Afternoon',
      description: 'Second daily Networker scan to catch afternoon activity on Reddit and Facebook',
      openclaw_id: 'hoa-networker',
      cron: '0 15 * * *',
      message: 'Scan Reddit r/HOA, r/condoassociation, r/realestate, Facebook HOA board groups, LinkedIn property management groups, and BiggerPockets for posts mentioning: special assessment, reserve study, roof replacement, SIRS, SB 326, milestone inspection, underfunded reserves, or capital improvement. Draft 2-3 genuinely helpful expert responses. Add all drafts to the engagement queue for approval — never post directly.',
    },
    {
      name: 'Weekly Email Follow-ups',
      description: 'Email Campaigns reviews contacts and sends abandonment, nurture, and newsletter sequences',
      openclaw_id: 'hoa-email-campaigns',
      cron: '0 9 * * 5',
      message: 'Review the contact list for: (1) incomplete application submissions needing abandonment sequence emails, (2) post-consultation contacts needing nurture sequence emails, (3) contacts due for the monthly newsletter. Draft the appropriate email for each contact. Helpful, low-pressure tone. Primary CTA: complete the loan application. Secondary CTA: free 15-minute consult.',
    },

    // ── Jake Marketing Pipeline ──
    {
      name: 'Jake Lead Scout — Daily National Rotation',
      description: 'Scouts one US metro per day for named finance contacts at construction companies. Rotates through 60 national markets over ~2 months.',
      openclaw_id: 'jake-lead-scout',
      cron: '0 7 * * 1-5',  // Mon-Fri 7 AM (weekdays only — avoids wasted runs on slow weekends)
      message: '{}',         // Empty = auto-rotation picks the next market
    },
    {
      name: 'Jake Contact Enricher — Daily',
      description: 'Enriches leads that have a name but no email via Playwright web scraping. Runs after lead scout.',
      openclaw_id: 'jake-contact-enricher',  // openclaw_id matches agent name in seed-all-agents.js
      cron: '30 8 * * 1-5', // Mon-Fri 8:30 AM — 90 min after scout finishes
      message: '{"limit":25,"min_score":45,"status_filter":"pending"}',
    },
    {
      name: 'Jake Follow-Up Agent — Wed & Fri',
      description: 'Generates follow-up emails for leads contacted 5+ days ago with no reply.',
      openclaw_id: 'jake-follow-up-agent',
      cron: '0 9 * * 3,5', // Wed + Fri 9 AM
      message: '{}',
    },

    // ── Tier 1: Social Publishing ──
    {
      name: 'Jake Twitter — Daily Post',
      description: 'Posts one Jake-voice tweet thread from approved content pieces Mon-Fri 8AM',
      openclaw_id: 'jake-twitter-poster',
      cron: '0 8 * * 1-5',
      message: '{}',
    },
    {
      name: 'LinkedIn Direct Post — Mon/Wed/Fri',
      description: 'Posts Jake-voice LinkedIn content (long-form Mon, short take Wed, case study Fri)',
      openclaw_id: 'linkedin-direct-poster',
      cron: '0 9 * * 1,3,5',
      message: '{}',
    },
    {
      name: 'SMS Follow-Up — Tue/Thu',
      description: "Sends SMS to enriched leads with phone who haven't replied in 10+ days",
      openclaw_id: 'sms-follow-up',
      cron: '0 10 * * 2,4',
      message: '{}',
    },

    // ── Tier 2: Signal Sources ──
    {
      name: 'Jake Hiring Signal — Mon/Thu',
      description: 'Scans Indeed/LinkedIn for construction companies posting CFO/Controller/AP roles',
      openclaw_id: 'jake-hiring-signal-agent',
      cron: '0 6 * * 1,4',
      message: '{}',
    },
    {
      name: 'HOA Special Assessment Monitor — Daily',
      description: 'Monitors FL Dept of Condominiums and county records for new special assessments',
      openclaw_id: 'hoa-special-assessment-monitor',
      cron: '0 6 * * 1-5',
      message: '{}',
    },

    // ── Tier 3: Close Loops ──
    {
      name: 'Jake CRM Sync — Daily',
      description: 'Pushes replied/meeting_booked/pilot leads to Google Sheets or CSV export',
      openclaw_id: 'jake-crm-sync',
      cron: '0 17 * * 1-5',
      message: '{}',
    },
    {
      name: 'Content Repurposer — Tue/Thu',
      description: 'Takes one approved post and generates 5 derivatives across platforms',
      openclaw_id: 'content-repurposer',
      cron: '0 10 * * 2,4',
      message: '{}',
    },

    // ── Tier 4: Intel ──
    {
      name: 'Competitor Intel — Mon/Wed',
      description: 'Monitors Procore/Sage/Vista/QB forums for construction finance complaints',
      openclaw_id: 'competitor-intel',
      cron: '0 7 * * 1,3',
      message: '{}',
    },
    {
      name: 'Jake Pain Signal Monitor — Mon/Thu',
      description: 'Scans public records for construction company financial stress signals',
      openclaw_id: 'jake-pain-signal-monitor',
      cron: '0 6 * * 1,4',
      message: '{}',
    },

    // ── Core Ops ──
    {
      name: 'Daily War Room Debrief',
      description: 'End-of-day summary — reviews all agent activity, leads, costs, and pipeline health.',
      openclaw_id: 'daily-debrief',
      cron: '0 18 * * 1-5', // Mon-Fri 6 PM
      message: '{}',
    },
    {
      name: 'Morning Pipeline Digest',
      description: 'Posts yesterday\'s pipeline stats to Discord at 7 AM: leads found, emails drafted/sent, reply rate, brain obs, cost.',
      openclaw_id: 'pipeline-digest',
      cron: '0 7 * * 1-5', // Mon-Fri 7 AM
      message: '{}',
    },
  ];

  let created = 0;
  let skipped = 0;

  schedules.forEach(s => {
    const agent = byOpenClawId[s.openclaw_id];
    if (!agent) {
      console.log('⚠️  Agent not found for openclaw_id:', s.openclaw_id);
      return;
    }

    // Skip if already exists
    const existing = get('SELECT id FROM schedules WHERE name = ? AND agent_id = ?', [s.name, agent.id]);
    if (existing) {
      console.log('⏭️  Already exists:', s.name);
      skipped++;
      return;
    }

    const id = uuidv4();
    run(
      'INSERT INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
      [id, s.name, s.description, agent.id, agent.name, s.cron, s.message]
    );
    console.log('✅ Created:', s.name, '→', agent.name, `[${s.cron}]`);
    created++;
  });

  console.log(`\nDone! Created: ${created}, Skipped: ${skipped}`);
  process.exit(0);
}, 1500);
