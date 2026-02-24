/**
 * Seed management_companies table from config/mgmt-company-targets.json.
 * These 20 pre-researched companies form the initial pipeline — CAI scraper
 * will supplement later when we get chapter credentials.
 *
 * Usage: node scripts/seed-mgmt-targets.js
 */
const { v4: uuidv4 } = require('uuid');
const { run, get, all, initDatabase } = require('../server/db/connection');
const targets = require('../config/mgmt-company-targets.json');

(async () => {
  console.log('\n=== SEED: Management Company Targets ===\n');
  await initDatabase();

  let created = 0;
  let skipped = 0;

  for (const t of targets.targets) {
    // Check if already exists
    const existing = get(
      `SELECT id FROM management_companies WHERE LOWER(name) = LOWER(?)`,
      [t.name]
    );
    if (existing) {
      console.log(`  SKIP  ${t.name} (already in DB)`);
      skipped++;
      continue;
    }

    const id = uuidv4();
    const primaryState = t.states[0] || 'FL';
    const isAAMC = t.notes && t.notes.includes('AAMC');
    const tier = isAAMC ? 'AAMC_TOP' : 'MEMBER';

    run(`
      INSERT INTO management_companies (
        id, name, website_url, website, communities_managed,
        state, service_states, priority_tier, source,
        portfolio_scraped, contacts_pulled, portfolio_mapped, reviews_scanned,
        discovered_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'target_list', 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [
      id, t.name, t.website, t.website, t.est_communities,
      primaryState, JSON.stringify(t.states), tier,
    ]);

    console.log(`  CREATE  ${t.name} — ${tier} — ${t.est_communities} communities — ${t.states.join(', ')}`);
    created++;
  }

  console.log(`\nResult: ${created} created, ${skipped} skipped`);

  // Verify
  const total = get('SELECT COUNT(*) as count FROM management_companies');
  const queued = get(`SELECT COUNT(*) as count FROM management_companies WHERE portfolio_scraped = 0`);
  console.log(`\nTotal companies in DB: ${total.count}`);
  console.log(`Queued for pipeline:   ${queued.count}`);
  console.log('\nDone!\n');

  process.exit(0);
})().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
