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
