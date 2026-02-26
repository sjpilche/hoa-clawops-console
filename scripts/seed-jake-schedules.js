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
