#!/usr/bin/env node
/**
 * Seed daily discovery schedules — runs 2 geo-targets per day.
 * Morning run: 6:00 AM every day
 * Evening run: 6:00 PM every day
 *
 * With 19 geo-targets at 2/day = all markets covered in ~10 days,
 * then cycles back (South Florida first again, oldest sweep first).
 */

const { run, get, all, initDatabase } = require('../server/db/connection');
const crypto = require('crypto');

(async () => {
  await initDatabase();

  const schedules = [
    {
      name: 'HOA Discovery — Morning Run',
      description: 'Daily 6 AM Google Maps discovery. Picks the next unswept geo-target automatically. Cost: $0/run.',
      cron: '0 6 * * *',    // Every day 6:00 AM
      label: 'morning',
    },
    {
      name: 'HOA Discovery — Evening Run',
      description: 'Daily 6 PM Google Maps discovery. Picks the next unswept geo-target automatically. Cost: $0/run.',
      cron: '0 18 * * *',   // Every day 6:00 PM
      label: 'evening',
    },
  ];

  // Remove old single-schedule entry if it exists
  run(`DELETE FROM schedules WHERE name = 'HOA Google Maps Discovery'`);

  for (const s of schedules) {
    // Use deterministic IDs so re-running this script is idempotent
    const id = `hoa-discovery-${s.label}`;
    run(
      `INSERT OR REPLACE INTO schedules
         (id, name, description, agent_id, agent_name, cron_expression, message, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
      [
        id,
        s.name,
        s.description,
        'hoa-discovery',
        'HOA Google Maps Discovery',
        s.cron,
        JSON.stringify({ limit: 1, geo_target_id: null }),  // auto-picks next unswept target
      ]
    );
    const saved = get('SELECT id, name, cron_expression, enabled FROM schedules WHERE id = ?', [id]);
    console.log(`✅ ${saved.name} | ${saved.cron_expression}`);
  }

  console.log('\nAll HOA discovery schedules:');
  const rows = all(
    `SELECT name, cron_expression, enabled FROM schedules WHERE agent_id = 'hoa-discovery' ORDER BY name`
  );
  rows.forEach(s => console.log(`  ${s.enabled ? '✅' : '⏸'} ${s.name} — ${s.cron_expression}`));

  console.log('\n2 runs/day × 19 geo-targets = full coverage every ~10 days.');
  console.log('View schedules: http://localhost:5174/schedule');
})();
