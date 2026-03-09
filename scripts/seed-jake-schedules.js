/**
 * Seed Jake marketing pipeline schedules.
 * Run: node scripts/seed-jake-schedules.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { get, run, initDatabase } = require('../server/db/connection');
const { v4: uuidv4 } = require('uuid');

const SCHEDULES = [
  {
    name: 'Jake Contact Enricher — Daily',
    description: 'Enriches leads with missing emails via Playwright web scraping. Runs 90 min after lead scout.',
    agent_name: 'jake-contact-enricher',
    cron: '30 8 * * 1-5',
    message: '{"limit":25,"min_score":45,"status_filter":"pending"}',
  },
  {
    name: 'Urgency Scorer — Monday 6 AM',
    description: 'Scores all leads 0-100 by Fit/Pain/Timeliness/Enrichment. Dual-product (Jake + HOA). $0/run.',
    agent_name: 'urgency-scorer',
    cron: '0 6 * * 1',
    message: '{"limit":300,"product":"both"}',
  },
  {
    name: 'Pipeline State Tracker — Daily 1 AM',
    description: 'Recomputes pipeline_stage for every active lead. Flags stalled leads. Posts Discord alert. $0/run.',
    agent_name: 'pipeline-state-tracker',
    cron: '0 1 * * *',
    message: '{"product":"both"}',
  },
  {
    name: 'Pipeline Director — Weekdays 6:30 AM',
    description: 'Dispatches next actions (enrich, dossier, outreach, follow-up) for all ready leads. $0 base + LLM for outreach.',
    agent_name: 'pipeline-director',
    cron: '30 6 * * 1-5',
    message: '{}',
  },
  {
    name: 'Tenacity Cadence Engine — Mon/Wed/Fri 9 AM',
    description: 'Adaptive multi-touch cadence: finds leads with cadence_active=1 and next_touch_due <= now, queues outreach/follow-up runs. Dual-product (Jake + HOA). $0/run base.',
    agent_name: 'tenacity-cadence-engine',
    cron: '0 9 * * 1,3,5',
    message: '{"product":"both"}',
  },
];

async function main() {
  await initDatabase();

  let created = 0;
  let skipped = 0;

  for (const s of SCHEDULES) {
    const agent = get('SELECT id, name FROM agents WHERE name = ?', [s.agent_name]);
    if (!agent) {
      console.log('Agent not found:', s.agent_name);
      continue;
    }

    const existing = get('SELECT id FROM schedules WHERE name = ? AND agent_id = ?', [s.name, agent.id]);
    if (existing) {
      console.log('Already exists:', s.name);
      skipped++;
      continue;
    }

    const id = uuidv4();
    run(
      'INSERT INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
      [id, s.name, s.description, agent.id, agent.name, s.cron, s.message]
    );
    console.log('Created:', s.name, '->', agent.name, '[' + s.cron + ']');
    created++;
  }

  console.log('Done. Created:', created, 'Skipped:', skipped);
}

main().catch(console.error);
