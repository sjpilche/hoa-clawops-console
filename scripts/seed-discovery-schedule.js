#!/usr/bin/env node
/**
 * Seed the weekly schedule for hoa-discovery agent.
 * Runs Monday 6:00 AM — before the content writer (8 AM) and publisher (8:30 AM).
 */

const { run, get, all, initDatabase } = require('../server/db/connection');
const crypto = require('crypto');

(async () => {
  await initDatabase();

  const id = crypto.randomUUID();

  run(
    `INSERT OR REPLACE INTO schedules
       (id, name, description, agent_id, agent_name, cron_expression, message, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
    [
      id,
      'HOA Google Maps Discovery',
      'Weekly geo-targeted Google Maps scrape — discovers HOA communities for the pipeline (Agents 2-5). Cost: $0/run.',
      'hoa-discovery',
      'HOA Google Maps Discovery',
      '0 6 * * 1',   // Monday 6:00 AM
      JSON.stringify({ limit: 1, geo_target_id: null }),
    ]
  );

  const saved = get('SELECT id, name, cron_expression, agent_id, enabled FROM schedules WHERE id = ?', [id]);
  console.log('✅ Schedule created:', JSON.stringify(saved, null, 2));

  console.log('\nAll HOA schedules:');
  const rows = all(`SELECT name, cron_expression, enabled FROM schedules WHERE agent_id LIKE '%hoa%' ORDER BY name`);
  rows.forEach(s => console.log(`  ${s.name} | ${s.cron_expression} | enabled: ${s.enabled}`));

  console.log('\n✅ Discovery agent will run every Monday at 6:00 AM');
  console.log('   View at: http://localhost:5174/schedule');
})();
