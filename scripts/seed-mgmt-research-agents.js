/**
 * @file seed-mgmt-research-agents.js
 * @description Register 5 Management Company Research agents + 2 schedules in ClawOps Console
 *
 * Agents:
 *   Agent 40: CAI Directory Scraper (mgmt_cai_scraper) — runs first
 *   Agent 36: Portfolio Scraper (mgmt_portfolio_scraper)
 *   Agent 37: Contact Puller (mgmt_contact_puller)
 *   Agent 38: Portfolio Mapper (mgmt_portfolio_mapper)
 *   Agent 39: Review Scanner (mgmt_review_scanner) — THE MONEY AGENT
 *
 * Schedules:
 *   Agent 39: Daily 4am — batch review scan
 *   Agent 40: Weekly Sunday 1am — CAI directory refresh
 *
 * All agents are $0 cost — Playwright + deterministic Node.js, no LLM calls.
 *
 * Usage: node scripts/seed-mgmt-research-agents.js
 */

const { run, get, initDatabase } = require('../server/db/connection');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const AGENTS = [
  {
    id: 'mgmt-cai-scraper',
    name: 'CAI Directory Scraper',
    description: 'Agent 40: Scrapes CAI chapter directories to build the master list of management companies. Runs first — feeds Agents 36-39. $0 cost.',
    config: {
      special_handler: 'mgmt_cai_scraper',
      soul_path: 'openclaw-skills/mgmt-cai-scraper/SOUL.md',
      cost_per_run: 0,
      pipeline_order: 1,
      default_params: {
        target_states: 'FL, CA, CO',
      },
    },
    soulDir: 'mgmt-cai-scraper',
  },
  {
    id: 'mgmt-portfolio-scraper',
    name: 'Mgmt Portfolio Scraper',
    description: 'Agent 36: Crawls management company websites to extract their HOA client portfolio. $0 cost.',
    config: {
      special_handler: 'mgmt_portfolio_scraper',
      soul_path: 'openclaw-skills/mgmt-portfolio-scraper/SOUL.md',
      cost_per_run: 0,
      pipeline_order: 2,
    },
    soulDir: 'mgmt-portfolio-scraper',
  },
  {
    id: 'mgmt-contact-puller',
    name: 'Mgmt Contact Puller',
    description: 'Agent 37: Extracts decision-maker contacts, vendor portals, and email patterns from management company websites. $0 cost.',
    config: {
      special_handler: 'mgmt_contact_puller',
      soul_path: 'openclaw-skills/mgmt-contact-puller/SOUL.md',
      cost_per_run: 0,
      pipeline_order: 3,
    },
    soulDir: 'mgmt-contact-puller',
  },
  {
    id: 'mgmt-portfolio-mapper',
    name: 'Mgmt Portfolio Mapper',
    description: 'Agent 38: Uses Google Search to discover HOAs managed by a company that aren\'t on their website. Finds the other 25-50%. $0 cost.',
    config: {
      special_handler: 'mgmt_portfolio_mapper',
      soul_path: 'openclaw-skills/mgmt-portfolio-mapper/SOUL.md',
      cost_per_run: 0,
      pipeline_order: 4,
    },
    soulDir: 'mgmt-portfolio-mapper',
  },
  {
    id: 'mgmt-review-scanner',
    name: 'Mgmt Review Scanner',
    description: 'Agent 39: THE MONEY AGENT — Scans Google Maps reviews for management companies to identify struggling HOAs with deferred maintenance. $0 cost.',
    config: {
      special_handler: 'mgmt_review_scanner',
      soul_path: 'openclaw-skills/mgmt-review-scanner/SOUL.md',
      cost_per_run: 0,
      pipeline_order: 5,
      default_params: {
        min_signal_score: 5,
        max_reviews: 100,
        batch_size: 5,
      },
    },
    soulDir: 'mgmt-review-scanner',
  },
];

const SCHEDULES = [
  {
    id: uuidv4(),
    name: 'Mgmt Review Scan (Daily)',
    agent_id: 'mgmt-review-scanner',
    cron_expression: '0 4 * * *',  // Daily at 4am
    message: '{"batch_size": 5}',
    enabled: 1,
  },
  {
    id: uuidv4(),
    name: 'CAI Directory Refresh (Weekly)',
    agent_id: 'mgmt-cai-scraper',
    cron_expression: '0 1 * * 0',  // Sunday at 1am
    message: '{"target_states": "FL, CA, CO"}',
    enabled: 1,
  },
];

async function seed() {
  console.log('\n=== SEED: Management Company Research Agents ===\n');
  console.log('='.repeat(60));

  try {
    await initDatabase();
    console.log('Database initialized\n');

    // ── Seed Agents ────────────────────────────────────────────────────────
    let created = 0;
    let skipped = 0;

    for (const agent of AGENTS) {
      const existing = get('SELECT id FROM agents WHERE id = ?', [agent.id]);
      if (existing) {
        console.log(`  SKIP  ${agent.id} (already exists)`);
        skipped++;
        continue;
      }

      // Read SOUL.md
      let instructions = '';
      const soulPath = path.join(__dirname, '..', 'openclaw-skills', agent.soulDir, 'SOUL.md');
      if (fs.existsSync(soulPath)) {
        instructions = fs.readFileSync(soulPath, 'utf-8');
      }

      run(`
        INSERT INTO agents (id, name, description, status, config, instructions, last_run_at, created_at)
        VALUES (?, ?, ?, 'idle', ?, ?, NULL, CURRENT_TIMESTAMP)
      `, [agent.id, agent.name, agent.description, JSON.stringify(agent.config), instructions]);

      console.log(`  CREATE  ${agent.id} — ${agent.name}`);
      created++;
    }

    console.log(`\nAgents: ${created} created, ${skipped} skipped\n`);

    // ── Seed Schedules ─────────────────────────────────────────────────────
    let schedCreated = 0;
    let schedSkipped = 0;

    for (const sched of SCHEDULES) {
      // Check if a schedule for this agent already exists
      const existing = get('SELECT id FROM schedules WHERE agent_id = ? AND name = ?', [sched.agent_id, sched.name]);
      if (existing) {
        console.log(`  SKIP  ${sched.name} (already exists)`);
        schedSkipped++;
        continue;
      }

      run(`
        INSERT INTO schedules (id, name, agent_id, cron_expression, message, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [sched.id, sched.name, sched.agent_id, sched.cron_expression, sched.message, sched.enabled]);

      console.log(`  CREATE  ${sched.name} (${sched.cron_expression})`);
      schedCreated++;
    }

    console.log(`\nSchedules: ${schedCreated} created, ${schedSkipped} skipped\n`);

    // ── Verify ─────────────────────────────────────────────────────────────
    console.log('='.repeat(60));
    console.log('VERIFICATION\n');

    for (const agent of AGENTS) {
      const row = get('SELECT id, name, status FROM agents WHERE id = ?', [agent.id]);
      if (row) {
        console.log(`  [OK] ${row.id} — ${row.name} (${row.status})`);
      } else {
        console.log(`  [FAIL] ${agent.id} not found!`);
      }
    }

    console.log('');

    for (const sched of SCHEDULES) {
      const row = get('SELECT id, name, enabled FROM schedules WHERE agent_id = ?', [sched.agent_id]);
      if (row) {
        console.log(`  [OK] ${row.name} (enabled: ${row.enabled})`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('NEXT STEPS');
    console.log('='.repeat(60));
    console.log('1. Restart server: npm run dev');
    console.log('2. Open UI: http://localhost:5174/agents');
    console.log('3. Navigate to: http://localhost:5174/mgmt-research');
    console.log('4. Run Agent 40 (CAI Scraper) first — it feeds the pipeline');
    console.log('5. Then run Agents 36-39 on discovered companies');
    console.log('6. All agents are $0 cost — Playwright + Node.js only\n');

    process.exit(0);
  } catch (error) {
    console.error('\nSEED FAILED:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

seed();
