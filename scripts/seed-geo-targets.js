#!/usr/bin/env node
/**
 * Seed Geo-Targets
 *
 * Loads geo-targets from config/geo-targets.json into hoa_leads.sqlite.
 * Safe to run multiple times — uses INSERT OR REPLACE.
 *
 * Usage: node scripts/seed-geo-targets.js
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.resolve('./hoa_leads.sqlite');
const CONFIG_PATH = path.resolve('./config/geo-targets.json');

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const targets = config.geo_targets;

  let inserted = 0, updated = 0;

  for (const target of targets) {
    const states = [...new Set(target.cities.map(c => c.state))];
    try {
      db.run(
        `INSERT INTO geo_targets (id, name, cities, states, zip_codes, is_active, priority, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           cities = excluded.cities,
           zip_codes = excluded.zip_codes,
           priority = excluded.priority,
           notes = excluded.notes,
           updated_at = CURRENT_TIMESTAMP`,
        [
          target.id,
          target.name,
          JSON.stringify(target.cities),
          JSON.stringify(states),
          JSON.stringify(target.zip_codes || []),
          target.priority,
          target.notes || null,
        ]
      );
      console.log(`  ✓ ${target.name} (priority ${target.priority}, ${target.cities.length} cities)`);
      inserted++;
    } catch (e) {
      console.error(`  ✗ ${target.name}: ${e.message}`);
    }
  }

  // Save
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

  // Summary
  const summary = db.exec('SELECT COUNT(*) FROM geo_targets WHERE is_active = 1');
  const pending = db.exec('SELECT COUNT(*) FROM geo_targets WHERE last_sweep_at IS NULL');
  console.log(`\n✅ Seeded ${inserted} geo-targets`);
  console.log(`   Total active: ${summary[0]?.values[0][0]}`);
  console.log(`   Never searched: ${pending[0]?.values[0][0]}`);
  console.log(`\n🚀 Ready to run HOA Google Maps Discovery agent!`);

  db.close();
})();
