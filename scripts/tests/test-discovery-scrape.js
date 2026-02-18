#!/usr/bin/env node
/**
 * Quick live scrape test — runs ONE Google Maps query against South Florida.
 * Verifies Playwright is working and results flow into hoa_communities + Azure SQL.
 *
 * Usage: node scripts/test-discovery-scrape.js
 *
 * NOTE: This does a real scrape — expect 10-30 seconds and real results.
 */

const { processGeoTarget } = require('../server/services/googleMapsDiscovery');
const initSqlJs = require('sql.js');
const fs = require('fs');

(async () => {
  console.log('=== HOA Discovery — Live Scrape Test ===');
  console.log('Target: south-florida (1 geo-target, up to 162 queries)');
  console.log('');
  console.log('NOTE: This will scrape Google Maps. Expect 2-10 minutes.');
  console.log('      Press Ctrl+C to stop early.\n');

  const startedAt = Date.now();

  try {
    const result = await processGeoTarget('south-florida');

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    console.log('\n=== RESULTS ===');
    console.log(`Success:           ${result.success}`);
    console.log(`Geo-target:        ${result.geo_target}`);
    console.log(`Queries run:       ${result.queries_run}`);
    console.log(`Results found:     ${result.results_found}`);
    console.log(`New communities:   ${result.new_communities}`);
    console.log(`Updated:           ${result.updated_communities}`);
    console.log(`Mgmt companies:    ${result.management_companies}`);
    console.log(`Skipped:           ${result.skipped}`);
    console.log(`CAPTCHA hits:      ${result.captcha_hits}`);
    console.log(`Errors:            ${result.errors?.length || 0}`);
    console.log(`Azure run ID:      ${result.azure_run_id || 'none'}`);
    console.log(`Duration:          ${elapsed}s`);

    if (result.errors?.length > 0) {
      console.log('\nErrors:');
      result.errors.slice(0, 5).forEach(e => console.log(' -', e.query || '', e.error || e));
    }

    // Spot check SQLite
    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync('./hoa_leads.sqlite'));
    const stmt = db.prepare(
      "SELECT name, city, state, google_rating, source FROM hoa_communities WHERE source='google_maps' LIMIT 10"
    );
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    db.close();

    if (rows.length > 0) {
      console.log(`\nSample Google Maps communities in SQLite (${rows.length} shown):`);
      rows.forEach(r => console.log(`  ${r.name} — ${r.city}, ${r.state} (rating: ${r.google_rating || 'n/a'})`));
    } else {
      console.log('\nNo google_maps source records yet (CAPTCHA may have blocked scraping).');
    }

  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
